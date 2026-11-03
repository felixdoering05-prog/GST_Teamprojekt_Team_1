import SwiftUI
import AVFoundation
import Combine

struct VoiceReading: Identifiable { let id = UUID(); let text: String }
@MainActor final class BuildingVoiceRecorder: ObservableObject {
    @Published var recording = false
    @Published var seconds = 0
    @Published var url: URL?
    @Published var problem: String?
    private var recorder: AVAudioRecorder?
    private var clock: Task<Void,Never>?
    private var permissionTicket = UUID()
    func start() async {
        guard !recording else { return }
        let ticket = UUID(); permissionTicket = ticket
        let permitted = await AVAudioApplication.requestRecordPermission()
        guard permissionTicket == ticket, !Task.isCancelled else { return }
        guard permitted else { problem = "Bitte Mikrofonzugriff in den iPhone-Einstellungen erlauben."; return }
        clear(); seconds = 0
        do {
            let session = AVAudioSession.sharedInstance(); try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker]); try session.setActive(true)
            let path = FileManager.default.temporaryDirectory.appendingPathComponent("d21-voice-" + UUID().uuidString + ".wav")
            let audio = try AVAudioRecorder(url: path, settings: [AVFormatIDKey:kAudioFormatLinearPCM,AVSampleRateKey:16000,AVNumberOfChannelsKey:1,AVLinearPCMBitDepthKey:16,AVLinearPCMIsFloatKey:false,AVLinearPCMIsBigEndianKey:false])
            guard audio.record(forDuration: 30) else { throw APIError(status: 0, message: "Aufnahme konnte nicht gestartet werden.") }
            url = path; recorder = audio; recording = true
            clock = Task { for i in 1...30 { do { try await Task.sleep(for: .seconds(1)) } catch { return }; guard self.recording else { return }; self.seconds = i }; self.stop() }
        } catch { problem = error.localizedDescription; stop() }
    }
    func stop() { permissionTicket = UUID(); recorder?.stop(); recorder = nil; recording = false; clock?.cancel(); clock = nil; if let url { try? FileManager.default.setAttributes([.protectionKey:FileProtectionType.complete], ofItemAtPath: url.path) }; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    func clear() { stop(); if let url { try? FileManager.default.removeItem(at: url) }; url = nil; problem = nil }
}

struct BuildingVoiceView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @StateObject private var recorder = BuildingVoiceRecorder()
    @Environment(\.scenePhase) private var scenePhase
    @State private var enabled = false
    @State private var consent = false
    @State private var text = ""
    @State private var busy = false
    @State private var problem: String?
    @State private var result: String?
    @State private var proposal: Proposal?
    @State private var confirm = false
    @State private var reading: VoiceReading?
    @State private var speechID = UUID()
    private struct Proposal: Decodable { let device_id: Int; let revision: Int; let on: Bool; let description: String }
    var body: some View {
        Form {
            Section {
                Label("Dein Gebäude hört auf dich", systemImage: "waveform").font(.headline).foregroundStyle(d21Accent)
                Text("ElevenLabs erkennt deine Aufnahme. Du prüfst den Text und bestätigst jeden Simulationsbefehl. Keine dauerhafte Aufnahme und keine echte Hardwaresteuerung.").font(.footnote).foregroundStyle(.secondary)
                if !enabled { Label("ElevenLabs noch nicht verfügbar", systemImage: "exclamationmark.icloud").foregroundStyle(.orange) }
            }
            Section("1 · Aufnahme") {
                Button(recorder.recording ? "Aufnahme stoppen · \(recorder.seconds) s" : "Bis zu 30 Sekunden aufnehmen", systemImage: recorder.recording ? "stop.circle.fill" : "mic.circle.fill") { if recorder.recording { recorder.stop() } else { speechID = UUID(); Task { await recorder.start() } } }.disabled(busy)
                Text("Die Aufnahme bleibt zuerst lokal auf diesem iPhone. Bei Verlassen dieser Ansicht wird die temporäre Audiodatei entfernt.").font(.caption).foregroundStyle(.secondary)
                Toggle("Diese Aufnahme an ElevenLabs zur Erkennung senden", isOn: $consent).disabled(busy)
                Button(busy ? "Wird verarbeitet …" : "Aufnahme erkennen lassen") { Task { await transcribe() } }.disabled(!consent || !enabled || recorder.url == nil || recorder.recording || busy)
                if recorder.url != nil && !recorder.recording { Button("Aufnahme verwerfen", role: .destructive) { recorder.clear(); consent = false }.disabled(busy) }
            }
            Section("2 · Text prüfen") {
                TextField("Zum Beispiel: Schalte Deckenlicht ein", text: $text, axis: .vertical).lineLimit(2...6).disabled(busy)
                Text("Du kannst auch tippen. Pro Auftrag genau ein Gerät mit seinem exakten Namen verwenden.").font(.footnote).foregroundStyle(.secondary)
                Button("Simulationsbefehl prüfen") { Task { await prepare() } }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy || recorder.recording)
                NavigationLink { BuildingAssistantView(building: building, account: account, initialText: text) } label: { Label("Frage an Gemini vorbereiten", systemImage: "sparkles") }.disabled(text.isEmpty || busy || recorder.recording)
                Text("Gemini erhält den Text erst nach der separaten Freigabe im KI-Chat. Für Modelländerungen dort den Modus Modellbefehl wählen.").font(.caption).foregroundStyle(.secondary)
            }
            if let proposal { Section("3 · Vor dem Schalten bestätigen") { Text(proposal.description); Button("Simulation ausführen") { confirm = true }.disabled(busy || recorder.recording) } }
            if let result { Section("Ergebnis") { Text(result); Button("Ergebnis vorlesen", systemImage: "speaker.wave.2") { reading = VoiceReading(text: result) } } }
            if let problem { Section { Text(problem).foregroundStyle(.red) } }
            if let error = recorder.problem { Section { Text(error).foregroundStyle(.red) } }
            Section { Text("Audio und vorgelesener Text werden bei Freigabe vom Projektserver an ElevenLabs übertragen. Der Anbieter kann diese Daten gemäß seinen Bedingungen speichern. In der App keine automatische Wiederholung nach einem Timeout.").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle("Sprachassistent").navigationBarTitleDisplayMode(.inline)
        .task { do { struct Status: Decodable { let enabled: Bool }; let status: Status = try await account.request("buildings/\(building.id)/voice"); enabled = status.enabled } catch { problem = error.localizedDescription } }
        .onChange(of: text) { _,_ in proposal = nil; result = nil }
        .onChange(of: scenePhase) { _, phase in if phase == .background { recorder.stop() } }
        .onDisappear { recorder.clear() }
        .confirmationDialog("Nur die Simulation schalten?", isPresented: $confirm, titleVisibility: .visible) { Button("Simulation bestätigen") { Task { await apply() } }; Button("Abbrechen", role: .cancel) {} } message: { Text(proposal?.description ?? "") }
        .sheet(item: $reading) { VoicePlaybackView(building: building, account: account, text: $0.text) }
    }
    private func transcribe() async {
        guard let url = recorder.url, consent, !busy else { return }; busy = true; defer { busy = false }
        do { text = try await account.transcribeVoice(buildingID: building.id, data: Data(contentsOf: url), requestID: speechID); problem = nil; consent = false }
        catch { problem = error.localizedDescription + " Für eine neue Erkennung bitte neu aufnehmen." }
    }
    private func prepare() async {
        guard !busy else { return }; busy = true; proposal = nil; result = nil; defer { busy = false }
        do { proposal = try await account.request("buildings/\(building.id)/voice/intent", method: "POST", body: ["text":text]); problem = nil } catch { problem = error.localizedDescription }
    }
    private func apply() async {
        guard let proposal, !busy else { return }; busy = true; self.proposal = nil; defer { busy = false }
        do { let _: BuildingDevice = try await account.request("buildings/\(building.id)/devices/\(proposal.device_id)", method: "PATCH", body: ["is_on":proposal.on,"revision":proposal.revision]); result = "Die Gerätesimulation wurde \(proposal.on ? "eingeschaltet" : "ausgeschaltet"). Keine echte Hardware wurde geschaltet."; problem = nil } catch { problem = error.localizedDescription }
    }
}

