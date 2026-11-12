#if !canImport(ElevenLabs)
import SwiftUI
import AVFoundation
import Combine

// Push-to-talk voice chat without third-party SDKs.
// Audio is recorded only while the person taps "Sprechen", kept in memory (never written to disk),
// sent once over HTTPS to the project server (speech-to-text), the recognized text goes through the
// existing building assistant, and the answer may be read aloud via the server's text-to-speech.
// No live streaming: each step waits for the complete server response and the UI says so.

/// Records microphone audio and converts it to 16 kHz mono 16-bit PCM, the format the server accepts.
/// Runs outside the main actor because AVAudioEngine delivers buffers on its own audio thread.
nonisolated final class PCMVoiceRecorder: @unchecked Sendable {
    static let sampleRate = 16_000.0
    static let maxBytes = 960_000          // 30 s at 32 000 bytes/s, the server limit
    static let minBytes = 3_200            // 0.1 s, the server minimum
    private let engine = AVAudioEngine()
    private let lock = NSLock()
    private var pcm = Data()
    private var converter: AVAudioConverter?
    private var running = false
    private let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: PCMVoiceRecorder.sampleRate, channels: 1, interleaved: true)!
    var onLevel: (@Sendable (Double) -> Void)?
    var onLimit: (@Sendable () -> Void)?

    func start() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0, let converter = AVAudioConverter(from: format, to: target) else {
            throw APIError(status: 0, message: "Kein Mikrofon verfügbar.")
        }
        lock.lock(); pcm = Data(); pcm.reserveCapacity(Self.maxBytes); self.converter = converter; running = true; lock.unlock()
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in self?.process(buffer) }
        engine.prepare()
        do { try engine.start() } catch { input.removeTap(onBus: 0); throw error }
    }

    /// Stops recording and returns the raw PCM bytes collected so far.
    func stop() -> Data {
        lock.lock(); let wasRunning = running; running = false; lock.unlock()
        if wasRunning { engine.inputNode.removeTap(onBus: 0); engine.stop() }
        lock.lock(); defer { lock.unlock() }
        let result = pcm; pcm = Data(); converter = nil
        return result
    }

    private func process(_ buffer: AVAudioPCMBuffer) {
        onLevel?(Self.level(of: buffer))
        lock.lock(); let converter = self.converter; let active = running; lock.unlock()
        guard active, let converter else { return }
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * target.sampleRate / buffer.format.sampleRate) + 64
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
        var supplied = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true; status.pointee = .haveData; return buffer
        }
        guard error == nil, output.frameLength > 0, let channel = output.int16ChannelData else { return }
        let bytes = Data(bytes: channel[0], count: Int(output.frameLength) * 2)
        lock.lock()
        let room = Self.maxBytes - pcm.count
        if room > 0 { pcm.append(bytes.prefix(room)) }
        let full = pcm.count >= Self.maxBytes
        lock.unlock()
        if full { onLimit?() }
    }

    /// Real input loudness mapped to 0...1 (−50 dB … 0 dB). Drives the animation; nothing is invented.
    static func level(of buffer: AVAudioPCMBuffer) -> Double {
        guard let data = buffer.floatChannelData, buffer.frameLength > 0 else { return 0 }
        let samples = UnsafeBufferPointer(start: data[0], count: Int(buffer.frameLength))
        let rms = sqrt(samples.reduce(0) { $0 + Double($1) * Double($1) } / Double(samples.count))
        let db = 20 * log10(max(rms, 0.000_001))
        return min(1, max(0, (db + 50) / 50))
    }

    /// Wraps PCM bytes in a minimal RIFF/WAVE header (PCM, 16 kHz, mono, 16 bit).
    static func wav(_ pcm: Data) -> Data {
        var data = Data(capacity: pcm.count + 44)
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
        data.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + pcm.count)); data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(16_000); u32(32_000); u16(2); u16(16)
        data.append(contentsOf: Array("data".utf8)); u32(UInt32(pcm.count)); data.append(pcm)
        return data
    }
}

@MainActor final class BuildingVoiceChat: ObservableObject {
    enum Phase: Equatable { case idle, listening, transcribing, thinking, speaking }
    struct Turn: Identifiable { let id = UUID(); let question: String; var answer: String? }
    private struct VoiceStatus: Decodable { let enabled: Bool; let max_seconds: Int? }
    private struct AssistantInfo: Decodable { let enabled: Bool; let context_hash: String }

