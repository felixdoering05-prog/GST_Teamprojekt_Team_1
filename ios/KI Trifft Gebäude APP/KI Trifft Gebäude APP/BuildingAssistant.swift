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
struct AssistantAnswer: Decodable { let answer: String; let model: String; let notice: String; let cached: Bool; var ha_actions: [HAChatAction]? = nil }
/// Von Nala vorgeschlagener und vom Server geprüfter Lichtauftrag für eine importierte Home-Assistant-Lampe.
struct HAChatAction: Decodable { let entity_id: String; let name: String; let on: Bool; let brightness: Int?; let rgb: [Int]? }
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
                    LazyVStack(alignment: .leading, spacing: 22) {
                        if loading && turns.isEmpty { ProgressView("Gespräch wird geladen …").frame(maxWidth: .infinity).padding(.top, 50) }
                        if turns.isEmpty && !loading && !sending { emptyConversation }
                        ForEach(turns) { turn in message(turn).id(turn.id).transition(.opacity) }
                        if let pendingQuestion {
                            questionBubble(pendingQuestion)
                            typingIndicator
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
        .onAppear { if question.isEmpty, let prefilled = AppRouter.shared.takeQuestion(for: building.id) { question = prefilled } }
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
            NalaAvatar(size: 40)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("Nala").font(.headline)
                    Circle().fill(account.aiPreferences.active ? Color.green : Color.secondary.opacity(0.5)).frame(width: 7, height: 7)
                        .accessibilityLabel(account.aiPreferences.active ? "bereit" : "KI nicht aktiviert")
                }
                Text("Gebäudeassistentin · " + building.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 6)
            Button { showInfo = true } label: { Image(systemName: "info.circle").font(.title3).foregroundStyle(.secondary) }.accessibilityLabel("Informationen zu KI und Datenübertragung")
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }
    private var emptyConversation: some View {
        VStack(spacing: 22) {
            NalaAvatar(size: 84).padding(.top, 28)
            VStack(spacing: 8) {
                Text("Hi, ich bin Nala").font(.system(.title, design: .rounded, weight: .bold))
                Text("Deine Gebäudeassistentin. Frag mich zu Unterlagen, Modell und Räumen – du entscheidest, was geändert wird.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 12)
            }
            VStack(spacing: 10) {
                suggestion("Unterlagen im Überblick", detail: "Welche Unterlagen sind hinterlegt?", symbol: "folder.fill", command: false)
                suggestion("Mein Modell verstehen", detail: "Wie viele Wände enthält das ausgewählte IFC-Modell?", symbol: "cube.transparent.fill", command: false)
                suggestion("Licht steuern", detail: "Schalte das Licht im Wohnzimmer an", symbol: "lightbulb.max.fill", command: false)
                if selectedID != nil { suggestion("Darstellung anpassen", detail: "Färbe alle Wände blau", symbol: "paintpalette.fill", command: true) }
            }
        }.frame(maxWidth: .infinity)
    }
    private func suggestion(_ title: String, detail: String, symbol: String, command: Bool) -> some View {
        Button { question = detail; commandMode = command; composerFocused = true } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol).font(.body).foregroundStyle(d21Accent)
                    .frame(width: 36, height: 36).background(d21Accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                    Text(detail).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.primary.opacity(0.05)))
        }.buttonStyle(.plain).disabled(sending)
    }
    private func questionBubble(_ text: String) -> some View {
        HStack {
            Spacer(minLength: 48)
            Text(text).font(.body).foregroundStyle(.white).textSelection(.enabled)
                .padding(.horizontal, 15).padding(.vertical, 11)
                .background(d21Accent.gradient, in: UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 20, bottomTrailingRadius: 6, topTrailingRadius: 20))
        }
    }
    private var typingIndicator: some View {
        HStack(alignment: .bottom, spacing: 8) {
            NalaAvatar(size: 28)
            TypingDots().padding(.horizontal, 16).padding(.vertical, 14)
                .background(Color(uiColor: .secondarySystemBackground), in: UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 6, bottomTrailingRadius: 20, topTrailingRadius: 20))
            Spacer(minLength: 0)
        }.accessibilityElement(children: .ignore).accessibilityLabel("Nala schreibt …")
    }
    private func message(_ turn: AssistantTurn) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            questionBubble(turn.question)
            HStack(alignment: .bottom, spacing: 8) {
                NalaAvatar(size: 28)
                VStack(alignment: .leading, spacing: 10) {
                    Text(turn.answer).font(.body).lineSpacing(4).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                    if let command = turn.command, command.action != "unsupported", let document = turn.document_id {
                        Button("Modelländerung prüfen", systemImage: "cube.transparent") { Task { await prepare(command, document: document) } }
                            .buttonStyle(.borderedProminent).tint(d21Accent).controlSize(.small).disabled(sending)
                        Text("Vorschlag · wird erst nach deiner Bestätigung für das Team gespeichert.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 15).padding(.vertical, 12)
                .background(Color(uiColor: .secondarySystemBackground), in: UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 6, bottomTrailingRadius: 20, topTrailingRadius: 20))
                .contextMenu { Button("Kopieren", systemImage: "doc.on.doc") { UIPasteboard.general.string = turn.answer; copiedTurn = turn.id } }
                Spacer(minLength: 28)
            }
            Button { UIPasteboard.general.string = turn.answer; copiedTurn = turn.id } label: {
                Label(copiedTurn == turn.id ? "Kopiert" : "Kopieren", systemImage: copiedTurn == turn.id ? "checkmark" : "doc.on.doc")
                    .font(.caption2).foregroundStyle(.secondary)
            }.buttonStyle(.plain).padding(.leading, 36).accessibilityLabel("Antwort kopieren")
        }
    }
    private var composer: some View {
        VStack(spacing: 8) {
            if !account.aiPreferences.active {
                NavigationLink { AISettingsView(account: account) } label: {
                    Label("KI einmal für dein Konto aktivieren", systemImage: "sparkles").font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14).padding(.vertical, 8).background(d21Accent.opacity(0.12), in: Capsule())
                }
            }
            if commandMode || selectedID != nil {
                HStack(spacing: 6) {
                    if commandMode { Label("Modelländerung", systemImage: "cube.transparent").foregroundStyle(d21Accent) }
                    if let selectedID, let doc = documents.first(where: { $0.id == selectedID }) { Label(doc.name, systemImage: "doc").foregroundStyle(.secondary).lineLimit(1) }
                    Spacer(minLength: 0)
                }.font(.caption.weight(.medium)).padding(.horizontal, 6)
            }
            HStack(alignment: .bottom, spacing: 8) {
                tools
                    .frame(width: 38, height: 38).background(Color(uiColor: .secondarySystemBackground), in: Circle())
                HStack(alignment: .bottom, spacing: 6) {
                    TextField(commandMode ? "Gewünschte Modelländerung …" : "Frag Nala …", text: $question, axis: .vertical)
                        .lineLimit(1...6).focused($composerFocused).disabled(sending).accessibilityIdentifier("assistant-message")
                        .padding(.vertical, 9)
                    if question.utf16.count > 1800 { Text("\(question.utf16.count)/2000").font(.caption2).foregroundStyle(question.utf16.count > 2000 ? .red : .secondary).padding(.bottom, 11) }
                    Button { composerFocused = false; sendTask = Task { await send() } } label: {
                        Image(systemName: "arrow.up").font(.subheadline.weight(.bold)).foregroundStyle(.white)
                            .frame(width: 30, height: 30).background(canSend ? AnyShapeStyle(d21Accent.gradient) : AnyShapeStyle(Color.secondary.opacity(0.35)), in: Circle())
                    }.buttonStyle(.plain).disabled(!canSend).padding(.bottom, 4).accessibilityLabel(sending ? "Antwort wird erstellt" : "Nachricht senden")
                }
                .padding(.leading, 14).padding(.trailing, 4)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(composerFocused ? d21Accent.opacity(0.5) : Color.primary.opacity(0.06)))
            }
            Text("Nala kann Fehler machen. Wichtige Angaben bitte prüfen.").font(.caption2).foregroundStyle(.tertiary)
        }.padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 6).background(.bar)
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
        } label: { Image(systemName: "plus").font(.headline).foregroundStyle(.primary).frame(width: 38, height: 38) }
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
            }.navigationTitle("Über Nala").navigationBarTitleDisplayMode(.inline)
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
            guard info.enabled else { throw APIError(status: 503, message: "Nala ist gerade nicht verfügbar.") }
            var body: [String:Any] = ["question":text,"consent":"yes","context_hash":info.context_hash,"chat":true]
            if commandMode { body["mode"] = "ifc-command" }
            if let selectedID { body["document_id"] = selectedID }
            let reply: AssistantAnswer = try await account.request("buildings/\(building.id)/assistant", method: "POST", body: body, headers:["X-Request-ID":requestID.uuidString], timeout:45)
            guard !Task.isCancelled else { return }; question = ""; lastFingerprint = ""; await load()
            if let actions = reply.ha_actions, !actions.isEmpty, !reply.cached { await runLights(actions) }
        } catch { guard !Task.isCancelled else { return }; problem = error.localizedDescription; if let api = error as? APIError { retryNew = api.status != 0 && (api.status != 409 || !api.message.contains("noch bearbeitet")) } }
    }
    /// Nalas Lichtaufträge im Heimnetz ausführen: gleiche Prüfung und Grenzen wie beim Antippen der Lampe.
    private func runLights(_ actions: [HAChatAction]) async {
        var done: [String] = [], failed: [String] = []
        for action in actions.prefix(5) {
            do { try await HASync.switchLight(account: account, building: building.id, entity: action.entity_id, on: action.on, brightness: action.on ? action.brightness : nil, rgb: action.on ? action.rgb : nil); done.append(action.name) }
            catch { failed.append("\(action.name): \(error.localizedDescription)") }
        }
        if !done.isEmpty { notice = "Home Assistant hat geschaltet: " + done.joined(separator: ", ") + "." }
        if !failed.isEmpty { problem = "Nicht geschaltet – " + failed.joined(separator: " · ") }
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

/// Nalas Avatar: Farbverlauf mit „N“, bis das Logo da ist.
struct NalaAvatar: View {
    var size: CGFloat = 32
    var body: some View {
        ZStack {
            Circle().fill(LinearGradient(colors: [d21Accent, Color(red: 0.36, green: 0.42, blue: 0.86)], startPoint: .topLeading, endPoint: .bottomTrailing))
            Text("N").font(.system(size: size * 0.46, weight: .bold, design: .rounded)).foregroundStyle(.white)
            Image(systemName: "sparkle").font(.system(size: size * 0.2, weight: .bold)).foregroundStyle(.white.opacity(0.9))
                .offset(x: size * 0.24, y: -size * 0.24)
        }
        .frame(width: size, height: size)
        .shadow(color: d21Accent.opacity(size > 50 ? 0.35 : 0), radius: size > 50 ? 14 : 0, y: 6)
        .accessibilityHidden(true)
    }
}

/// Drei pulsierende Punkte, solange Nala antwortet.
struct TypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 0.15, paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle().fill(Color.secondary).frame(width: 7, height: 7)
                        .opacity(reduceMotion ? 0.6 : 0.35 + 0.65 * max(0, sin(t * 5 - Double(i) * 0.8)))
                }
            }
        }
    }
}
