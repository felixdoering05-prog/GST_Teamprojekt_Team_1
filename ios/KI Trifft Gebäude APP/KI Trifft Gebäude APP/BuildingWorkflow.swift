import SwiftUI
import Combine
import PhotosUI
import UniformTypeIdentifiers

@MainActor final class BuildingWorkflowModel: ObservableObject {
    @Published var draft: BuildingDraft
    @Published var busy = false
    @Published var progress: [UUID: Double] = [:]
    @Published var problem: String?
    @Published var localSaved = false
    @Published var loadFailed = false
    @Published var lastSavedID: Int?
    let account: AccountModel
    let store: BuildingDraftStore
    private let existingBuilding: Building?
    private let originalServer: String
    private let originalUserID: Int?

    init(account: AccountModel, building: Building? = nil) {
        self.account = account; existingBuilding = building
        originalServer = account.serverURL; originalUserID = account.user?.id
        store = account.draftStore(buildingID: building?.id) ?? BuildingDraftStore(scope: "signed-out")
        draft = BuildingDraft(building: building)
        restore()
    }
    func restore() {
        do {
            if let saved = try store.load() { draft = saved; localSaved = true }
            loadFailed = false
        } catch { loadFailed = true; problem = "Der lokale Entwurf konnte nicht gelesen werden. Er wurde nicht überschrieben. " + error.localizedDescription }
    }
    @discardableResult func persist() -> Bool {
        guard !loadFailed else { return false }
        do { try store.save(draft); localSaved = true; return true }
        catch { localSaved = false; problem = "Der Zwischenstand konnte auf diesem iPhone nicht gespeichert werden. " + error.localizedDescription; return false }
    }
    func advance(_ step: BuildingStep) { draft.step = step; _ = persist() }
    func createBuilding() async {
        guard !busy, !loadFailed, sameAccount else { return }
        guard draft.building == nil else { advance(.photos); return }
        guard persist() else { return }
        busy = true; defer { busy = false }
        if let building = await account.addBuilding(name: draft.name.trimmingCharacters(in: .whitespacesAndNewlines), address: draft.address.trimmingCharacters(in: .whitespacesAndNewlines), requestID: draft.id) {
            draft.building = building; draft.name = building.name; draft.address = building.address
            advance(.photos)
        } else { problem = account.error; account.error = nil }
    }
    func stage(_ data: Data, name: String, photo: Bool) throws {
        let item = try store.stage(data: data, name: name, isPhoto: photo)
        draft.files.append(item)
        guard persist() else {
            draft.files.removeAll { $0.id == item.id }; try? store.removePayload(item)
            throw APIError(status: 0, message: "Die Datei konnte lokal nicht vorgemerkt werden. Bitte erneut auswählen.")
        }
    }
    func importFile(_ url: URL) throws {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 25 * 1024 * 1024 else { throw DraftStorageError.tooLarge }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        if UTType(filenameExtension: url.pathExtension)?.conforms(to: .image) == true {
            let stem = url.deletingPathExtension().lastPathComponent
            try stage(PhotoPreparation.jpeg(data), name: String(stem.prefix(180)) + ".jpg", photo: true)
        } else { try stage(data, name: url.lastPathComponent, photo: false) }
    }
    func removePending(_ item: DraftUpload) {
        guard !busy, item.state != .saved else { return }
        let old = draft.files
        draft.files.removeAll { $0.id == item.id }
        if persist() { try? store.removePayload(item) } else { draft.files = old }
    }
    private var sameAccount: Bool {
        guard account.serverURL == originalServer, account.user?.id == originalUserID, originalUserID != nil else {
            problem = "Konto oder Server wurde gewechselt. Öffne diesen Entwurf im ursprünglichen Konto erneut."
            return false
        }
        return true
    }
    func uploadPending() async {
        guard !busy, !loadFailed, sameAccount, let building = draft.building else { return }
        busy = true; defer { busy = false }
        let ids = draft.files.filter { $0.state != .saved }.map(\.id)
        for id in ids {
            guard sameAccount else { return }
            guard let index = draft.files.firstIndex(where: { $0.id == id }) else { continue }
            draft.files[index].state = .uploading; draft.files[index].problem = nil; progress[id] = 0
            guard persist() else { draft.files[index].state = .queued; return }
            do {
                let item = draft.files[index]
                let bytes = try store.data(for: item)
                let document = try await account.uploadDocument(buildingID: building.id, name: item.name, data: bytes, uploadID: item.id) { [weak self] value in self?.progress[id] = value }
                draft.files[index].state = .saved; draft.files[index].document = document; progress[id] = 1
                lastSavedID = document.id
            } catch {
                draft.files[index].state = .failed
                if let network = error as? URLError, [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost].contains(network.code) {
                    draft.files[index].problem = "Keine stabile Verbindung. Die Datei bleibt auf diesem iPhone für einen neuen Versuch vorgemerkt."
                } else { draft.files[index].problem = error.localizedDescription }
            }
            if !persist() { return }
        }
    }
    func clearCompletedQueue() {
        guard !busy, existingBuilding != nil else { return }
        let saved = draft.files.filter { $0.state == .saved }
        draft.files.removeAll { $0.state == .saved }
        if persist() { for item in saved { try? store.removePayload(item) } }
    }
}