    @Published var phase: Phase = .idle
    @Published var level: Double = 0
    @Published var problem: String?
    @Published var turns: [Turn] = []
    @Published var available: Bool?
    @Published var elapsed: Double = 0
    let maxSeconds = 30.0

    private let recorder = PCMVoiceRecorder()
    private var work: Task<Void, Never>?
    private var ticker: Task<Void, Never>?
    private var player: AVAudioPlayer?
    private var startedAt = Date()

    var isBusy: Bool { phase == .transcribing || phase == .thinking }

    var title: String {
        switch phase {
        case .idle: turns.isEmpty ? "Frag dein Gebäude" : "Bereit für die nächste Frage"
        case .listening: "Ich höre zu"
        case .transcribing: "Sprache wird erkannt …"
        case .thinking: "Antwort wird erstellt …"
        case .speaking: "Antwort wird vorgelesen"
        }
    }

    func checkAvailability(account: AccountModel, building: Building) async {
        await account.refreshAIPreferences()
        do {
            let status: VoiceStatus = try await account.request("buildings/\(building.id)/voice")
            available = status.enabled
        } catch { available = false; problem = error.localizedDescription }
    }

    func startListening() {
        guard phase == .idle else { return }
        problem = nil
        work = Task { [weak self] in
            guard let self else { return }
            let permitted = await AVAudioApplication.requestRecordPermission()
            guard !Task.isCancelled else { return }
            guard permitted else { self.problem = "Bitte erlaube den Mikrofonzugriff unter Einstellungen → KI trifft Gebäude."; return }
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
                try session.setActive(true)
                weak let owner = self
                self.recorder.onLevel = { value in Task { @MainActor in if owner?.phase == .listening { owner?.level = value } } }
                self.recorder.onLimit = { Task { @MainActor in owner?.finishListening() } }
                try self.recorder.start()
                self.startedAt = Date(); self.elapsed = 0; self.phase = .listening
                self.ticker = Task { [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .milliseconds(200))
                        guard let self, self.phase == .listening else { return }
                        self.elapsed = min(self.maxSeconds, Date().timeIntervalSince(self.startedAt))
                    }
                }
            } catch {
                _ = self.recorder.stop(); self.deactivateSession()
                self.problem = "Die Aufnahme konnte nicht starten: \(error.localizedDescription)"
            }
        }
    }

    /// Stops recording and runs the one-shot pipeline: transcribe → assistant → optional read-aloud.
    func finishListening(account: AccountModel? = nil, building: Building? = nil, readAloud: Bool = true) {
        guard phase == .listening else { return }
        ticker?.cancel(); ticker = nil
        let pcm = recorder.stop(); level = 0
        guard let account = account ?? pendingAccount, let building = building ?? pendingBuilding else { phase = .idle; deactivateSession(); return }
        guard pcm.count >= PCMVoiceRecorder.minBytes else { phase = .idle; deactivateSession(); problem = "Die Aufnahme war zu kurz."; return }
        let speak = pendingReadAloud ?? readAloud
        phase = .transcribing
        work = Task { [weak self] in
            guard let self else { return }
            do {
                let question = try await account.transcribeVoice(buildingID: building.id, data: PCMVoiceRecorder.wav(pcm), requestID: UUID())
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !Task.isCancelled else { return }
                guard !question.isEmpty else { throw APIError(status: 0, message: "Es wurde keine Sprache erkannt. Bitte noch einmal versuchen.") }
                self.turns.append(Turn(question: question)); let index = self.turns.count - 1
                self.phase = .thinking
                let info: AssistantInfo = try await account.request("buildings/\(building.id)/assistant")
                guard info.enabled else { throw APIError(status: 503, message: "Der Assistent ist gerade nicht verfügbar.") }
                let body: [String: Any] = ["question": question, "consent": "yes", "context_hash": info.context_hash, "chat": true]
                let answer: AssistantAnswer = try await account.request("buildings/\(building.id)/assistant", method: "POST", body: body, headers: ["X-Request-ID": UUID().uuidString], timeout: 45)
                guard !Task.isCancelled else { return }
                if self.turns.indices.contains(index) { self.turns[index].answer = answer.answer }
                if speak { try await self.play(answer.answer, account: account, building: building) }
                self.phase = .idle; self.deactivateSession()
            } catch {
                guard !Task.isCancelled else { return }
                self.phase = .idle; self.level = 0; self.deactivateSession()
                self.problem = error.localizedDescription
            }
        }
    }

    private func play(_ answer: String, account: AccountModel, building: Building) async throws {
        let text = String(answer.prefix(1200))
        let audio = try await account.speakVoice(buildingID: building.id, text: text, requestID: UUID())
        guard !Task.isCancelled else { return }
        let player = try AVAudioPlayer(data: audio)
        player.isMeteringEnabled = true
        self.player = player
        phase = .speaking
        guard player.play() else { throw APIError(status: 0, message: "Die Antwort konnte nicht abgespielt werden.") }
        while player.isPlaying && !Task.isCancelled {
            player.updateMeters()
            level = min(1, max(0, (Double(player.averagePower(forChannel: 0)) + 45) / 45))
            try? await Task.sleep(for: .milliseconds(33))
        }
        player.stop(); self.player = nil; level = 0
    }

    func stopSpeaking() { player?.stop() }

    /// Cancels everything immediately: recording, pending requests and playback.
    func cancel() {
        work?.cancel(); work = nil; ticker?.cancel(); ticker = nil
        _ = recorder.stop(); player?.stop(); player = nil
        phase = .idle; level = 0; deactivateSession()
    }

    private func deactivateSession() { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }

    // Context for auto-stop at the 30-second limit.
    var pendingAccount: AccountModel?
    var pendingBuilding: Building?
    var pendingReadAloud: Bool?
}

