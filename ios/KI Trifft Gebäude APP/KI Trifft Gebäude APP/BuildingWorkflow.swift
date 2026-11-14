import SwiftUI
import MapKit
import RoomPlan
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
            if let lat = draft.latitude, let lon = draft.longitude {
                // Best effort: the building exists either way; the location can be set later in the heatmap.
                let _: BuildingLocationReply? = try? await account.request("buildings/\(building.id)/location", method: "PUT", body: ["latitude": lat, "longitude": lon, "revision": 0])
            }
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
        if url.pathExtension.lowercased() == "ifc", (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) > 20 * 1024 * 1024 { throw APIError(status: 0, message: "IFC-Modelle dürfen maximal 20 MB groß sein.") }
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
    var validAccount: Bool { sameAccount }
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
    /// A document that the server created (e.g. the IFC from a LiDAR room scan) appears in the list like an upload.
    func recordServerDocument(_ document: BuildingDocument) {
        draft.files.append(DraftUpload(id: UUID(), name: document.name, isPhoto: false, state: .saved, document: document))
        lastSavedID = document.id
        _ = persist()
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
    @State private var scanning = false
    @State private var importing = false
    @State private var preparing = false
    let onComplete: (Building) -> Void
    init(model: AccountModel, onComplete: @escaping (Building) -> Void) {
        _flow = StateObject(wrappedValue: BuildingWorkflowModel(account: model))
        self.onComplete = onComplete
    }
    private var step: BuildingStep { flow.draft.step }
    private var locked: Bool { flow.busy || preparing || flow.account.busy || flow.loadFailed }
    private var planTypes: [UTType] { [.pdf, UTType(filenameExtension: "ifc") ?? UTType(importedAs: "org.buildingsmart.ifc"), UTType(filenameExtension: "dwg") ?? UTType(importedAs: "com.autodesk.dwg")] }
    private func advance(_ next: BuildingStep) { withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.22)) { flow.advance(next) } }
    private var titles: [BuildingStep: String] { [.name:"Wie heißt dein Gebäude?", .address:"Wo steht dein Gebäude?", .photos:"Zeig uns dein Gebäude", .plans:"Lade deine Grundrisse hoch", .overview:"Dein Gebäude wird digital"] }
    private var subtitles: [BuildingStep: String] {
        [.name: "Ein Name, den du und dein Team wiedererkennen.",
         .address: "Such die Adresse und setz den Pin aufs Gebäude.",
         .photos: "Ein Bild vom Eingang oder von außen. Geht auch später.",
         .plans: "Grundrisse, ein vorhandenes IFC – oder einfach Räume scannen.",
         .overview: "Alles bereit. Jetzt kann dein 3D-Modell entstehen."]
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    BuildingStepHeader(step: step).padding(.top, 4)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(titles[step] ?? "").font(.system(.largeTitle, design: .rounded, weight: .bold)).fixedSize(horizontal: false, vertical: true)
                        Text(subtitles[step] ?? "").font(.subheadline).foregroundStyle(.secondary)
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        switch step {
                        case .name:
                            VStack(alignment: .leading, spacing: 8) {
                                TextField("Zum Beispiel: Gebäude D21", text: $flow.draft.name)
                                    .font(.title3.weight(.semibold)).padding(16).d21Card(cornerRadius: 18)
                                    .disabled(flow.draft.building != nil).accessibilityIdentifier("building-name").submitLabel(.next)
                                    .onSubmit { if !flow.draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { advance(.address) } }
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        ForEach(["Wohnhaus", "Bürogebäude", "Hörsaalgebäude", "Labor", "Schule"], id: \.self) { suggestion in
                                            Button(suggestion) { flow.draft.name = suggestion }.font(.footnote.weight(.semibold)).buttonStyle(.bordered).tint(d21Accent)
                                        }
                                    }
                                }.disabled(flow.draft.building != nil)
                            }
                        case .address:
                            if flow.draft.building == nil {
                                AddressPicker(address: $flow.draft.address, latitude: $flow.draft.latitude, longitude: $flow.draft.longitude, name: flow.draft.name, locked: locked)
                                Text("Mit „Gebäude anlegen“ wird dein Gebäude auf dem Projektserver gespeichert. Die Adresse ist optional.").font(.footnote).foregroundStyle(.secondary)
                            } else {
                                Label(flow.draft.address.isEmpty ? "Adresse noch offen" : flow.draft.address, systemImage: "house.fill").font(.headline).padding(16).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 18)
                                Text("Dein Gebäude ist bereits auf dem Server gespeichert.").font(.footnote).foregroundStyle(.secondary)
                            }
                        case .photos:
                            PhotosPicker(selection: $photos, maxSelectionCount: 6, matching: .images) {
                                BuildingOptionTile(symbol: "photo.on.rectangle.angled", color: .pink, title: "Fotos auswählen", subtitle: "Bis zu 6 Bilder aus deiner Mediathek")
                            }.buttonStyle(BuildingTileButtonStyle()).disabled(locked)
                            Button { importing = true } label: {
                                BuildingOptionTile(symbol: "folder.fill", color: .blue, title: "Bild aus Dateien", subtitle: "JPG, PNG oder HEIC aus der Dateien-App")
                            }.buttonStyle(BuildingTileButtonStyle()).disabled(locked)
                            #if DEBUG
                            if WorkflowPreview.enabled { Button("Testfoto hinzufügen") { Task { do { try flow.stage(WorkflowPreview.photo, name: "Eingang.jpg", photo: true); await flow.uploadPending() } catch { flow.problem = error.localizedDescription } } } }
                            #endif
                            DraftPhotoGrid(flow: flow)
                            if flow.draft.files.contains(where: { $0.isPhoto && $0.state != .saved }) { UploadQueueView(flow: flow, includeSaved: false) }
                        case .plans:
                            if RoomCaptureSession.isSupported {
                                Button { scanning = true } label: {
                                    BuildingOptionTile(symbol: "camera.metering.matrix", color: .indigo, title: "Räume mit LiDAR scannen", subtitle: "Wände, Türen, Fenster und Möbel erfassen – daraus entsteht ein IFC-Modell")
                                }.buttonStyle(BuildingTileButtonStyle()).disabled(locked)
                            }
                            Button { importing = true } label: {
                                BuildingOptionTile(symbol: "doc.badge.plus", color: d21Accent, title: "Pläne oder IFC hochladen", subtitle: "Bemaßte PDF-Grundrisse, IFC (bis 20 MB) oder DWG")
                            }.buttonStyle(BuildingTileButtonStyle()).disabled(locked)
                            Label("Aus PDF-Grundrissen kann im nächsten Schritt ein 3D-Entwurf auf dem Server entstehen. Ein IFC – hochgeladen oder gescannt – öffnet sich direkt in 3D.", systemImage: "info.circle").font(.caption).foregroundStyle(.secondary)
                            #if DEBUG
                            if WorkflowPreview.enabled { Button("Testplan hinzufügen") { Task { do { try flow.stage(WorkflowPreview.pdf, name: "Grundriss.pdf", photo: false); await flow.uploadPending() } catch { flow.problem = error.localizedDescription } } } }
                            #endif
                            UploadQueueView(flow: flow)
                        case .overview:
                            overview
                        }
                    }
                }.padding(20).id(step).transition(.opacity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(flow.draft.building == nil ? "Neues Gebäude" : "Gebäude ergänzen").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Später") { flow.persist(); dismiss() }.disabled(flow.busy)
                }
                ToolbarItem(placement: .primaryAction) {
                    if flow.localSaved { Image(systemName: "checkmark.icloud").foregroundStyle(.secondary).accessibilityLabel("Zwischenstand auf diesem iPhone gespeichert") }
                }
            }
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
            .fullScreenCover(isPresented: $scanning) {
                RoomScanView(buildingName: flow.draft.building?.name ?? flow.draft.name, account: flow.account, buildingID: flow.draft.building?.id, serverDocument: flow.recordServerDocument) { data, name in
                    do { try flow.stage(data, name: name, photo: false); await flow.uploadPending() }
                    catch { flow.problem = error.localizedDescription }
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
    @ViewBuilder private var overview: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let lat = flow.draft.latitude, let lon = flow.draft.longitude {
                Map(initialPosition: .camera(MapCamera(centerCoordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon), distance: 500, pitch: 50)), interactionModes: []) {
                    Marker(flow.draft.name, systemImage: "building.2.fill", coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)).tint(d21Accent)
                }.mapStyle(.standard(elevation: .realistic, pointsOfInterest: .excludingAll)).frame(height: 150).allowsHitTesting(false)
            }
            VStack(alignment: .leading, spacing: 10) {
                Text(flow.draft.building?.name ?? flow.draft.name).font(.system(.title2, design: .rounded, weight: .bold))
                Label(flow.draft.address.isEmpty ? "Adresse noch offen" : flow.draft.address, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    summaryChip("photo", "\(flow.draft.files.filter { $0.state == .saved && $0.isPhoto }.count) Fotos")
                    summaryChip("doc.text", "\(flow.draft.files.filter { $0.state == .saved && !$0.isPhoto }.count) Pläne")
                    if flow.draft.files.contains(where: { $0.state == .saved && $0.name.lowercased().hasSuffix(".ifc") }) { summaryChip("cube.fill", "3D-Modell") }
                }
            }.padding(16)
        }.d21Card(cornerRadius: 22)
        if flow.draft.pendingCount > 0 { Label("\(flow.draft.pendingCount) Datei(en) sind noch nicht auf dem Server. Du kannst den Upload wiederholen oder diesen Entwurf später fortsetzen.", systemImage: "exclamationmark.icloud").font(.footnote).foregroundStyle(.orange) }
        else { Text("Dein Gebäude und die bestätigten Uploads sind auch auf der Website mit demselben Konto verfügbar. Fehlendes ergänzt du jederzeit in der Gebäudemappe.").font(.footnote).foregroundStyle(.secondary) }
        UploadQueueView(flow: flow, includeSaved: false)
        if let building = flow.draft.building, flow.draft.pendingCount == 0 {
            GuidedGenerationView(flow: flow, building: building)
        }
    }
    private func summaryChip(_ symbol: String, _ text: String) -> some View {
        Label(text, systemImage: symbol).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6).background(d21Accent.opacity(0.12), in: Capsule()).foregroundStyle(d21Accent)
    }
    private var footer: some View {
        HStack(spacing: 12) {
            if step.rawValue > 1 {
                Button { advance(BuildingStep(rawValue: step.rawValue - 1) ?? .name) } label: { Image(systemName: "chevron.left").font(.headline).frame(width: 52, height: 52).background(Color(uiColor: .secondarySystemGroupedBackground), in: Circle()) }
                    .buttonStyle(.plain).disabled(locked).accessibilityLabel("Zurück")
            }
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
            } label: {
                HStack(spacing: 8) {
                    if flow.busy { ProgressView().tint(.white) }
                    Text(buttonTitle).font(.headline)
                    if !flow.busy { Image(systemName: step == .overview ? "folder.fill" : "arrow.right") }
                }.foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 52).background(primaryDisabled ? AnyShapeStyle(Color(uiColor: .systemGray3)) : AnyShapeStyle(d21Accent.gradient), in: Capsule())
            }.buttonStyle(BuildingTileButtonStyle()).disabled(primaryDisabled)
        }.padding(.horizontal, 20).padding(.vertical, 12).background(.bar)
    }
    private var primaryDisabled: Bool { locked || (step == .name && (flow.draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || flow.draft.name.count > 200)) || (step == .address && flow.draft.address.count > 500) }
    private var buttonTitle: String {
        switch step {
        case .name: "Weiter"
        case .address: flow.busy ? "Wird angelegt …" : flow.draft.building == nil ? "Gebäude anlegen" : "Weiter zu den Fotos"
        case .photos: "Weiter"
        case .plans: "Weiter zur Übersicht"
        case .overview: flow.draft.pendingCount > 0 ? "Erneut übertragen" : "Gebäude öffnen"
        }
    }
}
