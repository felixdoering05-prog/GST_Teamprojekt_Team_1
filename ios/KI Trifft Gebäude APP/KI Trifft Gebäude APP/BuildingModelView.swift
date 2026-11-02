import SwiftUI

struct BuildingModelView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var documents: [BuildingDocument] = []
    @State private var selectedID: Int?
    @State private var preview: DocumentPreview?
    @State private var openingID: Int?
    @State private var operation = UUID()
    @State private var loading = false
    @State private var problem: String?
    private var preference: String { "d21.last-model.\(account.serverURL).\(account.user?.id ?? -1).\(building.id)" }
    private var scope: String { preference }
    var body: some View {
        VStack(spacing: 0) {
            if !documents.isEmpty {
                Picker("Modell", selection: $selectedID) { ForEach(documents) { Text($0.name).tag(Optional($0.id)) } }.pickerStyle(.menu).padding(.horizontal)
            }
            if loading { ProgressView("Dein 3D-Modell wird geladen …").frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let preview {
                IFCStoredModelView(url: preview.url, account: account, buildingID: building.id, documentID: preview.document.id).id(preview.id)
            } else if let problem {
                ContentUnavailableView { Label("Modell nicht verfügbar", systemImage: "exclamationmark.icloud") } description: { Text(problem) } actions: { Button("Erneut versuchen") { Task { await load() } } }
            } else { ContentUnavailableView("Noch kein IFC-Modell", systemImage: "cube.transparent", description: Text("Lade unter Dateien ein IFC-Modell für dieses Gebäude hoch. Danach öffnet es sich hier automatisch.")) }
        }
        .task(id: scope) { await load() }
        .task(id: selectedID) { if let id = selectedID { await open(id) } }
        .onDisappear { operation = UUID(); openingID = nil; loading = false; cleanup() }
    }
    private func cleanup() { if let preview { try? FileManager.default.removeItem(at: preview.url.deletingLastPathComponent()) }; preview = nil }
    private func load() async {
        guard !loading else { return }; loading = true; problem = nil
        let original = scope
        do {
            let docs = try await account.documents(buildingID: building.id).filter { $0.mime_type == "application/x-step" }.sorted { $0.id > $1.id }
            guard !Task.isCancelled, scope == original else { loading = false; return }
            documents = docs
            let last = UserDefaults.standard.integer(forKey: preference)
            loading = false
            selectedID = docs.first(where: { $0.id == last })?.id ?? docs.first?.id
        } catch { if !Task.isCancelled { problem = error.localizedDescription } }
        loading = false
        if let id = selectedID, preview == nil { await open(id) }
    }
    private func open(_ id: Int) async {
        guard openingID != id, preview?.document.id != id, let doc = documents.first(where: { $0.id == id }) else { return }
        let ticket = UUID(); operation = ticket; openingID = id
        loading = true; problem = nil; cleanup(); let original = scope
        defer { if operation == ticket { loading = false; openingID = nil } }
        do {
            let item = try await account.previewDocument(doc)
            guard !Task.isCancelled, scope == original, selectedID == id, operation == ticket else { try? FileManager.default.removeItem(at: item.url.deletingLastPathComponent()); return }
            preview = item; UserDefaults.standard.set(id, forKey: preference)
        } catch { if !Task.isCancelled, operation == ticket { problem = error.localizedDescription } }
    }
}
