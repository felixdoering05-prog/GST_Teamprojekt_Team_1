import SwiftUI

struct AssistantFileInfo: Decodable { let name: String; let mime_type: String; let size: Int }
struct AssistantContext: Decodable {
    struct Facts: Decodable { let name: String; let address: String }
    struct Files: Decodable { let count: Int; let bytes: Int; let latest: [AssistantFileInfo]; let shown: Int }
    struct Model: Decodable { let document_id: Int; let name: String; let counts: [String:Int] }
    let building: Facts; let files: Files; let model: Model?
}
struct AssistantStatus: Decodable { let enabled: Bool; let model: String; let notice: String; let context: AssistantContext; let context_hash: String }
struct ModelCommand: Codable { let action: String; let target: String; let color: String?; let summary: String
    var json: [String:Any] { ["action":action,"target":target,"color":color.map { $0 as Any } ?? NSNull(),"summary":summary] }
}
struct AssistantAnswer: Decodable { let answer: String; let model: String; let notice: String; let cached: Bool }
struct AssistantTurn: Decodable, Identifiable { let id: Int; let document_id: Int?; let question: String; let answer: String; let command: ModelCommand? }
private struct CommandPreview: Decodable { let count: Int; let description: String }
private struct SceneVersion: Decodable { let revision: Int }
private struct PendingModelCommand: Identifiable { let id = UUID(); let document: Int; let command: ModelCommand; let revision: Int; let description: String }