struct BuildingVoiceView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @StateObject private var voice = BuildingVoiceChat()
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("d21.voice.readAloud") private var readAloud = true
    @State private var showConsent = false
    @State private var showInfo = false
    private var consentKey: String { "d21.voice.consent.\(account.user?.id ?? -1)" }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                VStack(spacing: 6) {
                    Text(building.name).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                    Text(voice.title).font(.system(.title2, design: .rounded, weight: .bold)).multilineTextAlignment(.center)
                        .contentTransition(.opacity).accessibilityAddTraits(.updatesFrequently)
                }.padding(.top, 8)

                VoiceOrb(phase: voice.phase, level: voice.level).frame(height: 250).accessibilityHidden(true)

                if voice.phase == .listening {
                    Text("\(Int(voice.elapsed)) s von \(Int(voice.maxSeconds)) s").font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
                }
                controls
                if let problem = voice.problem {
                    Label(problem, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.orange).multilineTextAlignment(.leading)
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 18)
                }
                if !voice.turns.isEmpty { transcript }
                Toggle(isOn: $readAloud) { Label("Antworten vorlesen", systemImage: "speaker.wave.2") }
                    .tint(d21Accent).padding(14).d21Card(cornerRadius: 18).disabled(voice.phase != .idle)
                Button { showInfo = true } label: { Label("Was passiert mit meiner Stimme?", systemImage: "lock.shield") }.font(.footnote)
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .task { await voice.checkAvailability(account: account, building: building) }
        .onChange(of: scenePhase) { _, phase in if phase != .active { voice.cancel() } }
        .onChange(of: account.user?.id) { _, _ in voice.cancel() }
        .onDisappear { voice.cancel() }
        .sheet(isPresented: $showConsent) { VoiceConsentSheet { UserDefaults.standard.set(true, forKey: consentKey); showConsent = false; begin() } }
        .sheet(isPresented: $showInfo) { VoiceConsentSheet(infoOnly: true) { showInfo = false } }
    }

    @ViewBuilder private var controls: some View {
        if !account.aiPreferences.active {
            VStack(spacing: 10) {
                Text("Für den Sprachchat muss KI in deinem Profil freigegeben sein.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                NavigationLink { AISettingsView(account: account) } label: { Label("KI-Einstellungen öffnen", systemImage: "sparkles") }.buttonStyle(.borderedProminent).tint(d21Accent)
            }
        } else if voice.available == false {
            VStack(spacing: 10) {
                Text("Der Sprachdienst ist auf diesem Server gerade nicht eingerichtet. Der Textassistent funktioniert weiter.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                Button("Erneut prüfen", systemImage: "arrow.clockwise") { Task { await voice.checkAvailability(account: account, building: building) } }.buttonStyle(.bordered)
            }
        } else {
            VStack(spacing: 10) {
                Button(action: primaryAction) {
                    ZStack {
                        Circle().fill(buttonColor.gradient).frame(width: 78, height: 78).shadow(color: buttonColor.opacity(0.35), radius: 14, y: 6)
                        if voice.isBusy { ProgressView().tint(.white).controlSize(.large) }
                        else { Image(systemName: buttonSymbol).font(.system(size: 30, weight: .semibold)).foregroundStyle(.white).contentTransition(.symbolEffect(.replace)) }
                    }
                }.buttonStyle(BuildingTileButtonStyle()).disabled(voice.isBusy || voice.available == nil)
                    .accessibilityLabel(buttonLabel)
                Text(buttonLabel).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                if voice.isBusy { Button("Abbrechen", role: .cancel) { voice.cancel() }.font(.footnote) }
            }
        }
    }

    private var transcript: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(voice.turns) { turn in
                HStack { Spacer(minLength: 40); Text(turn.question).padding(.horizontal, 14).padding(.vertical, 10).background(d21Accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous)) }
                if let answer = turn.answer {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "sparkles").foregroundStyle(d21Accent).frame(width: 28, height: 28).background(d21Accent.opacity(0.12), in: Circle())
                        Text(answer).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            Text("Erkannter Text und Antworten stehen auch im KI-Chat dieses Gebäudes. KI-Antworten können fehlerhaft sein.").font(.caption2).foregroundStyle(.secondary)
        }.font(.subheadline).padding(16).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 22)
    }

    private var buttonSymbol: String { voice.phase == .listening ? "stop.fill" : voice.phase == .speaking ? "speaker.slash.fill" : "mic.fill" }
    private var buttonColor: Color { voice.phase == .listening ? .red : voice.phase == .speaking ? .orange : d21Accent }
    private var buttonLabel: String {
        switch voice.phase {
        case .listening: "Tippen zum Senden"
        case .speaking: "Vorlesen stoppen"
        case .transcribing, .thinking: "Bitte warten …"
        case .idle: "Tippen und sprechen"
        }
    }

    private func primaryAction() {
        switch voice.phase {
        case .listening: voice.finishListening(account: account, building: building, readAloud: readAloud)
        case .speaking: voice.stopSpeaking()
        case .idle: UserDefaults.standard.bool(forKey: consentKey) ? begin() : (showConsent = true)
        default: break
        }
    }

    private func begin() {
        voice.pendingAccount = account; voice.pendingBuilding = building; voice.pendingReadAloud = readAloud
        voice.startListening()
    }
}