struct UploadQueueView: View {
    @ObservedObject var flow: BuildingWorkflowModel
    var includeSaved = true
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(flow.draft.files.filter { includeSaved || $0.state != .saved }) { item in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        Image(systemName: item.isPhoto ? "photo" : "doc.text").foregroundStyle(d21Accent)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.document?.name ?? item.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                            if item.state == .saved { Label("Auf dem Projektserver gespeichert", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(.green) }
                            else if item.state == .uploading { Text((flow.progress[item.id] ?? 0) >= 1 ? "Warte auf Bestätigung vom Server …" : "Wird übertragen …").font(.caption).foregroundStyle(.secondary) }
                            else { Text(item.state == .failed ? "Noch nicht hochgeladen" : "Auf diesem iPhone vorgemerkt").font(.caption).foregroundStyle(.secondary) }
                        }
                        Spacer(minLength: 0)
                        if item.state != .saved && !flow.busy {
                            Button { flow.removePending(item) } label: { Image(systemName: "xmark.circle") }.buttonStyle(.plain)
                                .accessibilityLabel("\(item.name) aus der Upload-Liste entfernen")
                        }
                    }
                    if item.state == .uploading { ProgressView(value: min(flow.progress[item.id] ?? 0, 0.99)).tint(d21Accent) }
                    if let message = item.problem { Text(message).font(.caption).foregroundStyle(.orange) }
                }.padding(14).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
            }
            if flow.draft.pendingCount > 0 {
                Button { Task { await flow.uploadPending() } } label: {
                    Label(flow.busy ? "Upload läuft …" : "Ausstehende Dateien übertragen (\(flow.draft.pendingCount))", systemImage: "arrow.clockwise.icloud")
                }.disabled(flow.busy || flow.loadFailed)
                Text("Bei einem Fehler kannst du erneut starten. Du musst die Datei nicht nochmals auswählen. Lass die App während der Übertragung geöffnet.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct AddBuildingView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var flow: BuildingWorkflowModel
    @State private var photos: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var preparing = false
    let onComplete: (Building) -> Void
    init(model: AccountModel, onComplete: @escaping (Building) -> Void) {
        _flow = StateObject(wrappedValue: BuildingWorkflowModel(account: model))
        self.onComplete = onComplete
    }
    private var step: BuildingStep { flow.draft.step }
    private var locked: Bool { flow.busy || preparing || flow.account.busy || flow.loadFailed }
    private var planTypes: [UTType] { [.pdf, UTType(filenameExtension: "dwg") ?? UTType(importedAs: "com.autodesk.dwg")] }
    private func advance(_ next: BuildingStep) { withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.22)) { flow.advance(next) } }
    private var titles: [BuildingStep: String] { [.name:"Wie heißt dein Gebäude?", .address:"Wo steht dein Gebäude?", .photos:"Zeig uns dein Gebäude", .plans:"Hast du schon einen Plan?", .overview:"Deine Gebäudemappe ist bereit"] }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("SCHRITT \(step.rawValue) VON 5").font(.caption.weight(.semibold)).tracking(2).foregroundStyle(d21Accent)
                        ProgressView(value: Double(step.rawValue), total: 5).tint(d21Accent)
                        HStack { ForEach(BuildingStep.allCases, id: \.rawValue) { item in Text(item.title).font(.caption2).fontWeight(item == step ? .bold : .regular); if item != .overview { Spacer(minLength: 0) } } }.foregroundStyle(.secondary)
                    }.accessibilityElement(children: .combine)
                    VStack(alignment: .leading, spacing: 18) {
                        Image(systemName: step == .photos ? "photo.circle.fill" : step == .plans ? "doc.circle.fill" : step == .overview ? "checkmark.seal.fill" : "building.2.crop.circle.fill").font(.system(size: 56)).foregroundStyle(d21Accent)
                        Text(titles[step] ?? "").font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
                        switch step {
                        case .name:
                            Text("Wähle einen Namen, den du später leicht wiedererkennst.").foregroundStyle(.secondary)
                            TextField("Zum Beispiel: Gebäude D21", text: $flow.draft.name).textFieldStyle(.roundedBorder).disabled(flow.draft.building != nil).accessibilityIdentifier("building-name")
                        case .address:
                            Text("Ergänze Straße und Ort. Du kannst die Adresse auch später ergänzen.").foregroundStyle(.secondary)
                            TextField("Adresse (optional)", text: $flow.draft.address, axis: .vertical).lineLimit(2...4).textFieldStyle(.roundedBorder).disabled(flow.draft.building != nil).accessibilityIdentifier("building-address")
                            Text(flow.draft.building == nil ? "Mit Weiter wird dein Gebäude auf dem Projektserver angelegt." : "Dein Gebäude ist bereits auf dem Server gespeichert.").font(.footnote).foregroundStyle(.secondary)
                        case .photos:
                            Text("Ein Bild vom Eingang oder von außen hilft dir beim Wiedererkennen. Du kannst Fotos auch später hinzufügen.").foregroundStyle(.secondary)
                            PhotosPicker(selection: $photos, maxSelectionCount: 6, matching: .images) { Label("Fotos auswählen", systemImage: "photo.on.rectangle") }.buttonStyle(.borderedProminent).disabled(locked)
                            Button("Bild aus Dateien auswählen", systemImage: "folder") { importing = true }.disabled(locked)
                            #if DEBUG
                            if WorkflowPreview.enabled { Button("Testfoto hinzufügen") { Task { do { try flow.stage(WorkflowPreview.photo, name: "Eingang.jpg", photo: true); await flow.uploadPending() } catch { flow.problem = error.localizedDescription } } } }
                            #endif
                            UploadQueueView(flow: flow)
                        case .plans:
                            Text("Wähle einen Grundriss oder Bauplan als PDF oder DWG. Noch keinen Plan? Überspringe den Schritt einfach.").foregroundStyle(.secondary)
                            Button("PDF oder DWG auswählen", systemImage: "doc.badge.plus") { importing = true }.buttonStyle(.borderedProminent).disabled(locked)
                            Text("Bis 25 MB pro Datei. DWG-Dateien werden gespeichert und lassen sich später an eine CAD-App weitergeben.").font(.footnote).foregroundStyle(.secondary)
                            #if DEBUG
                            if WorkflowPreview.enabled { Button("Testplan hinzufügen") { Task { do { try flow.stage(WorkflowPreview.pdf, name: "Grundriss.pdf", photo: false); await flow.uploadPending() } catch { flow.problem = error.localizedDescription } } } }
                            #endif
                            UploadQueueView(flow: flow)
                        case .overview:
                            Label(flow.draft.building?.name ?? flow.draft.name, systemImage: "building.2").font(.title3.bold())
                            Text(flow.draft.address.isEmpty ? "Adresse noch offen" : flow.draft.address).foregroundStyle(.secondary)
                            Label("\(flow.draft.files.filter { $0.state == .saved && $0.isPhoto }.count) Fotos gespeichert", systemImage: "photo")
                            Label("\(flow.draft.files.filter { $0.state == .saved && !$0.isPhoto }.count) Pläne gespeichert", systemImage: "doc.text")
                            if flow.draft.pendingCount > 0 { Text("\(flow.draft.pendingCount) Datei(en) sind noch nicht auf dem Server. Du kannst den Upload wiederholen oder diesen Entwurf später fortsetzen.").foregroundStyle(.orange) }
                            else { Text("Dein Gebäude und die bestätigten Uploads sind auch auf der Website mit demselben Konto verfügbar. Fehlende Bilder oder Pläne ergänzt du jederzeit in der Gebäudemappe.").foregroundStyle(.secondary) }
                            UploadQueueView(flow: flow)
                        }
                    }.id(step).transition(.opacity)
                    if preparing { ProgressView("Dateien werden auf diesem iPhone vorbereitet …") }
                    if flow.localSaved { Label("Zwischenstand auf diesem iPhone gespeichert", systemImage: "iphone.and.arrow.forward").font(.caption).foregroundStyle(.secondary) }
                }.padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Neues Gebäude").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Später fortsetzen") { if flow.persist() { dismiss() } }.disabled(flow.busy || preparing || flow.loadFailed) } }
            .safeAreaInset(edge: .bottom) { footer }
            .interactiveDismissDisabled()
            .onChange(of: flow.draft.name) { _, _ in flow.persist() }
            .onChange(of: flow.draft.address) { _, _ in flow.persist() }
            .onChange(of: scenePhase) { _, phase in if phase != .active { flow.persist() } }
            .alert("Gebäudemappe", isPresented: Binding(get: { flow.problem != nil }, set: { if !$0 { flow.problem = nil } })) {
                if flow.loadFailed { Button("Erneut lesen") { flow.problem = nil; flow.restore() }; Button("Schließen", role: .cancel) { dismiss() } }
                else { Button("OK") { flow.problem = nil } }
            } message: { Text(flow.problem ?? "") }
            .onChange(of: photos) { _, selection in
                guard !selection.isEmpty else { return }; preparing = true
                Task {
                    for item in selection {
                        do {
                            guard let data = try await item.loadTransferable(type: Data.self) else { throw DraftStorageError.missingFile }
                            try flow.stage(PhotoPreparation.jpeg(data), name: "Foto-\(UUID().uuidString.prefix(8)).jpg", photo: true)
                        } catch { flow.problem = error.localizedDescription }
                    }
                    photos = []; preparing = false
                    await flow.uploadPending()
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: step == .photos ? [.image] : planTypes, allowsMultipleSelection: true) { result in
                switch result {
                case .failure(let error): flow.problem = error.localizedDescription
                case .success(let urls):
                    preparing = true
                    Task {
                        for url in urls { do { try flow.importFile(url) } catch { flow.problem = error.localizedDescription } }
                        preparing = false; await flow.uploadPending()
                    }
                }
            }
        }
    }
    private var footer: some View {
        VStack(spacing: 12) {
            Button {
                switch step {
                case .name: advance(.address)
                case .address: Task { await flow.createBuilding() }
                case .photos: advance(.plans)
                case .plans: advance(.overview)
                case .overview:
                    if flow.draft.pendingCount > 0 { Task { await flow.uploadPending() } }
                    else if let building = flow.draft.building {
                        do { try flow.store.clear(); onComplete(building) } catch { flow.problem = error.localizedDescription }
                    }
                }
            } label: { HStack { Text(buttonTitle).font(.headline); Image(systemName: step == .overview ? "folder" : "arrow.right") }.frame(maxWidth: .infinity).padding(.vertical, 12) }
                .buttonStyle(.borderedProminent).disabled(locked || (step == .name && (flow.draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || flow.draft.name.count > 200)) || (step == .address && flow.draft.address.count > 500))
            if step.rawValue > 1 { Button("Zurück") { advance(BuildingStep(rawValue: step.rawValue - 1) ?? .name) }.disabled(locked) }
        }.padding().background(.regularMaterial)
    }
    private var buttonTitle: String {
        switch step {
        case .name: "Weiter zur Adresse"
        case .address: flow.busy ? "Gebäude wird gespeichert …" : "Weiter zu den Fotos"
        case .photos: "Weiter zu den Plänen"
        case .plans: "Zur Übersicht"
        case .overview: flow.draft.pendingCount > 0 ? "Ausstehende Dateien erneut übertragen" : "Gebäudemappe öffnen"
        }
    }
}
