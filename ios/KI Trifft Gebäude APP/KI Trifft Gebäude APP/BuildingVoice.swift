import SwiftUI
import AVFoundation
import Combine

#if canImport(ElevenLabs)
import ElevenLabs

@MainActor final class BuildingLiveVoice: ObservableObject {
    @Published var stopping = false
    @Published var connecting = false
    @Published var active = false
    @Published var muted = false
    @Published var phase = "Bereit für dein Gebäude"
    @Published var speaking = false
    @Published var level: Double = 0
    @Published var problem: String?
    @Published var lines: [String] = []
    @Published var proposal: Proposal?
    @Published var applying = false
    struct Proposal: Identifiable { let id: String; let device: Int; let revision: Int; let on: Bool; let description: String; let generation: UUID; let deadline: Date }
    private struct Prepared: Decodable { let device_id: Int; let revision: Int; let on: Bool; let description: String }
    private struct Session: Decodable { let token: String; let session_id: String; let max_seconds: Int; let dynamic_variables: [String:String] }
    private var conversation: Conversation?
    private var startup: Task<Void,Never>?
    private var heartbeat: Task<Void,Never>?
    private var subscriptions = Set<AnyCancellable>()
    private var generation = UUID()
    private var handled = Set<String>()
    private var lease: String?
    private var account: AccountModel?
    private var buildingID: Int?

