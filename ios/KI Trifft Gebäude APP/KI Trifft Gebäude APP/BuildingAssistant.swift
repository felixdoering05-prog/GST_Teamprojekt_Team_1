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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var composerFocused: Bool
    @State private var showInfo = false
    @State private var copiedTurn: Int?
    @State private var pendingQuestion: String?
    @State private var documents: [BuildingDocument] = []
    @State private var selectedID: Int?
    @State private var turns: [AssistantTurn] = []
    @State private var question = ""
    @State private var commandMode = false
    @State private var sending = false
    @State private var loading = false
    @State private var problem: String?
    @State private var notice: String?
    @State private var pending: PendingModelCommand?
    @State private var requestID = UUID()
    @State private var lastFingerprint = ""
    @State private var retryNew = false
    @State private var sendTask: Task<Void,Never>?
    init(building: Building, account: AccountModel, initialText: String = "") { self.building = building; self.account = account; _question = State(initialValue: initialText) }
    private var canSend: Bool {
        !sending && !loading && account.aiPreferences.active && !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && question.utf16.count <= 2000 && (!commandMode || selectedID != nil)
    }
    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 26) {
                        if loading && turns.isEmpty { ProgressView("Gespräch wird geladen …").frame(maxWidth: .infinity).padding(.top, 50) }
                        if turns.isEmpty && !loading && !sending { emptyConversation }
                        ForEach(turns) { turn in message(turn).id(turn.id).transition(.opacity) }
                        if let pendingQuestion {
                            questionBubble(pendingQuestion)
                            HStack(spacing: 10) { ProgressView(); Text("Antwort wird erstellt …").font(.subheadline).foregroundStyle(.secondary) }
                                .padding(.vertical, 8).accessibilityElement(children: .combine)
                        }
                        if let notice { Label(notice, systemImage: "checkmark.circle").font(.footnote).foregroundStyle(d21Accent) }
                        if let problem {
                            VStack(alignment: .leading, spacing: 10) {
                                Label(problem, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red)
                                Button("Gespräch erneut laden") { Task { await account.refreshAIPreferences(); await load() } }.disabled(sending)
                            }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }.padding(.horizontal, 20).padding(.vertical, 24)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: turns.count)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: turns.count) { _, _ in withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: sending) { _, value in if value { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) } } }
            }
        }
        .background(Color(uiColor: .systemBackground))
        .safeAreaInset(edge: .bottom, spacing: 0) {
            // Keep the pinned input bar from covering half of the conversation at the largest text sizes.
            composer.dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
        .task { await load() }
        .onDisappear { sendTask?.cancel() }
        .sheet(isPresented: $showInfo) { information }
        .confirmationDialog("Gemeinsamen Modellstand ändern?", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }), titleVisibility: .visible) {
            if let pending { Button("Für das Gebäudeteam speichern") { Task { await apply(pending) } } }
            Button("Abbrechen", role: .cancel) { pending = nil }
        } message: { Text((pending?.description ?? "") + "\nDie IFC-Originaldatei bleibt erhalten.") }
    }
    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles").font(.title3).foregroundStyle(d21Accent)
                .frame(width: 40, height: 40).background(d21Accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 3) {
                Text("Gebäude-Assistent").font(.headline)
                Text(building.name + " · Privater Chat").font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 6)
            Button { showInfo = true } label: { Image(systemName: "info.circle").font(.title3) }.accessibilityLabel("Informationen zu KI und Datenübertragung")
        }.padding(.horizontal, 20).padding(.vertical, 12)
    }
    private var emptyConversation: some View {
        VStack(alignment: .leading, spacing: 24) {
            Image(systemName: "sparkles").font(.system(size: 38, weight: .medium)).foregroundStyle(d21Accent).padding(.top, 30)
            Text("Was möchtest du\nüber dein Gebäude wissen?").font(.system(.largeTitle, design: .rounded, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            Text("Frage zu deinen Unterlagen oder erkunde das verknüpfte Modell. Du entscheidest, was geändert wird.").font(.subheadline).foregroundStyle(.secondary)
            VStack(spacing: 10) {
                suggestion("Unterlagen im Überblick", detail: "Welche Unterlagen sind hinterlegt?", symbol: "folder", command: false)
                suggestion("Mein Modell verstehen", detail: "Wie viele Wände enthält das ausgewählte IFC-Modell?", symbol: "cube.transparent", command: false)
                if selectedID != nil { suggestion("Darstellung anpassen", detail: "Färbe alle Wände blau", symbol: "paintpalette", command: true) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func suggestion(_ title: String, detail: String, symbol: String, command: Bool) -> some View {
        Button { question = detail; commandMode = command; composerFocused = true } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol).foregroundStyle(d21Accent).frame(width: 24)
                VStack(alignment: .leading, spacing: 4) { Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary); Text(detail).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading) }
                Spacer(minLength: 0); Image(systemName: "arrow.up.left").font(.caption).foregroundStyle(.secondary)
            }.padding(16).background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain).disabled(sending)
    }
    private func questionBubble(_ text: String) -> some View {
        HStack { Spacer(minLength: 30); Text(text).font(.body).textSelection(.enabled).padding(.horizontal, 17).padding(.vertical, 13)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 22)) }
    }
    private func message(_ turn: AssistantTurn) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            questionBubble(turn.question)
            VStack(alignment: .leading, spacing: 13) {
                Label("Gebäude-Assistent", systemImage: "sparkles").font(.caption.weight(.semibold)).foregroundStyle(d21Accent)
                Text(turn.answer).font(.body).lineSpacing(5).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                if let command = turn.command, command.action != "unsupported", let document = turn.document_id {
                    Button("Modelländerung prüfen", systemImage: "cube.transparent") { Task { await prepare(command, document: document) } }
                        .buttonStyle(.bordered).disabled(sending)
                    Text("Vorschlag · wird erst nach deiner Bestätigung für das Team gespeichert.").font(.caption).foregroundStyle(.secondary)
                }
                Button { UIPasteboard.general.string = turn.answer; copiedTurn = turn.id } label: {
                    Label(copiedTurn == turn.id ? "Kopiert" : "Kopieren", systemImage: copiedTurn == turn.id ? "checkmark" : "doc.on.doc")
                        .font(.caption).foregroundStyle(.secondary)
                }.buttonStyle(.plain).accessibilityLabel("Antwort kopieren")
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
    private var composer: some View {
        VStack(spacing: 10) {
            if !account.aiPreferences.active {
                NavigationLink { AISettingsView(account: account) } label: { Label("KI einmal für dein Konto aktivieren", systemImage: "sparkles").font(.subheadline) }
            }
            VStack(alignment: .leading, spacing: 10) {
                if commandMode { Label("Modelländerung · Bestätigung erforderlich", systemImage: "cube.transparent").font(.caption.weight(.medium)).foregroundStyle(d21Accent) }
                TextField(commandMode ? "Beschreibe die gewünschte Modelländerung …" : "Frage zu deinem Gebäude …", text: $question, axis: .vertical)
                    .lineLimit(1...6).focused($composerFocused).disabled(sending).accessibilityIdentifier("assistant-message")
                HStack {
                    tools
                    if let selectedID, let doc = documents.first(where: { $0.id == selectedID }) {
                        Label(doc.name, systemImage: "cube.transparent").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    } else { Text("Gebäudekontext").font(.caption).foregroundStyle(.secondary) }
                    Spacer(minLength: 4)
                    if question.utf16.count > 1800 { Text("\(question.utf16.count)/2000").font(.caption2).foregroundStyle(question.utf16.count > 2000 ? .red : .secondary) }
                    Button { composerFocused = false; sendTask = Task { await send() } } label: {
                        Image(systemName: "arrow.up").font(.headline.weight(.bold)).foregroundStyle(canSend ? .white : .secondary)
                            .frame(width: 36, height: 36).background(canSend ? d21Accent : Color(uiColor: .tertiarySystemFill), in: Circle())
                    }.buttonStyle(.plain).disabled(!canSend).accessibilityLabel(sending ? "Antwort wird erstellt" : "Nachricht senden")
                }
            }.padding(16).background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24))
            Text("KI kann Fehler machen. Wichtige Angaben bitte prüfen.").font(.caption2).foregroundStyle(.secondary)
        }.padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 8).background(.regularMaterial)
    }
    private var tools: some View {
        Menu {
            Section("Arbeitsweise") {
                Button { commandMode = false } label: { Label("Frage stellen", systemImage: commandMode ? "bubble.left" : "checkmark") }
                Button { commandMode = true } label: { Label("Modelländerung vorschlagen", systemImage: commandMode ? "checkmark" : "cube.transparent") }.disabled(selectedID == nil)
            }
            if !documents.isEmpty {
                Picker("IFC-Modell", selection: $selectedID) {
                    Text("Ohne Modell").tag(Optional<Int>.none)
                    ForEach(documents) { Text($0.name).tag(Optional($0.id)) }
                }
            }
            Button("KI und Datenschutz", systemImage: "info.circle") { showInfo = true }
        } label: { Image(systemName: "plus").font(.headline).foregroundStyle(.primary).frame(width: 32, height: 36) }
            .disabled(sending).accessibilityLabel("Werkzeuge und Modellauswahl")
            .onChange(of: selectedID) { _, value in if value == nil { commandMode = false } }
    }
    private var information: some View {
        NavigationStack {
            Form {
                Section("Dein Gespräch") { Text("Dieser Verlauf ist privat für dein Konto und wird auf dem Projektserver gespeichert. Bestätigte Modelländerungen sieht das Gebäudeteam. Es wird kein eigenes KI-Modell trainiert.") }
                Section("Fragen und Gerätesteuerung") { Text("Deine Frage, bis zu sechs bisherige Frage-Antwort-Paare, Gebäudename/Adresse und begrenzte Dateiangaben werden an Google Gemini gesendet. Bei Modellauswahl kommen Modellname und IFC-Typzahlen hinzu. Keine Datei-Inhalte, vollständige Geometrie, Teamnachrichten oder Kontakte. Verbundene Lampen können entsprechend deiner Kontofreigabe per Auftrag gesteuert werden.") }
                Section("Modelländerungen") { Text("Für einen Modellbefehl werden Befehlstext und erlaubte Aktionen übertragen. Keine IFC-Datei oder Gesprächshistorie. Die Änderung prüfst du vor dem gemeinsamen Speichern; die Originaldatei bleibt erhalten.") }
                Section { Text("20 KI-Anfragen je Konto in 24 Stunden. Es gibt in diesem Build keine Live-Sprache und keine gestreamte Antwort; der Server liefert die Antwort vollständig zurück.").font(.footnote); NavigationLink { AISettingsView(account: account) } label: { Label("KI-Einstellungen", systemImage: "slider.horizontal.3") } }
            }.navigationTitle("Über den Assistenten").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { showInfo = false } } }
        }
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
        guard canSend else { return }; sending = true; defer { sending = false; pendingQuestion = nil }
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        pendingQuestion = text
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
