import SwiftUI
import Combine
import PhotosUI
import UniformTypeIdentifiers

struct BuildingDetailView: View {
    let building: Building
    @ObservedObject var model: AccountModel
    @StateObject private var flow: BuildingWorkflowModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var documents: [BuildingDocument] = []
    @State private var loading = false
    @State private var preparing = false
    @State private var fileAction = false
    @State private var filePicker = false
    @State private var photos: [PhotosPickerItem] = []
    @State private var preview: DocumentPreview?
    @State private var fileError: String?
    @State private var success: String?
    @State private var search = ""
    @State private var renameTarget: BuildingDocument?
    @State private var renameName = ""
    @State private var deleteTarget: BuildingDocument?
    init(building: Building, model: AccountModel) {
        self.building = building; self.model = model
        _flow = StateObject(wrappedValue: BuildingWorkflowModel(account: model, building: building))
    }
    private var locked: Bool { flow.busy || preparing || fileAction }
    private var filtered: [BuildingDocument] { documents.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) } }
    private var acceptedTypes: [UTType] { [.pdf, .image, UTType(filenameExtension: "dwg") ?? UTType(importedAs: "com.autodesk.dwg")] }
    private func reload() async {
        loading = true; defer { loading = false }
        do { documents = try await model.documents(buildingID: building.id) }
        catch { fileError = error.localizedDescription }
    }
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Label(building.name, systemImage: "building.2.fill").font(.title2.bold()).foregroundStyle(d21Accent)
                    Text(building.address.isEmpty ? "Adresse noch offen" : building.address).foregroundStyle(.secondary)
                    Label("\(documents.count) Dateien auf dem Projektserver", systemImage: "checkmark.icloud").font(.caption).foregroundStyle(.secondary)
                }.padding(.vertical, 10)
            } header: { Text("Deine Gebäudemappe") }
            Section("3D-Modell") {
                NavigationLink { IFCViewer() } label: { Label("IFC-Modell lokal öffnen", systemImage: "cube.transparent") }
            }
            Section("Bilder und Pläne ergänzen") {
                PhotosPicker(selection: $photos, maxSelectionCount: 6, matching: .images) { Label("Fotos auswählen", systemImage: "photo.on.rectangle") }.disabled(locked || flow.loadFailed)
                Button("PDF, DWG oder Bild auswählen", systemImage: "doc.badge.plus") { filePicker = true }.disabled(locked || flow.loadFailed)
                Text("Bis 25 MB pro Datei · 250 MB pro Konto. Bestätigte Uploads erscheinen auch auf der Website.").font(.footnote).foregroundStyle(.secondary)
                if preparing { ProgressView("Dateien werden vorbereitet …") }
                if let success { Label(success, systemImage: "checkmark.circle").font(.footnote).foregroundStyle(.green) }
            }
            if flow.draft.pendingCount > 0 {
                Section("Noch nicht auf dem Server") { UploadQueueView(flow: flow, includeSaved: false) }
            }
            if loading { Section { ProgressView("Dateien werden geladen …") } }
            else if documents.isEmpty { Section { ContentUnavailableView("Deine Mappe wartet auf die erste Datei", systemImage: "folder", description: Text("Füge ein Foto oder einen Plan hinzu. Du kannst jederzeit später weitermachen.")) } }
            else if filtered.isEmpty { Section { Text("Keine Datei mit diesem Namen gefunden.").foregroundStyle(.secondary) } }
            fileSection("Fotos", items: filtered.filter { $0.mime_type.hasPrefix("image/") })
            fileSection("Pläne & Dokumente", items: filtered.filter { !$0.mime_type.hasPrefix("image/") })
            Section {
                Text("Bilder und PDFs öffnen sich als Vorschau. DWG-Pläne kannst du über Teilen in einer passenden CAD-App öffnen.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Gebäudemappe").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Dateien suchen")
        .task { await reload(); flow.clearCompletedQueue() }
        .refreshable { if !locked { await reload() } }
        .onChange(of: flow.lastSavedID) { _, _ in success = "Datei auf dem Projektserver gespeichert."; Task { await reload() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { flow.persist() } }
        .fileImporter(isPresented: $filePicker, allowedContentTypes: acceptedTypes, allowsMultipleSelection: true) { result in
            switch result {
            case .failure(let error): fileError = error.localizedDescription
            case .success(let urls):
                preparing = true; success = nil
                Task {
                    for url in urls { do { try flow.importFile(url) } catch { fileError = error.localizedDescription } }
                    preparing = false; await flow.uploadPending()
                }
            }
        }
        .onChange(of: photos) { _, selection in
            guard !selection.isEmpty else { return }; preparing = true; success = nil
            Task {
                for item in selection {
                    do {
                        guard let data = try await item.loadTransferable(type: Data.self) else { throw DraftStorageError.missingFile }
                        try flow.stage(PhotoPreparation.jpeg(data), name: "Foto-\(UUID().uuidString.prefix(8)).jpg", photo: true)
                    } catch { fileError = error.localizedDescription }
                }
                photos = []; preparing = false; await flow.uploadPending()
            }
        }
        .alert("Datei", isPresented: Binding(get: { fileError != nil || flow.problem != nil }, set: { if !$0 { fileError = nil; flow.problem = nil } })) {
            if flow.loadFailed { Button("Entwurf erneut lesen") { flow.problem = nil; flow.restore() } }
            Button("OK", role: .cancel) { fileError = nil; flow.problem = nil }
        } message: { Text(fileError ?? flow.problem ?? "") }
        .alert("Datei umbenennen", isPresented: Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })) {
            TextField("Dateiname", text: $renameName)
            Button("Abbrechen", role: .cancel) { renameTarget = nil }
            Button("Speichern") {
                guard let document = renameTarget else { return }; renameTarget = nil
                let ext = (document.name as NSString).pathExtension
                fileAction = true
                Task {
                    defer { fileAction = false }
                    do {
                        let updated = try await model.renameDocument(document, name: renameName.trimmingCharacters(in: .whitespacesAndNewlines) + "." + ext)
                        documents = documents.map { $0.id == updated.id ? updated : $0 }; success = "Dateiname gespeichert."
                    } catch { fileError = error.localizedDescription }
                }
            }.disabled(renameName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: { Text("Die Dateiendung bleibt erhalten. Der neue Name gilt auch auf der Website.") }
        .confirmationDialog("Datei wirklich löschen?", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }), titleVisibility: .visible) {
            Button("Vom Projektserver löschen", role: .destructive) {
                guard let document = deleteTarget else { return }; deleteTarget = nil; fileAction = true
                Task {
                    defer { fileAction = false }
                    do { try await model.deleteDocument(document); documents.removeAll { $0.id == document.id }; success = "Datei vom Projektserver gelöscht." }
                    catch { fileError = error.localizedDescription }
                }
            }
            Button("Behalten", role: .cancel) { deleteTarget = nil }
        } message: { Text("„\(deleteTarget?.name ?? "")“ wird für dein Konto auf der Website und in der App entfernt. Dieser Schritt lässt sich nicht rückgängig machen.") }
        .sheet(item: $preview) { item in DocumentPreviewView(item: item) }
    }
    @ViewBuilder private func fileSection(_ title: String, items: [BuildingDocument]) -> some View {
        if !items.isEmpty {
            Section("\(title) (\(items.count))") {
                ForEach(items) { document in
                    HStack(spacing: 12) {
                        Button {
                            fileAction = true; success = nil
                            Task {
                                defer { fileAction = false }
                                do { preview = try await model.previewDocument(document) } catch { fileError = error.localizedDescription }
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: document.mime_type.hasPrefix("image/") ? "photo.fill" : document.mime_type == "application/acad" ? "cube.transparent" : "doc.text.fill").font(.title3).foregroundStyle(d21Accent)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(document.name).foregroundStyle(.primary)
                                    Text(ByteCountFormatter.string(fromByteCount: Int64(document.size), countStyle: .file)).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }.contentShape(Rectangle())
                        }.buttonStyle(.plain).disabled(locked)
                        Menu {
                            Button("Umbenennen", systemImage: "pencil") { renameName = (document.name as NSString).deletingPathExtension; renameTarget = document }
                            Button("Löschen", systemImage: "trash", role: .destructive) { deleteTarget = document }
                        } label: { Image(systemName: "ellipsis.circle").font(.title3).padding(6) }.disabled(locked)
                            .accessibilityLabel("Aktionen für \(document.name)")
                    }
                }
            }
        }
    }
}
