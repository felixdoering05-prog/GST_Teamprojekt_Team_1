#if !canImport(ElevenLabs)
import SwiftUI
import AVFoundation
import Combine

// Real-time voice conversation without third-party SDKs.
// The project server checks AI consent, membership and quotas and hands out a short-lived signed
// WebSocket URL for the configured ElevenLabs agent. The app then streams microphone audio over that
// TLS WebSocket (URLSession) and plays the agent's audio as it arrives. Only Apple frameworks are used,
// so the standard-encryption export answer stays the same.

/// Full-duplex audio: microphone → 100 ms PCM chunks, agent PCM → speaker.
/// Voice processing (echo cancellation) keeps the agent from hearing itself and allows interrupting it.
nonisolated final class LiveAudioEngine: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let lock = NSLock()
    private var converter: AVAudioConverter?
    private var captureFormat: AVAudioFormat?
    private var playbackFormat: AVAudioFormat?
    private var pending = Data()
    private var chunkBytes = 3_200
    private var levels: [Double] = []
    private var running = false
    private var muted = false
    var onChunk: (@Sendable (Data) -> Void)?
    var onInputLevel: (@Sendable (Double) -> Void)?
    var onOutputLevel: (@Sendable (Double) -> Void)?

    var isPlaying: Bool { lock.lock(); defer { lock.unlock() }; return !levels.isEmpty }

    func start(inputRate: Double, outputRate: Double) throws {
        let input = engine.inputNode
        try input.setVoiceProcessingEnabled(true)
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0,
              let capture = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: inputRate, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inFormat, to: capture),
              let playback = AVAudioFormat(standardFormatWithSampleRate: outputRate, channels: 1) else {
            throw APIError(status: 0, message: "Mikrofon oder Lautsprecher nicht verfügbar.")
        }
        lock.lock()
        self.converter = converter; captureFormat = capture; playbackFormat = playback
        chunkBytes = Int(inputRate / 10) * 2; pending = Data(); levels = []; running = true; muted = false
        lock.unlock()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playback)
        input.installTap(onBus: 0, bufferSize: 1024, format: inFormat) { [weak self] buffer, _ in self?.capture(buffer) }
        engine.prepare()
        do { try engine.start() } catch { input.removeTap(onBus: 0); throw error }
        player.play()
    }

    func setMuted(_ value: Bool) { lock.lock(); muted = value; pending = Data(); lock.unlock() }

    private func capture(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); let active = running && !muted; let converter = self.converter; let target = captureFormat; lock.unlock()
        onInputLevel?(active ? PCMVoiceRecorder.level(of: buffer) : 0)
        guard active, let converter, let target else { return }
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * target.sampleRate / buffer.format.sampleRate) + 64
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
        var supplied = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true; status.pointee = .haveData; return buffer
        }
        guard error == nil, output.frameLength > 0, let channel = output.int16ChannelData else { return }
        var chunks: [Data] = []
        lock.lock()
        pending.append(Data(bytes: channel[0], count: Int(output.frameLength) * 2))
        while pending.count >= chunkBytes { chunks.append(pending.prefix(chunkBytes)); pending.removeFirst(chunkBytes) }
        lock.unlock()
        for chunk in chunks { onChunk?(Data(chunk)) }
    }

    /// Schedules one chunk of the agent's 16-bit little-endian PCM for playback.
    func play(_ pcm: Data) {
        lock.lock(); let format = playbackFormat; let active = running; lock.unlock()
        let frames = pcm.count / 2
        guard active, let format, frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)), let target = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(frames)
        var sum = 0.0
        pcm.withUnsafeBytes { raw in
            for i in 0..<frames {
                let value = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self))) / 32_768
                target[i] = value; sum += Double(value * value)
            }
        }
        let db = 20 * log10(max(sqrt(sum / Double(frames)), 0.000_001))
        let level = min(1, max(0, (db + 50) / 50))
        lock.lock(); let wasIdle = levels.isEmpty; levels.append(level); lock.unlock()
        if wasIdle { onOutputLevel?(level) }
        player.scheduleBuffer(buffer) { [weak self] in self?.finishedBuffer() }
    }

    private func finishedBuffer() {
        lock.lock(); if !levels.isEmpty { levels.removeFirst() }; let next = levels.first ?? 0; lock.unlock()
        onOutputLevel?(next)
    }

    /// Drops everything the agent has not said yet (the person started talking).
    func interrupt() {
        lock.lock(); levels = []; lock.unlock()
        player.stop()
        lock.lock(); let active = running; lock.unlock()
        if active { player.play() }
        onOutputLevel?(0)
    }

    func stop() {
        lock.lock(); let wasRunning = running; running = false; levels = []; pending = Data(); lock.unlock()
        guard wasRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        player.stop(); engine.stop()
        try? engine.inputNode.setVoiceProcessingEnabled(false)
    }
}