    func start(account: AccountModel, building: Building) {
        guard !connecting, !active, !stopping, startup == nil else { return }
        let ticket = UUID(); generation = ticket; self.account = account; buildingID = building.id
        connecting = true; problem = nil; lines = []; phase = "Verbindung wird vorbereitet …"; handled = []
        let owner = account.user?.id
        startup = Task {
            do {
                let permitted = await AVAudioApplication.requestRecordPermission()
                guard generation == ticket, !Task.isCancelled else { return }
                guard permitted else { throw APIError(status: 0, message: "Bitte erlaube den Mikrofonzugriff in den iPhone-Einstellungen.") }
                await account.refreshAIPreferences()
                guard generation == ticket, account.user?.id == owner, !Task.isCancelled else { return }
                guard account.aiPreferences.active else { throw APIError(status: 403, message: "Aktiviere KI und Sprache einmal in deinen KI-Einstellungen.") }
                let session: Session = try await account.request("buildings/\(building.id)/voice/live", method: "POST", body: [:], headers: ["X-Request-ID":UUID().uuidString], timeout: 25)
                guard generation == ticket, !Task.isCancelled else { await closeLease(account, building.id, session.session_id); return }
                lease = session.session_id
                let config = ConversationConfig(dynamicVariables: session.dynamic_variables,
                    onError: { [weak self] _ in Task { @MainActor in guard let self, self.generation == ticket else { return }; self.stop(message: "Das Gespräch wurde unterbrochen. Bitte starte bei Bedarf neu.") } },
                    onAgentResponse: { [weak self] text,_ in Task { @MainActor in self?.append("Assistent: " + text, ticket: ticket) } },
                    onUserTranscript: { [weak self] text,_ in Task { @MainActor in self?.append("Du: " + text, ticket: ticket) } },
                    onVadScore: { [weak self] score in Task { @MainActor in if self?.generation == ticket { self?.level = min(1, max(0, score)) } } })
                let call = try await ElevenLabs.startConversation(conversationToken: session.token, config: config)
                guard generation == ticket, account.user?.id == owner, !Task.isCancelled else { await call.endConversation(); await closeLease(account, building.id, session.session_id); return }
                conversation = call; connecting = false; active = true; startup = nil; phase = "Ich höre zu"
                call.$agentState.sink { [weak self] state in
                    guard let self, self.generation == ticket else { return }
                    self.speaking = state == .speaking
                    self.phase = state == .speaking ? "Dein Assistent spricht" : state == .thinking ? "Ich denke nach …" : self.muted ? "Mikrofon pausiert" : "Ich höre zu"
                }.store(in: &subscriptions)
                call.$state.dropFirst().sink { [weak self] state in
                    guard let self, self.generation == ticket else { return }
                    switch state { case .ended: self.stop(); case .error: self.stop(message: "Die Verbindung wurde beendet."); default: break }
                }.store(in: &subscriptions)
                call.$pendingToolCalls.sink { [weak self] calls in
                    guard let self, self.generation == ticket else { return }
                    for request in calls where self.handled.insert(request.toolCallId).inserted {
                        Task { await self.prepare(request, ticket: ticket, account: account, building: building.id) }
                    }
                }.store(in: &subscriptions)
                heartbeat = Task {
                    let deadline = Date().addingTimeInterval(Double(min(120, session.max_seconds)))
                    while !Task.isCancelled, generation == ticket {
                        do { try await Task.sleep(for: .seconds(5)); guard generation == ticket, !Task.isCancelled else { return }
                            struct Status: Decodable { let active: Bool }
                            let status: Status = try await account.request("buildings/\(building.id)/voice/live/\(session.session_id)", timeout: 8)
                            guard status.active, Date() < deadline, account.user?.id == owner else { stop(message: "Gespräch beendet. Du kannst bewusst ein neues starten."); return }
                            if let proposal, Date() >= proposal.deadline { await decline() }
                        } catch { if generation == ticket { stop(message: "Verbindung verloren. Das Mikrofon wurde ausgeschaltet.") }; return }
                    }
                }
            } catch { if generation == ticket { startup = nil; stop(message: error.localizedDescription) } }
        }
    }
    private func append(_ line: String, ticket: UUID) { guard generation == ticket else { return }; lines.append(String(line.prefix(4000))); if lines.count > 100 { lines.removeFirst(lines.count - 100) } }
    private func closeLease(_ account: AccountModel, _ building: Int, _ id: String) async { let _: LogoutResult? = try? await account.request("buildings/\(building)/voice/live/\(id)", method: "DELETE") }
    func stop(message: String? = nil) {
        guard !stopping || active || connecting else { return }
        generation = UUID(); let pendingStart = startup; pendingStart?.cancel(); startup = nil; heartbeat?.cancel(); heartbeat = nil
        subscriptions.removeAll(); let call = conversation; conversation = nil
        let id = lease; lease = nil; let model = account; let building = buildingID
        connecting = false; active = false; muted = false; speaking = false; level = 0; proposal = nil; phase = "Bereit für dein Gebäude"
        if let message { problem = message }
        // End audio first, independent of a potentially unavailable project server.
        stopping = true
        let stopTicket = generation
        Task {
            await pendingStart?.value
            if let call { await call.endConversation() }
            if generation == stopTicket { stopping = false }
            if let id, let model, let building { await closeLease(model, building, id) }
        }
    }
    func toggleMute() async {
        guard let call = conversation else { return }; let ticket = generation
        do { let value = !muted; try await call.setMuted(value); if ticket == generation { muted = value; if !speaking { phase = value ? "Mikrofon pausiert" : "Ich höre zu" } } }
        catch { if ticket == generation { stop(message: "Mikrofon konnte nicht pausiert werden. Gespräch beendet.") } }
    }
    private var lightRequests: [String:String] = [:]
    private func prepare(_ request: ClientToolCallEvent, ticket: UUID, account: AccountModel, building: Int) async {
        guard generation == ticket, let call = conversation else { return }
        do {
            let args = try request.getParameters()
            if request.toolName == "control_lights" {
                guard !applying, Set(args.keys) == Set(["actions"]) else { throw APIError(status: 400, message: "Ungültiger Lampenauftrag.") }
                applying = true; defer { applying = false }
                struct LeaseStatus: Decodable { let active: Bool }
                let status: LeaseStatus = try await account.request("buildings/\(building)/voice/live/\(lease ?? "")")
                guard status.active, generation == ticket else { throw APIError(status:403,message:"Gespräch beendet.") }
                let requestID = lightRequests[request.toolCallId] ?? UUID().uuidString
                lightRequests[request.toolCallId] = requestID
                struct Result: Decodable { let answer: String }
                let result: Result = try await account.request("buildings/\(building)/assistant/device-actions", method: "POST", body: args, headers: ["X-Request-ID": requestID], timeout: 60)
                guard generation == ticket else { return }
                try await call.sendToolResult(for: request.toolCallId, result: result.answer)
                return
            }
            guard request.toolName == "request_device_change", proposal == nil, !applying,
                  Set(args.keys) == Set(["name","on"]), let name = args["name"] as? String, !name.isEmpty, name.count <= 100,
                  let on = args["on"] as? Bool else { throw APIError(status: 400, message: "Kein gültiger einzelner Simulationsauftrag.") }
            let preview: Prepared = try await account.request("buildings/\(building)/voice/intent", method: "POST", body: ["text":"Schalte " + name + (on ? " ein" : " aus")])
            guard generation == ticket else { return }
            guard proposal == nil else { throw APIError(status: 409, message: "Bitte erst den vorherigen Vorschlag beantworten.") }
            proposal = Proposal(id: request.toolCallId, device: preview.device_id, revision: preview.revision, on: preview.on, description: preview.description, generation: ticket, deadline: Date().addingTimeInterval(45))
        } catch { if generation == ticket { try? await call.sendToolResult(for: request.toolCallId, result: "Nicht ausgeführt: " + error.localizedDescription, isError: true) } }
    }
    func decline() async {
        guard let proposal else { return }; self.proposal = nil
        if proposal.generation == generation { try? await conversation?.sendToolResult(for: proposal.id, result: "Nutzer hat nicht bestätigt. Keine Änderung ausgeführt.", isError: true) }
    }
    func confirm() async {
        guard let p = proposal, p.generation == generation, p.deadline > Date(), !applying, let account, let buildingID, let call = conversation else { return }
        applying = true; proposal = nil; defer { applying = false }
        do {
            // Revalidate the account/session immediately before applying the explicit confirmation.
            struct Status: Decodable { let active: Bool }
            let status: Status = try await account.request("buildings/\(buildingID)/voice/live/\(lease ?? "")")
            guard status.active, generation == p.generation else { return }
            let _: BuildingDevice = try await account.request("buildings/\(buildingID)/devices/\(p.device)", method: "PATCH", body: ["is_on":p.on,"revision":p.revision])
            guard generation == p.generation else { return }
            try await call.sendToolResult(for: p.id, result: "Bestätigt und gespeichert: Simulation " + (p.on ? "eingeschaltet." : "ausgeschaltet.") + " Keine echte Hardware.")
        } catch { if generation == p.generation { problem = error.localizedDescription; try? await call.sendToolResult(for: p.id, result: "Nicht bestätigt gespeichert: " + error.localizedDescription, isError: true) } }
    }
}