/// Explains, before the first recording, exactly what leaves the phone.
struct VoiceConsentSheet: View {
    var infoOnly = false
    let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Image(systemName: "waveform.badge.mic").font(.system(size: 44)).foregroundStyle(d21Accent)
                    Text("So funktioniert der Sprachchat").font(.title2.bold())
                    row("mic", "Aufnahme nur auf Tipp", "Das Mikrofon läuft nur, solange du sprichst – höchstens 30 Sekunden. Nichts läuft im Hintergrund.")
                    row("memorychip", "Nicht auf dem iPhone gespeichert", "Die Aufnahme bleibt nur im Arbeitsspeicher und wird nach dem Senden verworfen.")
                    row("lock.fill", "Verschlüsselt übertragen", "Die Aufnahme geht per HTTPS an den Projektserver. Er lässt sie von ElevenLabs in Text umwandeln und die Antwort bei Bedarf vorlesen.")
                    row("sparkles", "Antwort durch den KI-Assistenten", "Der erkannte Text wird wie eine getippte Frage mit begrenztem Gebäudekontext an Google Gemini gesendet und im KI-Chat des Gebäudes gespeichert.")
                    row("gauge.with.dots.needle.33percent", "Begrenztes Kontingent", "Pro Konto 20 Erkennungen und 20 Vorlesungen in 24 Stunden.")
                    Text("Bitte keine vertraulichen Personen- oder Gebäudedaten sprechen. Die KI-Freigabe kannst du jederzeit im Profil widerrufen.").font(.footnote).foregroundStyle(.secondary)
                }.padding(24)
            }
            .safeAreaInset(edge: .bottom) {
                Button(infoOnly ? "Verstanden" : "Einverstanden, Sprachchat starten") { done() }
                    .buttonStyle(.borderedProminent).tint(d21Accent).controlSize(.large).frame(maxWidth: .infinity).padding()
                    .background(.bar)
            }
            .toolbar { if !infoOnly { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } } }
        }.presentationDetents([.large])
    }
    private func row(_ symbol: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol).font(.body.weight(.semibold)).foregroundStyle(d21Accent).frame(width: 36, height: 36)
                .background(d21Accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) { Text(title).font(.subheadline.weight(.semibold)); Text(text).font(.subheadline).foregroundStyle(.secondary) }
        }
    }
}
#endif

