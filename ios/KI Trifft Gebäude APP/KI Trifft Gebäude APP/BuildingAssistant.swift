import SwiftUI

struct AssistantFileInfo: Decodable { let name: String; let mime_type: String; let size: Int }
struct AssistantContext: Decodable {
    struct Facts: Decodable { let name: String; let address: String }
    struct Files: Decodable { let count: Int; let bytes: Int; let latest: [AssistantFileInfo]; let shown: Int }
    let building: Facts; let files: Files
}
struct AssistantStatus: Decodable { let enabled: Bool; let model: String; let notice: String; let context: AssistantContext; let context_hash: String }
struct AssistantAnswer: Decodable { let answer: String; let model: String; let notice: String; let cached: Bool }

struct BuildingAssistantView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var info: AssistantStatus?
    @State private var loading = false
    @State private var question = ""
    @State private var consent = false
    @State private var sending = false
    @State private var answer: AssistantAnswer?
    @State private var problem: String?
    @State private var sentQuestion: String?
    @State private var requestID = UUID()
    @State private var retryAsNew = false
    @State private var sendTask: Task<Void, Never>?
    private let suggestions = ["Fasse den hinterlegten Gebäudestand zusammen.", "Welche Unterlagen sind schon hinterlegt?", "Was sind sinnvolle nächste Schritte für unseren Gebäudepass?"]
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Dein Gebäude-Assistent", systemImage: "sparkles").font(.title3.bold()).foregroundStyle(d21Accent)
                    Text("Fragen zu \(building.name) – mit den Angaben aus eurer Gebäudemappe.").foregroundStyle(.secondary)
                    Text("Jede Frage wird einzeln beantwortet. Der Teamchat bleibt privat und wird nicht mitgesendet.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Modell steuern") {
                    NavigationLink { IFCLibraryView(model: account, buildingID: building.id) } label: { Label("IFC-Modell mit Befehlen öffnen", systemImage: "cube.transparent") }
                    Text("Im geöffneten Modell auf „Modellbefehle“ tippen: ausblenden, einfärben oder zurücksetzen. Hier im Text-Assistenten wird keine Modelländerung ausgeführt.").font(.footnote).foregroundStyle(.secondary)
                }
                if loading { Section { ProgressView("Gebäudestand wird geladen …") } }
                if let info {
                    if !info.enabled { Section { Label("Der Assistent ist vorübergehend nicht verfügbar.", systemImage: "cloud.slash"); Button("Verfügbarkeit erneut prüfen") { Task { await load() } } } }
                    Section("Grundlage der Antwort") {
                        DisclosureGroup("Diese Angaben werden an Google gesendet") {
                            LabeledContent("Gebäude", value: info.context.building.name)
                            LabeledContent("Adresse", value: info.context.building.address.isEmpty ? "Nicht hinterlegt" : info.context.building.address)
                            LabeledContent("Dateien", value: String(info.context.files.count))
                            LabeledContent("Gesamtgröße", value: ByteCountFormatter.string(fromByteCount: Int64(info.context.files.bytes), countStyle: .file))
                            ForEach(Array(info.context.files.latest.enumerated()), id: \.offset) { _, file in
                                VStack(alignment: .leading, spacing: 3) { Text(file.name); Text("\(file.mime_type) · \(ByteCountFormatter.string(fromByteCount: Int64(file.size), countStyle: .file))").font(.caption).foregroundStyle(.secondary) }
                            }
                            if info.context.files.count > info.context.files.shown { Text("Nur die letzten \(info.context.files.shown) Dateinamen, Dateitypen und Größen werden mitgesendet.").font(.footnote) }
                            Text("Zusätzlich wird deine unten eingegebene Frage übertragen. Keine Dateiinhalte, Fotos, PDF-Pläne, IFC-Bauteile, Kontakte oder Chatnachrichten.").font(.footnote).foregroundStyle(.secondary)
                        }
                        Text("Der Assistent kann noch keine Räume zählen oder Pläne auswerten. Fehlende Daten sollte er ausdrücklich benennen.").font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("Wobei brauchst du Hilfe?") {
                        ForEach(suggestions, id: \.self) { text in Button(text) { question = text }.disabled(sending) }
                        TextField("Deine Frage zum Gebäude", text: $question, axis: .vertical).lineLimit(3...8).disabled(sending)
                        if question.utf16.count > 2000 { Text("Bitte kürze die Frage auf maximal 2000 Zeichen.").font(.footnote).foregroundStyle(.red) }
                    }
                    Section {
                        Toggle("Frage und angezeigte Gebäudedaten an Google senden", isOn: $consent).disabled(sending)
                        Text("Google verarbeitet diese Angaben. Teile nur Informationen, die du dafür freigeben darfst, und keine Zugangsdaten.").font(.footnote).foregroundStyle(.secondary)
                        Button {
                            sendTask = Task { await send() }
                        } label: {
                            HStack { if sending { ProgressView() }; Label(sending ? "Antwort wird erstellt …" : retryAsNew ? "Neue Anfrage versuchen" : problem != nil && sentQuestion == question.trimmingCharacters(in: .whitespacesAndNewlines) ? "Ergebnis erneut abrufen" : "Frage senden", systemImage: "sparkles") }
                        }.disabled(!info.enabled || sending || !consent || question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || question.utf16.count > 2000)
                        Text("Bis 20 Anfragen pro Konto und 100 für das Projekt innerhalb von 24 Stunden. Gemini kann zusätzlich eigene Limits haben.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let problem {
                    Section("Gerade nicht möglich") { Text(problem).foregroundStyle(.red); Button(info == nil ? "Erneut laden" : "Gebäudestand aktualisieren") { Task { consent = false; sentQuestion = nil; await load() } }.disabled(sending) }
                }
                if let answer {
                    Section("Antwort des Assistenten") {
                        Text(answer.answer).textSelection(.enabled)
                        Label(answer.model.contains("Vorschau") ? "Lokale Vorschau" : "Gemini", systemImage: "sparkles").font(.caption).foregroundStyle(.secondary)
                        Text(answer.notice).font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Assistent").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Fertig") { dismiss() } } }
            .task { await load() }
            .onDisappear { sendTask?.cancel() }
        }
    }
    private func load() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { info = try await account.request("buildings/\(building.id)/assistant"); problem = nil }
        catch { problem = error.localizedDescription }
    }
    private func send() async {
        guard !sending, consent, let info else { return }; sending = true; defer { sending = false }
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        if sentQuestion != text || retryAsNew { requestID = UUID() }
        sentQuestion = text; retryAsNew = false; problem = nil; answer = nil
        do {
            let result: AssistantAnswer = try await account.request("buildings/\(building.id)/assistant", method: "POST", body: ["question":text,"consent":"yes","context_hash":info.context_hash], headers: ["X-Request-ID":requestID.uuidString], timeout: 45)
            guard !Task.isCancelled else { return }; answer = result; sentQuestion = nil
        } catch {
            guard !Task.isCancelled else { return }
            problem = error.localizedDescription
            if let api = error as? APIError { retryAsNew = api.status != 409 && api.status != 0 }
        }
    }
}