@MainActor final class LiveConversation: ObservableObject {
    enum State: Equatable { case idle, connecting, listening, thinking, speaking }
    struct Line: Identifiable { let id = UUID(); let fromUser: Bool; var text: String }
    struct Proposal: Identifiable { let id: String; let device: Int; let revision: Int; let on: Bool; let description: String; let generation: UUID; let deadline: Date }
    private struct Start: Decodable { let signed_url: String?; let session_id: String; let max_seconds: Int; let dynamic_variables: [String: String] }
    private struct Prepared: Decodable { let device_id: Int; let revision: Int; let on: Bool; let description: String }
    private struct LeaseStatus: Decodable { let active: Bool }

    @Published var state: State = .idle
    @Published var inputLevel: Double = 0
    @Published var outputLevel: Double = 0
    @Published var lines: [Line] = []
    @Published var problem: String?
    @Published var muted = false
    @Published var proposal: Proposal?
    @Published var applying = false
    @Published var secondsLeft = 0
    /// True when the server reports that live conversations are not set up (HTTP 503) → fall back to push-to-talk.
    @Published var unavailable = false

    private let audio = LiveAudioEngine()
    private var socket: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var generation = UUID()
    private var tasks: [Task<Void, Never>] = []
    private var lease: String?
    private var account: AccountModel?
    private var buildingID: Int?
    private var interruptedEvent = 0
    private var deadline = Date()
    private var lightRequests: [String: String] = [:]

    var isActive: Bool { state != .idle }

    var title: String {
        switch state {
        case .idle: lines.isEmpty ? "Dein Gebäude hört zu, wenn du willst" : "Gespräch beendet"
        case .connecting: "Verbindung wird aufgebaut …"
        case .listening: muted ? "Mikrofon stumm" : "Ich höre zu"
        case .thinking: "Dein Gebäude überlegt …"
        case .speaking: "Dein Gebäude spricht"
        }
    }