struct VoicePlaybackView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let text: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var consent = false
    @State private var busy = false
    @State private var player: AVAudioPlayer?
    @State private var problem: String?
    @State private var requestID = UUID()
    @State private var attempted = false
    @State private var operation = UUID()
    private var spoken: String { var value = "", length = 0; for char in text { let count = String(char).utf16.count; if length + count > 1200 { break }; value.append(char); length += count }; return value }
    var body: some View {
        NavigationStack {
            Form {
                Section("Dieser Text wird an ElevenLabs gesendet") { Text(spoken).textSelection(.enabled); if spoken != text { Text("Auf 1200 Zeichen gekürzt.").font(.caption).foregroundStyle(.orange) } }
                Section { Toggle("Diesen Text zur Sprachausgabe an ElevenLabs senden", isOn: $consent).disabled(busy); Text("Der Anbieter kann den Text gemäß seinen Bedingungen speichern. Pro bewusstem Abruf entsteht eine Anbieteranfrage.").font(.caption).foregroundStyle(.secondary)
                    Button(busy ? "Stimme wird geladen …" : "Mit ElevenLabs vorlesen") { Task { await play() } }.disabled(!consent || busy || attempted)
                    if player != nil { Button("Wiedergabe stoppen") { player?.stop() }; Button("Vorhandene Audioantwort erneut abspielen") { player?.play() } }
                    if attempted && player == nil && !busy { Button("Neue Anbieteranfrage vorbereiten") { attempted = false; consent = false; requestID = UUID() } }
                }
                if let problem { Section { Text(problem).foregroundStyle(.red) } }
            }.navigationTitle("Sprachausgabe").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Schließen") { dismiss() }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
        .onDisappear { operation = UUID(); player?.stop(); player = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        .onChange(of: scenePhase) { _, phase in if phase != .active { operation = UUID(); player?.stop() } }
    }
    private func play() async {
        guard consent, !busy, !attempted else { return }; busy = true; attempted = true; let ticket = UUID(); operation = ticket; defer { busy = false }
        do { let bytes = try await account.speakVoice(buildingID: building.id, text: spoken, requestID: requestID); guard operation == ticket, scenePhase == .active, !Task.isCancelled else { return }; let session = AVAudioSession.sharedInstance(); try session.setCategory(.playback); try session.setActive(true); let audio = try AVAudioPlayer(data: bytes); player = audio; audio.play(); problem = nil } catch { if operation == ticket { problem = error.localizedDescription } }
    }
}