struct BuildingVoiceView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @StateObject private var voice = BuildingLiveVoice()
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Text(building.name).font(.subheadline).foregroundStyle(.secondary)
                VoiceAssistantAnimation(active: voice.active || voice.connecting, speaking: voice.speaking, level: voice.muted ? 0 : voice.level)
                    .frame(height: 200).accessibilityHidden(true)
                Text(voice.phase).font(.title2.bold()).multilineTextAlignment(.center).accessibilityAddTraits(.updatesFrequently)
                Text(voice.active ? "Sprich ganz normal. Du kannst die Antwort jederzeit unterbrechen." : "Frage nach deinem Gebäude oder bitte darum, deine verbundenen Lampen zu schalten.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                if !account.aiPreferences.active {
                    NavigationLink { AISettingsView(account: account) } label: { Label("KI einmal aktivieren", systemImage: "sparkles") }.buttonStyle(.borderedProminent).tint(d21Accent)
                } else if voice.active || voice.connecting {
                    HStack {
                        if voice.active { Button(voice.muted ? "Mikrofon an" : "Stumm", systemImage: voice.muted ? "mic.slash" : "mic") { Task { await voice.toggleMute() } }.buttonStyle(.bordered) }
                        Button("Beenden", systemImage: "phone.down.fill", role: .destructive) { voice.stop() }.buttonStyle(.borderedProminent)
                    }
                } else {
                    Button("Gespräch starten", systemImage: "waveform") { voice.start(account: account, building: building) }.buttonStyle(.borderedProminent).controlSize(.large).tint(d21Accent).disabled(voice.stopping)
                }
                if let p = voice.proposal {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Simulation bestätigen", systemImage: "lightbulb").font(.headline)
                        Text(p.description)
                        HStack { Button("Abbrechen") { Task { await voice.decline() } }; Spacer(); Button("Bestätigen") { Task { await voice.confirm() } }.buttonStyle(.borderedProminent).tint(d21Accent) }
                    }.padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                }
                if voice.applying { ProgressView("Simulation wird gespeichert …") }
                if let problem = voice.problem { Text(problem).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
                if !voice.lines.isEmpty { DisclosureGroup("Gespräch mitlesen") { VStack(alignment: .leading, spacing: 12) { ForEach(Array(voice.lines.enumerated()), id: \.offset) { _, line in Text(line).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading) } } } }
                Text("ElevenLabs · Live-Mikrofon nur im Gespräch · maximal 2 Minuten\nGeräte sind vorerst Simulationen. Änderungen erst nach Bestätigung.").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                NavigationLink("KI-Einstellungen") { AISettingsView(account: account) }.font(.footnote)
            }.padding(24)
        }.background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Sprachassistent").navigationBarTitleDisplayMode(.inline)
        .task { await account.refreshAIPreferences() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { voice.stop() } }
        .onChange(of: account.aiPreferences.active) { _, enabled in if !enabled { voice.stop() } }
        .onChange(of: account.user?.id) { _,_ in voice.stop() }
        .onDisappear { voice.stop() }
    }
}

#else
// TestFlight-compatible push-to-talk voice chat without third-party SDKs: see VoiceChat.swift.
#endif