    func start(account: AccountModel, building: Building) {
        guard state == .idle else { return }
        let ticket = UUID(); generation = ticket
        self.account = account; buildingID = building.id
        state = .connecting; problem = nil; lines = []; muted = false; interruptedEvent = 0; unavailable = false
        let owner = account.user?.id
        tasks.append(Task { [weak self] in
            guard let self else { return }
            do {
                guard await AVAudioApplication.requestRecordPermission() else { throw APIError(status: 0, message: "Bitte erlaube den Mikrofonzugriff unter Einstellungen → KI trifft Gebäude.") }
                await account.refreshAIPreferences()
                guard self.generation == ticket, account.user?.id == owner else { return }
                guard account.aiPreferences.active else { throw APIError(status: 403, message: "Aktiviere KI einmal in deinen KI-Einstellungen.") }
                let start: Start = try await account.request("buildings/\(building.id)/voice/live?transport=websocket", method: "POST", body: [:], headers: ["X-Request-ID": UUID().uuidString], timeout: 25)
                self.lease = start.session_id
                guard self.generation == ticket else { await self.closeLease(); return }
                guard let raw = start.signed_url, let url = URL(string: raw), url.scheme == "wss", url.host() == "api.elevenlabs.io" else {
                    throw APIError(status: 502, message: "Ungültige Gesprächsverbindung vom Server.")
                }
                self.deadline = Date().addingTimeInterval(Double(min(max(start.max_seconds, 10), 600)))
                try self.configureSession()
                let configuration = URLSessionConfiguration.ephemeral
                configuration.httpCookieStorage = nil; configuration.urlCache = nil
                let session = URLSession(configuration: configuration)
                let socket = session.webSocketTask(with: url)
                socket.maximumMessageSize = 4 * 1024 * 1024
                self.urlSession = session; self.socket = socket
                socket.resume()
                try await self.send(["type": "conversation_initiation_client_data", "dynamic_variables": start.dynamic_variables])
                self.tasks.append(Task { [weak self] in await self?.receiveLoop(ticket: ticket) })
                self.tasks.append(Task { [weak self] in await self?.heartbeatLoop(ticket: ticket, account: account, building: building.id, owner: owner) })
            } catch {
                guard self.generation == ticket else { return }
                if let api = error as? APIError, api.status == 503 { self.unavailable = true }
                self.stop(message: error.localizedDescription)
            }
        })
    }

    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
    }

    private func send(_ object: [String: Any]) async throws {
        guard let socket else { return }
        let data = try JSONSerialization.data(withJSONObject: object)
        try await socket.send(.string(String(decoding: data, as: UTF8.self)))
    }

    private func receiveLoop(ticket: UUID) async {
        while generation == ticket, let socket {
            do {
                let message = try await socket.receive()
                guard generation == ticket else { return }
                let data: Data
                switch message {
                case .string(let text): data = Data(text.utf8)
                case .data(let bytes): data = bytes
                @unknown default: continue
                }
                guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any], let type = json["type"] as? String else { continue }
                try await handle(type, json, ticket: ticket)
            } catch {
                if generation == ticket { stop(message: socket.closeCode == .normalClosure ? "Gespräch beendet." : "Die Verbindung wurde getrennt. Das Mikrofon ist aus.") }
                return
            }
        }
    }

    private func handle(_ type: String, _ json: [String: Any], ticket: UUID) async throws {
        switch type {
        case "conversation_initiation_metadata":
            let meta = json["conversation_initiation_metadata_event"] as? [String: Any]
            guard let inRate = Self.rate(meta?["user_input_audio_format"] as? String ?? "pcm_16000"),
                  let outRate = Self.rate(meta?["agent_output_audio_format"] as? String ?? "pcm_16000") else {
                throw APIError(status: 0, message: "Das Audioformat des Sprachagenten wird nicht unterstützt. Bitte im ElevenLabs-Agenten PCM einstellen.")
            }
            let socket = self.socket
            audio.onChunk = { chunk in
                let text = "{\"user_audio_chunk\":\"\(chunk.base64EncodedString())\"}"
                socket?.send(.string(text)) { _ in }
            }
            weak let owner = self
            audio.onInputLevel = { value in Task { @MainActor in owner?.inputLevel = value } }
            audio.onOutputLevel = { value in Task { @MainActor in owner?.outputChanged(value) } }
            try audio.start(inputRate: inRate, outputRate: outRate)
            state = .listening
        case "audio":
            guard let event = json["audio_event"] as? [String: Any], let base64 = event["audio_base_64"] as? String, let pcm = Data(base64Encoded: base64) else { return }
            if let id = event["event_id"] as? Int, id <= interruptedEvent { return }
            state = .speaking
            audio.play(pcm)
        case "interruption":
            if let id = (json["interruption_event"] as? [String: Any])?["event_id"] as? Int { interruptedEvent = id }
            audio.interrupt(); state = .listening
        case "user_transcript":
            if let text = (json["user_transcription_event"] as? [String: Any])?["user_transcript"] as? String, !text.isEmpty {
                append(text, user: true); if state == .listening { state = .thinking }
            }
        case "agent_response":
            if let text = (json["agent_response_event"] as? [String: Any])?["agent_response"] as? String, !text.isEmpty { append(text, user: false) }
        case "agent_response_correction":
            if let corrected = (json["agent_response_correction_event"] as? [String: Any])?["corrected_agent_response"] as? String,
               let index = lines.lastIndex(where: { !$0.fromUser }) { lines[index].text = String(corrected.prefix(4000)) }
        case "ping":
            if let id = (json["ping_event"] as? [String: Any])?["event_id"] { try await send(["type": "pong", "event_id": id]) }
        case "client_tool_call":
            if let call = json["client_tool_call"] as? [String: Any] { await toolCall(call, ticket: ticket) }
        default:
            break
        }
    }

    private func outputChanged(_ value: Double) {
        outputLevel = value
        if value == 0 && !audio.isPlaying && state == .speaking { state = .listening }
    }

    private static func rate(_ format: String) -> Double? {
        guard format.hasPrefix("pcm_"), let value = Double(format.dropFirst(4)), [8_000, 16_000, 22_050, 24_000, 44_100, 48_000].contains(value) else { return nil }
        return value
    }

    private func append(_ text: String, user: Bool) {
        lines.append(Line(fromUser: user, text: String(text.prefix(4000))))
        if lines.count > 100 { lines.removeFirst(lines.count - 100) }
    }

    private func heartbeatLoop(ticket: UUID, account: AccountModel, building: Int, owner: Int?) async {
        var tick = 0
        while generation == ticket {
            secondsLeft = max(0, Int(deadline.timeIntervalSinceNow))
            if Date() >= deadline { stop(message: "Das Gespräch ist nach der maximalen Dauer beendet. Du kannst ein neues starten."); return }
            try? await Task.sleep(for: .seconds(1))
            guard generation == ticket else { return }
            tick += 1
            if tick % 5 == 0, let lease {
                do {
                    let status: LeaseStatus = try await account.request("buildings/\(building)/voice/live/\(lease)", timeout: 8)
                    guard generation == ticket else { return }
                    guard status.active, account.user?.id == owner else { stop(message: "Gespräch beendet (Freigabe oder Zeitlimit)."); return }
                    if let proposal, Date() >= proposal.deadline { await decline() }
                } catch { if generation == ticket { stop(message: "Verbindung zum Projektserver verloren. Das Mikrofon ist aus.") }; return }
            }
        }
    }

    // MARK: Tools (same safety rules as before: lights only via server rights, simulations only after confirmation)

    private func toolCall(_ call: [String: Any], ticket: UUID) async {
        guard let id = call["tool_call_id"] as? String, let name = call["tool_name"] as? String, let account, let building = buildingID else { return }
        let args = call["parameters"] as? [String: Any] ?? [:]
        do {
            if name == "control_lights" {
                guard !applying, Set(args.keys) == Set(["actions"]) else { throw APIError(status: 400, message: "Ungültiger Lampenauftrag.") }
                applying = true; defer { applying = false }
                let status: LeaseStatus = try await account.request("buildings/\(building)/voice/live/\(lease ?? "")")
                guard status.active, generation == ticket else { throw APIError(status: 403, message: "Gespräch beendet.") }
                let requestID = lightRequests[id] ?? UUID().uuidString; lightRequests[id] = requestID
                struct Result: Decodable { let answer: String }
                let result: Result = try await account.request("buildings/\(building)/assistant/device-actions", method: "POST", body: args, headers: ["X-Request-ID": requestID], timeout: 60)
                guard generation == ticket else { return }
                try await toolResult(id, result.answer)
                return
            }
            guard name == "request_device_change", proposal == nil, !applying, Set(args.keys) == Set(["name", "on"]),
                  let device = args["name"] as? String, !device.isEmpty, device.count <= 100, let on = args["on"] as? Bool else {
                throw APIError(status: 400, message: "Kein gültiger einzelner Simulationsauftrag.")
            }
            let preview: Prepared = try await account.request("buildings/\(building)/voice/intent", method: "POST", body: ["text": "Schalte " + device + (on ? " ein" : " aus")])
            guard generation == ticket, proposal == nil else { return }
            proposal = Proposal(id: id, device: preview.device_id, revision: preview.revision, on: preview.on, description: preview.description, generation: ticket, deadline: Date().addingTimeInterval(45))
        } catch {
            if generation == ticket { try? await toolResult(id, "Nicht ausgeführt: " + error.localizedDescription, error: true) }
        }
    }

    private func toolResult(_ id: String, _ result: String, error: Bool = false) async throws {
        try await send(["type": "client_tool_result", "tool_call_id": id, "result": result, "is_error": error])
    }

    func confirm() async {
        guard let p = proposal, p.generation == generation, p.deadline > Date(), !applying, let account, let buildingID else { return }
        applying = true; proposal = nil; defer { applying = false }
        do {
            let status: LeaseStatus = try await account.request("buildings/\(buildingID)/voice/live/\(lease ?? "")")
            guard status.active, generation == p.generation else { return }
            let _: BuildingDevice = try await account.request("buildings/\(buildingID)/devices/\(p.device)", method: "PATCH", body: ["is_on": p.on, "revision": p.revision])
            guard generation == p.generation else { return }
            try await toolResult(p.id, "Bestätigt und gespeichert: Simulation " + (p.on ? "eingeschaltet." : "ausgeschaltet.") + " Keine echte Hardware.")
        } catch { if generation == p.generation { problem = error.localizedDescription; try? await toolResult(p.id, "Nicht bestätigt gespeichert: " + error.localizedDescription, error: true) } }
    }

    func decline() async {
        guard let p = proposal else { return }; proposal = nil
        if p.generation == generation { try? await toolResult(p.id, "Nutzer hat nicht bestätigt. Keine Änderung ausgeführt.", error: true) }
    }

    func toggleMute() { muted.toggle(); audio.setMuted(muted); if muted { inputLevel = 0 } }

    /// Ends audio first (independent of the project server), then closes the server lease.
    func stop(message: String? = nil) {
        guard state != .idle || socket != nil || !tasks.isEmpty else { if let message { problem = message }; return }
        generation = UUID()
        tasks.forEach { $0.cancel() }; tasks = []
        audio.stop()
        socket?.cancel(with: .normalClosure, reason: nil); socket = nil
        urlSession?.invalidateAndCancel(); urlSession = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        state = .idle; inputLevel = 0; outputLevel = 0; muted = false; secondsLeft = 0
        if let p = proposal { proposal = nil; _ = p }
        if let message { problem = message }
        Task { await closeLease() }
    }

    private func closeLease() async {
        guard let id = lease, let account, let building = buildingID else { return }
        lease = nil
        let _: LogoutResult? = try? await account.request("buildings/\(building)/voice/live/\(id)", method: "DELETE")
    }
}