/// Animated orb for the voice chat. Size and ripples follow the real microphone or playback level;
/// while waiting for the server only a neutral rotating ring is shown (no fake speech).
struct VoiceOrb: View {
    enum Mode: Equatable { case idle, listening, waiting, speaking }
    let mode: Mode
    let level: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme

    #if !canImport(ElevenLabs)
    init(phase: BuildingVoiceChat.Phase, level: Double) {
        switch phase {
        case .idle: mode = .idle
        case .listening: mode = .listening
        case .transcribing, .thinking: mode = .waiting
        case .speaking: mode = .speaking
        }
        self.level = level
    }
    #endif
    init(mode: Mode, level: Double) { self.mode = mode; self.level = level }

    private var colors: [Color] {
        switch mode {
        case .listening: [d21Accent, .cyan, .mint]
        case .speaking: [.orange, .pink, d21Accent]
        case .waiting: [.indigo, d21Accent, .cyan]
        case .idle: [d21Accent.opacity(0.85), .cyan.opacity(0.7), .indigo.opacity(0.6)]
        }
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || mode == .idle)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let live = mode == .listening || mode == .speaking ? level : 0
            let scale = reduceMotion ? 1 : 1 + live * 0.28 + (mode == .idle ? 0 : 0.02 * sin(t * 2))
            ZStack {
                // Ripples: only while sound is really captured or played.
                if !reduceMotion && (mode == .listening || mode == .speaking) {
                    ForEach(0..<3) { i in
                        let progress = (t * 0.6 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                        Circle().stroke(colors[0].opacity((1 - progress) * 0.35 * (0.3 + live)), lineWidth: 2)
                            .frame(width: 150 + progress * 110, height: 150 + progress * 110)
                    }
                }
                // Soft glow
                Circle().fill(RadialGradient(colors: [colors[0].opacity(0.35), colors[1].opacity(0.10), .clear], center: .center, startRadius: 20, endRadius: 140))
                    .frame(width: 260, height: 260).scaleEffect(scale)
                // Blob body: three rotating gradient layers
                ZStack {
                    ForEach(0..<3) { i in
                        Ellipse()
                            .fill(LinearGradient(colors: [colors[i % 3], colors[(i + 1) % 3].opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 140 - Double(i) * 12, height: 120 + Double(i) * 10)
                            .rotationEffect(.radians(t * (0.5 + Double(i) * 0.25) * (i.isMultiple(of: 2) ? 1 : -1)))
                            .offset(x: cos(t + Double(i) * 2) * 6 * (0.4 + live), y: sin(t * 1.3 + Double(i)) * 6 * (0.4 + live))
                            .blendMode(scheme == .dark ? .plusLighter : .normal)
                            .opacity(0.75)
                    }
                }
                .blur(radius: 10)
                .frame(width: 150, height: 150)
                .clipShape(Circle())
                .overlay(Circle().fill(LinearGradient(colors: [.white.opacity(0.45), .clear], startPoint: .top, endPoint: .center)).padding(10).blendMode(.overlay))
                .scaleEffect(scale)
                // Waiting for the server: indeterminate ring, no speech-like motion.
                if mode == .waiting {
                    Circle().trim(from: 0, to: 0.28)
                        .stroke(AngularGradient(colors: [colors[0].opacity(0), colors[0], colors[1]], center: .center), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .frame(width: 186, height: 186)
                        .rotationEffect(.degrees(reduceMotion ? 0 : t * 220))
                }
                Image(systemName: mode == .speaking ? "speaker.wave.2.fill" : mode == .waiting ? "ellipsis" : "mic.fill")
                    .font(.system(size: 30, weight: .semibold)).foregroundStyle(.white.opacity(0.95))
                    .shadow(color: .black.opacity(0.15), radius: 4)
                    .scaleEffect(reduceMotion ? 1 : 1 + live * 0.15)
            }
            .frame(maxWidth: .infinity)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: level)
        }
    }
}