struct BuildingAssistantView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var documents: [BuildingDocument] = []
    @State private var selectedID: Int?
    @State private var turns: [AssistantTurn] = []
    @State private var question = ""
    @State private var commandMode = false
    @State private var consent = false
    @State private var sending = false
    @State private var loading = false
    @State private var problem: String?
    @State private var notice: String?
    @State private var pending: PendingModelCommand?
    @State private var requestID = UUID()
    @State private var lastFingerprint = ""
    @State private var retryNew = false
    @State private var sendTask: Task<Void,Never>?
    @State private var voiceReading: VoiceReading?
    init(building: Building, account: AccountModel, initialText: String = "") { self.building = building; self.account = account; _question = State(initialValue: initialText) }
    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        Label("Dein KI-Assistent für \(building.name)", systemImage: "sparkles").font(.headline)
                        Text("Dein privater Gesprächsverlauf wird auf dem Projektserver gespeichert. Bestätigte Modelländerungen sieht das Gebäudeteam.").font(.footnote).foregroundStyle(.secondary)
                        if loading { ProgressView("Gespräch wird geladen …") }
                        if turns.isEmpty && !loading {
                            Text("Was möchtest du über dein Gebäude wissen?").font(.title3)
                            ForEach(["Welche Unterlagen sind hinterlegt?", "Wie viele Wände enthält das ausgewählte IFC-Modell?"], id: \.self) { suggestion in Button(suggestion) { question = suggestion; commandMode = false }.buttonStyle(.bordered).disabled(sending) }
                        }
                        ForEach(turns) { turn in
                            VStack(alignment: .trailing, spacing: 8) {
                                Text(turn.question).padding(12).background(d21Accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 18)).frame(maxWidth: .infinity, alignment: .trailing)
                                VStack(alignment: .leading, spacing: 10) {
                                    Label("Gebäude-Assistent", systemImage: "sparkles").font(.caption.bold()).foregroundStyle(d21Accent)
                                    Text(turn.answer).textSelection(.enabled)
                                    Button("Mit ElevenLabs vorlesen", systemImage: "speaker.wave.2") { voiceReading = VoiceReading(text: turn.answer) }.disabled(sending)
                                    if let command = turn.command, command.action != "unsupported", let document = turn.document_id {
                                        Button("Änderung prüfen", systemImage: "checkmark.circle") { Task { await prepare(command, document: document) } }.buttonStyle(.bordered).disabled(sending)
                                        Text("Vorschlag · Änderung erfordert Bestätigung").font(.caption).foregroundStyle(.secondary)
                                    }
                                }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
                            }.id(turn.id)
                        }
                        if sending { ProgressView("Der Assistent arbeitet …") }
                        if let notice { Text(notice).font(.footnote).foregroundStyle(d21Accent) }
                        if let problem { Text(problem).font(.footnote).foregroundStyle(.red); Button("Gespräch neu laden") { Task { await load() } }.disabled(sending) }
                        Color.clear.frame(height: 1).id("bottom")
                    }.padding()
                }.onChange(of: turns.count) { _,_ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
            Divider()
            VStack(spacing: 10) {
                if !documents.isEmpty {
                    Picker("IFC-Modell", selection: $selectedID) {
                        Text("Ohne Modell").tag(Optional<Int>.none)
                        ForEach(documents) { Text($0.name).tag(Optional($0.id)) }
                    }.pickerStyle(.menu).disabled(sending)
                }
                Picker("Anfrage", selection: $commandMode) { Text("Frage").tag(false); Text("Modellbefehl").tag(true) }.pickerStyle(.segmented).disabled(sending)
                DisclosureGroup("Was wird an Google gesendet?") {
                    Text(commandMode ? "Nur dein Befehlstext und feste erlaubte Aktionen. Keine IFC-Datei oder Gesprächshistorie." : "Deine Frage, bis zu sechs bisherige Frage-Antwort-Paare dieses KI-Chats, Gebäudename, Adresse, die letzten 20 Dateinamen mit Typ/Größe und bei Modellauswahl dessen Name und IFC-Typzahlen. Keine Dateiinhalte, Geometrie, Teamnachrichten oder Kontakte.").font(.caption).foregroundStyle(.secondary)
                }
                Toggle("Übertragung an Google erlauben", isOn: $consent).font(.footnote).disabled(sending)
                HStack(alignment: .bottom) {
                    TextField(commandMode ? "Zum Beispiel: Färbe alle Wände blau" : "Nachricht an deinen Assistenten", text: $question, axis: .vertical).lineLimit(1...4).textFieldStyle(.roundedBorder).disabled(sending)
                    Button { sendTask = Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.largeTitle) }.accessibilityLabel("Nachricht senden").disabled(sending || !consent || question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || question.utf16.count > 2000 || commandMode && selectedID == nil)
                }
                Text("KI kann irren · 20 Anfragen je Konto / 24 h · Modelländerungen erst nach Bestätigung").font(.caption2).foregroundStyle(.secondary)
            }.padding().background(.regularMaterial)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .task { await load() }
        .sheet(item: $voiceReading) { VoicePlaybackView(building: building, account: account, text: $0.text) }
        .onDisappear { sendTask?.cancel() }
        .onChange(of: selectedID) { _,_ in consent = false }
        .onChange(of: commandMode) { _,_ in consent = false }
        .confirmationDialog("Gemeinsamen Modellstand ändern?", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }), titleVisibility: .visible) {
            if let pending { Button("Für das Gebäudeteam speichern") { Task { await apply(pending) } } }
            Button("Abbrechen", role: .cancel) { pending = nil }
        } message: { Text((pending?.description ?? "") + "\nDie IFC-Originaldatei bleibt erhalten.") }
    }
    private func load() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do {
            let history: [AssistantTurn] = try await account.request("buildings/\(building.id)/assistant/history")
            let docs = try await account.documents(buildingID: building.id).filter { $0.mime_type == "application/x-step" }.sorted { $0.id > $1.id }
            guard !Task.isCancelled else { return }; turns = history; documents = docs
            if selectedID == nil { selectedID = docs.first?.id }
            problem = nil
        } catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
    private func send() async {
        guard !sending,consent else { return }; sending = true; defer { sending = false }
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        let fingerprint = "\(commandMode)#\(selectedID ?? -1)#\(text)"
        if fingerprint != lastFingerprint || retryNew { requestID = UUID() }
        lastFingerprint = fingerprint; retryNew = false; problem = nil; notice = nil
        do {
            let query = commandMode ? "?mode=ifc-command" : selectedID.map { "?document_id=\($0)" } ?? ""
            struct Status: Decodable { let enabled: Bool; let context_hash: String }
            let info: Status = try await account.request("buildings/\(building.id)/assistant" + query)
            guard info.enabled else { throw APIError(status: 503, message: "Der Assistent ist gerade nicht verfügbar.") }
            var body: [String:Any] = ["question":text,"consent":"yes","context_hash":info.context_hash,"chat":true]
            if commandMode { body["mode"] = "ifc-command" }
            if let selectedID { body["document_id"] = selectedID }
            let _: AssistantAnswer = try await account.request("buildings/\(building.id)/assistant", method: "POST", body: body, headers:["X-Request-ID":requestID.uuidString], timeout:45)
            guard !Task.isCancelled else { return }; question = ""; lastFingerprint = ""; await load()
        } catch { guard !Task.isCancelled else { return }; problem = error.localizedDescription; if let api = error as? APIError { retryNew = api.status != 0 && (api.status != 409 || !api.message.contains("noch bearbeitet")) } }
    }
    private func prepare(_ command: ModelCommand, document: Int) async {
        guard !sending else { return }; sending = true; defer { sending = false }
        do {
            let state: SceneVersion = try await account.request("documents/\(document)/model-state")
            let preview: CommandPreview = try await account.request("documents/\(document)/model-command", method:"POST", body:["command":command.json,"confirm":false])
            pending = PendingModelCommand(document:document,command:command,revision:state.revision,description:preview.description); problem = nil
        } catch { problem = error.localizedDescription }
    }
    private func apply(_ proposal: PendingModelCommand) async {
        pending = nil; guard !sending else { return }; sending = true; defer { sending = false }
        do {
            let _: SceneVersion = try await account.request("documents/\(proposal.document)/model-command", method:"POST", body:["command":proposal.command.json,"confirm":true,"revision":proposal.revision])
            notice = "Gespeichert. Im 3D-Reiter wird der gemeinsame Modellstand geladen."; problem = nil
        } catch { problem = error.localizedDescription }
    }
}