/// Voice tab: real-time conversation first; falls back to push-to-talk when the server has no live agent.
struct BuildingVoiceView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @StateObject private var live = LiveConversation()
    @Environment(\.scenePhase) private var scenePhase
    @State private var showConsent = false
    @State private var showInfo = false
    @State private var pushToTalk = false
    private var consentKey: String { "d21.voice.liveConsent.\(account.user?.id ?? -1)" }

    var body: some View {
        Group {
            if pushToTalk { PushToTalkVoiceView(building: building, account: account) }
            else { conversation }
        }
        .onChange(of: live.unavailable) { _, value in if value { pushToTalk = true } }
    }

    private var orbMode: VoiceOrb.Mode {
        switch live.state {
        case .idle: .idle
        case .connecting, .thinking: .waiting
        case .listening: live.muted ? .idle : .listening
        case .speaking: .speaking
        }
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 20) {
                    VStack(spacing: 6) {
                        Text(building.name).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                        Text(live.title).font(.system(.title2, design: .rounded, weight: .bold)).multilineTextAlignment(.center).accessibilityAddTraits(.updatesFrequently)
                        if live.isActive && live.secondsLeft > 0 {
                            Label("noch \(live.secondsLeft / 60):\(String(format: "%02d", live.secondsLeft % 60))", systemImage: "timer").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }.padding(.top, 8)

                    Button(action: startFromBuilding) {
                        TalkingBuilding(mode: orbMode, level: live.state == .speaking ? live.outputLevel : live.inputLevel)
                    }
                    .buttonStyle(BuildingTileButtonStyle())
                    .disabled(live.isActive || !account.aiPreferences.active)
                    .accessibilityLabel(live.isActive ? "Sprechendes Gebäude, Gespräch läuft" : "Gebäude antippen, um das Gespräch zu starten")

                    controls

                    if let p = live.proposal {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Simulation bestätigen", systemImage: "lightbulb").font(.headline)
                            Text(p.description).font(.subheadline)
                            HStack { Button("Nein") { Task { await live.decline() } }.buttonStyle(.bordered); Spacer(); Button("Bestätigen") { Task { await live.confirm() } }.buttonStyle(.borderedProminent).tint(d21Accent) }
                        }.padding(16).d21Card(cornerRadius: 20)
                    }
                    if live.applying { ProgressView("Wird gespeichert …") }
                    if let problem = live.problem {
                        Label(problem, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.orange)
                            .padding(14).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 18)
                    }
                    if !live.lines.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(live.lines) { line in
                                if line.fromUser {
                                    HStack { Spacer(minLength: 40); Text(line.text).padding(.horizontal, 14).padding(.vertical, 10).background(d21Accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous)) }
                                } else {
                                    HStack(alignment: .top, spacing: 10) {
                                        Image(systemName: "waveform").foregroundStyle(d21Accent).frame(width: 28, height: 28).background(d21Accent.opacity(0.12), in: Circle())
                                        Text(line.text).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                            Color.clear.frame(height: 1).id("end")
                        }.font(.subheadline).padding(16).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 22)
                    }
                    HStack(spacing: 16) {
                        Button { showInfo = true } label: { Label("Datenschutz", systemImage: "lock.shield") }
                        if !live.isActive { Button { pushToTalk = true } label: { Label("Tippen statt Gespräch", systemImage: "hand.tap") } }
                    }.font(.footnote)
                }.padding(20)
            }
            .onChange(of: live.lines.count) { _, _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .task { await account.refreshAIPreferences() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { live.stop() } }
        .onChange(of: account.aiPreferences.active) { _, enabled in if !enabled { live.stop() } }
        .onChange(of: account.user?.id) { _, _ in live.stop() }
        .onDisappear { live.stop() }
        .sheet(isPresented: $showConsent) { LiveVoiceConsentSheet { UserDefaults.standard.set(true, forKey: consentKey); showConsent = false; live.start(account: account, building: building) } }
        .sheet(isPresented: $showInfo) { LiveVoiceConsentSheet(infoOnly: true) { showInfo = false } }
    }

    @ViewBuilder private var controls: some View {
        if !account.aiPreferences.active {
            VStack(spacing: 10) {
                Text("Für Gespräche muss KI in deinem Profil freigegeben sein.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                NavigationLink { AISettingsView(account: account) } label: { Label("KI-Einstellungen öffnen", systemImage: "sparkles") }.buttonStyle(.borderedProminent).tint(d21Accent)
            }
        } else if live.isActive {
            HStack(spacing: 36) {
                callButton(live.muted ? "mic.slash.fill" : "mic.fill", live.muted ? "Mikrofon an" : "Stumm", color: live.muted ? .orange : Color(uiColor: .secondaryLabel)) { live.toggleMute() }
                    .disabled(live.state == .connecting)
                callButton("phone.down.fill", "Beenden", color: .red) { live.stop() }
            }
        } else {
            VStack(spacing: 6) {
                Label("Tippe auf dein Gebäude, um zu sprechen", systemImage: "hand.tap.fill").font(.subheadline.weight(.semibold)).foregroundStyle(d21Accent)
                Text("Sprich ganz normal – du kannst dein Gebäude jederzeit unterbrechen.").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
    }

    private func startFromBuilding() {
        guard !live.isActive, account.aiPreferences.active else { return }
        UserDefaults.standard.bool(forKey: consentKey) ? live.start(account: account, building: building) : (showConsent = true)
    }

    private func callButton(_ symbol: String, _ label: String, color: Color, size: CGFloat = 72, action: @escaping () -> Void) -> some View {
        VStack(spacing: 8) {
            Button(action: action) {
                Image(systemName: symbol).font(.system(size: size * 0.36, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: size, height: size).background(color.gradient, in: Circle())
                    .shadow(color: color.opacity(0.35), radius: 12, y: 5)
                    .contentTransition(.symbolEffect(.replace))
            }.buttonStyle(BuildingTileButtonStyle()).accessibilityLabel(label)
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }
    }
}

struct LiveVoiceConsentSheet: View {
    var infoOnly = false
    let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Image(systemName: "phone.and.waveform.fill").font(.system(size: 44)).foregroundStyle(d21Accent)
                    Text("So funktioniert das Gespräch").font(.title2.bold())
                    row("mic", "Mikrofon nur während des Gesprächs", "Es läuft ab „Gespräch starten“ bis „Beenden“, höchstens 2 Minuten. Beim Verlassen der Ansicht oder der App wird sofort aufgelegt.")
                    row("lock.fill", "Verschlüsselte Live-Übertragung", "Deine Stimme wird per verschlüsselter WebSocket-Verbindung (TLS) direkt an ElevenLabs übertragen. Der Projektserver prüft vorher Freigabe, Gebäudezugang und Kontingent und stellt eine kurzlebige Zugangsadresse aus.")
                    row("building.2", "Begrenzter Gebäudekontext", "Der Assistent erhält Gebäudename, regionale Wetterwerte, deine freigegebenen Lampen und die Namen der zuletzt hochgeladenen Dateien – keine Adresse und keine Dateiinhalte.")
                    row("memorychip", "Nichts auf dem iPhone gespeichert", "Audio wird nur gestreamt. Das Gesprächsprotokoll siehst du während des Gesprächs; ElevenLabs verarbeitet Audio und Text nach eigenen Bedingungen.")
                    row("lightbulb", "Geräte nur mit Bestätigung", "Simulierte Geräte werden erst nach deinem Tipp auf „Bestätigen“ geschaltet. Lampen nur im Rahmen deiner Rechte.")
                    row("gauge.with.dots.needle.33percent", "Begrenztes Kontingent", "Pro Konto 10 Gespräche in 24 Stunden.")
                    Text("Bitte keine vertraulichen Personen- oder Gebäudedaten sprechen. Die KI-Freigabe kannst du jederzeit im Profil widerrufen.").font(.footnote).foregroundStyle(.secondary)
                }.padding(24)
            }
            .safeAreaInset(edge: .bottom) {
                Button(infoOnly ? "Verstanden" : "Einverstanden, Gespräch starten") { done() }
                    .buttonStyle(.borderedProminent).tint(d21Accent).controlSize(.large).frame(maxWidth: .infinity).padding().background(.bar)
            }
            .toolbar { if !infoOnly { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } } }
        }
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
