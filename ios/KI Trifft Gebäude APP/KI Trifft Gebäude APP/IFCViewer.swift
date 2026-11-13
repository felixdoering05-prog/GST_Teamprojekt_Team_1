import SwiftUI
import Combine
import WebKit
import MapKit
import UniformTypeIdentifiers

struct IFCLibraryView: View {
    @ObservedObject var model: AccountModel
    let smartHome: Bool
    @StateObject private var library: IFCLibraryState
    @State private var search = ""
    @State private var openingID: Int?
    @State private var downloadTask: Task<Void, Never>?
    @State private var downloadOperation = UUID()
    @State private var downloadFailure: BuildingDocument?
    @State private var downloadMessage = ""
    @State private var preview: DocumentPreview?
    private var scope: String { model.serverURL + "#" + String(model.user?.id ?? -1) }
    init(model: AccountModel, smartHome: Bool = false, buildingID: Int? = nil) {
        self.model = model
        self.smartHome = smartHome
        _library = StateObject(wrappedValue: IFCLibraryState(source: IFCLibrarySource(
            scope: { model.user.map { model.serverURL + "#" + String($0.id) } },
            buildings: { let all = try await model.fetchBuildings(); return all.filter { buildingID == nil || $0.id == buildingID } },
            documents: { try await model.documents(buildingID: $0) }
        )))
    }
    private func open(_ document: BuildingDocument) {
        guard openingID == nil else { return }
        let originalScope = scope, operation = UUID()
        downloadOperation = operation
        openingID = document.id; downloadFailure = nil
        downloadTask = Task {
            defer { if scope == originalScope && downloadOperation == operation { openingID = nil; downloadTask = nil } }
            do {
                let item = try await model.previewDocument(document)
                guard !Task.isCancelled, scope == originalScope, downloadOperation == operation else {
                    try? FileManager.default.removeItem(at: item.url.deletingLastPathComponent()); return
                }
                preview = item
            } catch {
                guard !Task.isCancelled, scope == originalScope, downloadOperation == operation else { return }
                downloadFailure = document; downloadMessage = error.localizedDescription
            }
        }
    }
    private func cancelDownload() {
        downloadOperation = UUID()
        downloadTask?.cancel(); downloadTask = nil; openingID = nil; downloadFailure = nil
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Label(smartHome ? "Licht im Modell simulieren" : "Deine Gebäude in 3D", systemImage: smartHome ? "lightbulb" : "cube.transparent").font(.title2.bold())
                    Text(smartHome ? "Öffne ein IFC-Modell mit exportierten Räumen. Schalte das simulierte Licht pro Raum und sieh die Markierung im Modell. Keine Verbindung zu echten Lampen." : "Gespeichert auf dem Projektserver. Öffne dein Modell und entdecke die Bauteile.").foregroundStyle(.secondary)
                    if !library.entries.isEmpty {
                        Text("\(library.entries.count) Modell(e) · \(library.buildings.count) Gebäude").font(.caption).foregroundStyle(.secondary)
                    }
                    #if DEBUG
                    if WorkflowPreview.enabled { Label("VORSCHAU · Lokale Testdaten", systemImage: "testtube.2").font(.caption.bold()).foregroundStyle(.orange) }
                    #endif
                }
                if library.refreshing {
                    ProgressView(library.entries.isEmpty ? "Modelle werden geladen …" : "Modelle werden aktualisiert …")
                        .frame(maxWidth: .infinity, alignment: .leading).accessibilityLabel("IFC-Modelle werden vom Server geladen")
                }
                if let message = library.listError {
                    notice(title: "Verbindung zum Projektserver fehlt", message: message + " Bereits geladene Modelle bleiben sichtbar.", busy: library.refreshing) {
                        Task { await library.refresh() }
                    }
                }
                ForEach(library.buildings.filter { library.buildingErrors[$0.id] != nil }) { building in
                    notice(title: "\(building.name) konnte nicht aktualisiert werden", message: (library.buildingErrors[building.id] ?? "") + (library.documents[building.id] == nil ? "" : " Der zuletzt geladene Stand bleibt sichtbar."), busy: library.refreshing || library.loadingBuildings.contains(building.id)) {
                        Task { await library.retry(building) }
                    }
                }
                if let document = downloadFailure {
                    notice(title: "„\(document.name)“ konnte nicht geöffnet werden", message: downloadMessage, busy: openingID != nil) { open(document) }
                }
                let matches = library.matching(search)
                if !matches.isEmpty {
                    LazyVStack(spacing: 14) {
                        ForEach(matches) { entry in modelCard(entry) }
                    }
                } else if !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    ContentUnavailableView("Keine Suchergebnisse", systemImage: "magnifyingglass", description: Text("Für „\(search)“ wurde in den geladenen Modellen kein Datei- oder Gebäudename gefunden."))
                } else if library.hasLoaded && !library.refreshing && library.listError == nil && library.buildingErrors.isEmpty {
                    ContentUnavailableView {
                        Label(library.buildings.isEmpty ? "Dein erstes Gebäude wartet" : "Noch keine IFC-Modelle", systemImage: "cube.transparent")
                    } description: {
                        Text(library.buildings.isEmpty ? "Lege im Gebäude-Tab ein Gebäude an. Im Schritt Pläne kannst du ein IFC-Modell hochladen." : "Öffne unten eine Gebäudemappe und lade deine IFC-Datei hoch. Danach erscheint dein Modell hier.")
                    }
                }
                if !library.buildings.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Modell hochladen").font(.headline)
                        Text("Wähle das Gebäude für deine IFC-Datei.").font(.subheadline).foregroundStyle(.secondary)
                        ForEach(library.buildings) { building in
                            NavigationLink { BuildingDetailView(building: building, model: model) } label: {
                                Label(building.name, systemImage: "icloud.and.arrow.up").frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
                            }.accessibilityLabel("IFC-Modell für \(building.name) hochladen oder Dateien verwalten")
                            if building.id != library.buildings.last?.id { Divider() }
                        }
                    }.padding(18).background(.background, in: RoundedRectangle(cornerRadius: 20))
                }
                NavigationLink { IFCViewer(smartHome: smartHome) } label: { Label("Lokale IFC-Datei ohne Upload öffnen", systemImage: "folder").padding(.vertical, 8) }
                Text("IFC2x3 / IFC4 · bis 20 MB pro Modell · 250 MB pro Konto. Zum Öffnen gespeicherter Modelle brauchst du eine Internetverbindung.")
                    .font(.footnote).foregroundStyle(.secondary)
            }.padding(20).frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(smartHome ? "Smart Home" : "IFC-Modelle").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Modell oder Gebäude suchen")
        .task(id: scope) { await library.refresh() }
        .refreshable { await library.refresh() }
        .onChange(of: scope) { _, _ in cancelDownload(); preview = nil; search = "" }
        .onDisappear { cancelDownload() }
        .sheet(item: $preview) { DocumentPreviewView(item: $0, smartHome: smartHome) }
    }
    private func modelCard(_ entry: IFCModelEntry) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "cube.transparent").font(.title).foregroundStyle(d21Accent)
                .frame(width: 56, height: 56).background(d21Accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 14)).accessibilityHidden(true)
            Text(entry.document.name).font(.headline).fixedSize(horizontal: false, vertical: true)
            Label(entry.building.name, systemImage: "building.2").font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Text(ByteCountFormatter.string(fromByteCount: Int64(entry.document.size), countStyle: .file) + " · Auf dem Server")
                .font(.caption).foregroundStyle(.secondary)
            Button { open(entry.document) } label: {
                HStack(spacing: 10) {
                    if openingID == entry.id { ProgressView().tint(.white) }
                    Text(openingID == entry.id ? "Modell wird geladen …" : (smartHome ? "Lichtsimulation öffnen" : "In 3D öffnen")).fixedSize(horizontal: false, vertical: true)
                    if openingID != entry.id { Image(systemName: "arrow.up.right") }
                }.frame(maxWidth: .infinity).padding(.vertical, 8)
            }.buttonStyle(.borderedProminent).tint(d21Accent).disabled(openingID != nil)
                .accessibilityLabel("\(entry.document.name) für \(entry.building.name) in 3D öffnen")
                .accessibilityValue(openingID == entry.id ? "Download läuft" : "")
                .accessibilityHint("Lädt das Modell vom Projektserver herunter")
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(.background, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(d21Accent.opacity(0.12)))
            .accessibilityElement(children: .contain)
    }
    private func notice(title: String, message: String, busy: Bool, retry: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: "exclamationmark.icloud").font(.headline).fixedSize(horizontal: false, vertical: true)
            Text(message).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Button(action: retry) { Label(busy ? "Wird erneut geladen …" : "Erneut versuchen", systemImage: "arrow.clockwise") }
                .buttonStyle(.bordered).disabled(busy)
                .accessibilityLabel("Erneut versuchen: \(title)")
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
            .accessibilityElement(children: .contain)
    }
}

struct IFCStoredModelView: View {
    let url: URL
    var smartHome = false
    var account: AccountModel? = nil
    var buildingID: Int? = nil
    var documentID: Int? = nil
    @State private var showMap = false
    @State private var autoPlace = false
    @State private var canAlign = false
    @State private var canRotate = false
    @State private var rotating = false
    @State private var rotationProblem: String?
    @State private var reload = 0
    var body: some View {
        IFCWebView(modelURL: url, account: account, buildingID: buildingID, documentID: documentID).id(reload)
        .overlay(alignment: .bottom) {
            if canAlign {
                Button { autoPlace = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "map.fill").font(.title3).foregroundStyle(.white).frame(width: 40, height: 40).background(d21Accent.gradient, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Auf Karte ausrichten").font(.subheadline.weight(.semibold))
                            Text("Straßen, Nachbargebäude und Schatten anzeigen").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "sparkles").foregroundStyle(d21Accent)
                    }.padding(12).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }.buttonStyle(.plain).padding(.horizontal, 16).padding(.bottom, 56)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .toolbar {
            if account != nil, documentID != nil, account?.buildings.first(where:{$0.id==buildingID})?.is_owner != false {
                ToolbarItem(placement:.topBarTrailing) {
                    Menu {
                        if canRotate {
                            Section("Ausrichtung korrigieren") {
                                Button("90° nach rechts drehen", systemImage: "rotate.right") { Task { await rotate(by: 90) } }
                                Button("90° nach links drehen", systemImage: "rotate.left") { Task { await rotate(by: -90) } }
                                Button("Um 180° drehen", systemImage: "arrow.triangle.2.circlepath") { Task { await rotate(by: 180) } }
                            }
                        }
                        Button("Kartenumgebung bearbeiten", systemImage: "map") { showMap = true }
                    } label: { if rotating { ProgressView() } else { Image(systemName: "map") } }
                    .disabled(rotating).accessibilityLabel("Karte und Ausrichtung")
                }
            }
        }
        .alert("Ausrichtung", isPresented: Binding(get: { rotationProblem != nil }, set: { if !$0 { rotationProblem = nil } })) { Button("OK", role: .cancel) {} } message: { Text(rotationProblem ?? "") }
        .sheet(isPresented:$showMap, onDismiss: { reload += 1; Task { await checkPlacement() } }) {if let account,let documentID {ModelMapPlacementView(account:account,documentID:documentID)}}
        .sheet(isPresented:$autoPlace, onDismiss: { reload += 1; Task { await checkPlacement() } }) {if let account,let documentID {ModelMapPlacementView(account:account,documentID:documentID,autoStart:true)}}
        .task { await checkPlacement() }
    }
    /// Turns the saved placement (map vs. model) by a quarter or half turn; fixes the 90°/180° ambiguity
    /// of the automatic outline match. The existing map data is kept.
    private func rotate(by delta: Double) async {
        guard let account, let documentID, !rotating else { return }
        rotating = true; defer { rotating = false }
        do {
            let current: ModelMapSettingsReply = try await account.request("documents/\(documentID)/map-view")
            guard let view = current.map_view else { return }
            let heading = (view.heading + delta).truncatingRemainder(dividingBy: 360)
            let saved: ModelMapSettingsReply = try await account.request("documents/\(documentID)/map-view", method: "PUT", body: ["latitude": view.latitude, "longitude": view.longitude, "heading": heading < 0 ? heading + 360 : heading, "meters_per_unit": view.meters_per_unit, "revision": view.revision])
            if saved.map_view?.loaded_at == nil, let revision = saved.map_view?.revision {
                let _: ModelMapSettingsReply = try await account.request("documents/\(documentID)/map-view/load", method: "POST", body: ["revision": revision], timeout: 30)
            }
            reload += 1
        } catch { rotationProblem = error.localizedDescription }
    }
    /// Offers one-tap alignment when the model has no map placement yet and the person may edit it.
    private func checkPlacement() async {
        guard let account, let documentID else { return }
        do {
            let meta: GeoreferenceMetadata = try await account.request("documents/\(documentID)/georeference")
            let value: ModelMapSettingsReply = try await account.request("documents/\(documentID)/map-view")
            withAnimation { canAlign = meta.can_edit && value.map_view?.loaded_at == nil }
            canRotate = meta.can_edit && value.map_view != nil
        } catch { canAlign = false }
    }
}

/// Optional local preview; server-stored models are opened through IFCLibraryView.
struct IFCViewer: View {
    var smartHome = false
    @StateObject private var files = IFCTemporaryFiles()
    @State private var importing = false
    @State private var modelURL: URL?
    @State private var modelName = ""
    @State private var problem: String?
    @State private var reading = false
    var body: some View {
        VStack(spacing: 0) {
            if let modelURL {
                IFCWebView(modelURL: modelURL, smartHome: smartHome).id(modelURL)
                Text(modelName).font(.caption).lineLimit(1).padding(8)
            } else {
                ContentUnavailableView {
                    Label("Dein Gebäude in 3D", systemImage: "cube.transparent")
                } description: {
                    Text("Öffne ein IFC-Modell aus der Dateien-App, zum Beispiel einen Export aus Revit. Du kannst es drehen, zoomen und Bauteile antippen.")
                } actions: {
                    Button("IFC-Datei auswählen", systemImage: "folder") { importing = true }
                        .buttonStyle(.borderedProminent).disabled(reading)
                }
                Text("Erste Version · lokal auf diesem iPhone\nIFC2x3 / IFC4 · maximal 20 MB\nKein Upload auf den Projektserver.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding()
            }
            if reading { ProgressView("Datei wird geöffnet …").padding() }
        }
        .navigationTitle("IFC-Viewer").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Datei öffnen", systemImage: "folder.badge.plus") { importing = true }.disabled(reading)
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [UTType(filenameExtension: "ifc") ?? UTType(importedAs: "org.buildingsmart.ifc")]) { result in
            do {
                let source = try result.get()
                reading = true
                defer { reading = false }
                let access = source.startAccessingSecurityScopedResource()
                defer { if access { source.stopAccessingSecurityScopedResource() } }
                let values = try source.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                guard source.pathExtension.lowercased() == "ifc", values.isRegularFile == true else { throw IFCError.message("Bitte eine unkomprimierte .ifc-Datei auswählen.") }
                guard let size = values.fileSize, size > 0, size <= 20 * 1024 * 1024 else { throw IFCError.message("Die erste Version öffnet IFC-Dateien bis 20 MB. Bitte einen kleineren Ausschnitt aus Revit exportieren.") }
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("D21IFC-\(UUID().uuidString)", isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let target = directory.appendingPathComponent("model.ifc")
                do {
                    try FileManager.default.copyItem(at: source, to: target)
                    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: target.path)
                } catch { try? FileManager.default.removeItem(at: directory); throw error }
                // Keep the model while navigating tabs; remove temporary copies with the viewer state.
                files.directories.append(directory)
                modelURL = target; modelName = source.lastPathComponent
            } catch { problem = error.localizedDescription }
        }
        .alert("IFC-Datei", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) { problem = nil }
        } message: { Text(problem ?? "") }
    }
}
private final class IFCTemporaryFiles: ObservableObject {
    var directories: [URL] = []
    deinit { for directory in directories { try? FileManager.default.removeItem(at: directory) } }
}
private enum IFCError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case let .message(text): return text } }
}

struct IFCWebView: UIViewRepresentable {
    let modelURL: URL
    var heat: HeatPresentation? = nil
    var smartHome = false
    var account: AccountModel? = nil
    var buildingID: Int? = nil
    var documentID: Int? = nil
    /// Rooms mode: only reads IfcSpace footprints and hands them over as JSON (no rendering).
    var onRooms: ((Data) -> Void)? = nil
    func makeCoordinator() -> Coordinator { let c = Coordinator(modelURL: modelURL, account: account, buildingID: buildingID, documentID: documentID, heat:heat); c.onRooms = onRooms; return c }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        if onRooms != nil { configuration.userContentController.add(context.coordinator, name: "ifcRooms") }
        if heat != nil {configuration.userContentController.add(context.coordinator,name:"ifcHeatReady")}
        if heat == nil && account != nil && documentID != nil { configuration.userContentController.add(context.coordinator, name: "ifcSceneRequest") }
        if heat == nil && account != nil && buildingID != nil { configuration.userContentController.add(context.coordinator, name: "ifcCommandRequest") }
        configuration.setURLSchemeHandler(context.coordinator, forURLScheme: "d21ifc")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.scrollView.isScrollEnabled = false
        web.load(URLRequest(url: URL(string: "d21ifc://viewer/index.html" + (onRooms != nil ? "?rooms=true" : heat != nil ? "?heat=true" : smartHome ? "?mode=smart-home" : ""))!))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {context.coordinator.heat=heat;if context.coordinator.heatReady {context.coordinator.sendHeat(uiView)}}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName:"ifcHeatReady")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "ifcRooms")
        coordinator.sceneTask?.cancel(); uiView.configuration.userContentController.removeScriptMessageHandler(forName: "ifcSceneRequest")
        coordinator.activeTask?.cancel(); uiView.configuration.userContentController.removeScriptMessageHandler(forName: "ifcCommandRequest")
        uiView.stopLoading(); uiView.navigationDelegate = nil

    }
    final class Coordinator: NSObject, WKURLSchemeHandler, WKNavigationDelegate, WKScriptMessageHandler {
        let modelURL: URL
        weak var account: AccountModel?
        let buildingID: Int?
        let documentID: Int?
        var heat:HeatPresentation?
        var heatReady=false
        var onRooms: ((Data) -> Void)?
        var heatMap:SceneReply.MapView?
        var sceneTask: Task<Void, Never>?
        var activeTask: Task<Void, Never>?
        init(modelURL: URL, account: AccountModel?, buildingID: Int?, documentID: Int?, heat:HeatPresentation? = nil) { self.heat=heat;self.modelURL = modelURL; self.account = account; self.buildingID = buildingID; self.documentID = documentID }
        @MainActor func sendHeat(_ web:WKWebView) {
            guard let heat,heatReady else{return}
            do {var value=(try JSONSerialization.jsonObject(with:JSONEncoder().encode(heat))) as? [String:Any] ?? [:];if let heatMap {value["map_view"]=try JSONSerialization.jsonObject(with:JSONEncoder().encode(heatMap))};Task{_ = try? await web.callAsyncJavaScript("window.d21SetWeather?.(weather)",arguments:["weather":value],in:nil,contentWorld:.page)}}catch{}
        }
        struct CommandInfo: Decodable { let enabled: Bool; let context_hash: String }
        struct CommandProposal: Codable { let action: String; let target: String; let color: String?; let summary: String }
        struct CommandReply: Decodable { let command: CommandProposal }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name=="ifcHeatReady", message.frameInfo.isMainFrame, message.webView?.url?.scheme=="d21ifc",let web=message.webView,heat != nil {
                heatReady=true;sendHeat(web)
                if let account,let documentID {sceneTask=Task{@MainActor [weak self,weak web] in guard let self,let web else{return};do{let value:SceneReply=try await account.request("documents/\(documentID)/model-state");guard !Task.isCancelled else{return};self.heatMap=value.map_view;self.sendHeat(web)}catch{}}}
                return
            }
            if message.name == "ifcRooms", message.frameInfo.isMainFrame, message.webView?.url?.scheme == "d21ifc" {
                if let body = message.body as? [String: Any], let data = try? JSONSerialization.data(withJSONObject: body) { onRooms?(data) }
                return
            }
            if message.name == "ifcSceneRequest" { sceneRequest(message); return }
            guard message.name == "ifcCommandRequest", message.frameInfo.isMainFrame, let web = message.webView,
                  web.url?.scheme == "d21ifc", web.url?.host == "viewer", let body = message.body as? [String: String],
                  let id = body["id"], UUID(uuidString: id) != nil, let question = body["question"],
                  !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, question.utf16.count <= 500,
                  let account, let buildingID else { return }
            activeTask?.cancel()
            activeTask = Task { @MainActor [weak web] in
                guard let web else { return }
                do {
                    let info: CommandInfo = try await account.request("buildings/\(buildingID)/assistant?mode=ifc-command")
                    guard info.enabled else { throw APIError(status: 503, message: "Gemini ist gerade nicht verfügbar.") }
                    let result: CommandReply = try await account.request("buildings/\(buildingID)/assistant", method: "POST", body: ["question":question,"consent":"yes","mode":"ifc-command","context_hash":info.context_hash], headers: ["X-Request-ID":id], timeout: 45)
                    guard !Task.isCancelled else { return }
                    // JSON arguments are passed as data; no interpolated/evaluated model code.
                    var command = try JSONSerialization.jsonObject(with: JSONEncoder().encode(result.command)) as! [String: Any]
                    if command["color"] == nil { command["color"] = NSNull() }
                    _ = try? await web.callAsyncJavaScript("window.d21CommandReply(id, command, null)", arguments: ["id":id,"command":command], in: nil, contentWorld: .page)
                } catch {
                    guard !Task.isCancelled else { return }
                    _ = try? await web.callAsyncJavaScript("window.d21CommandReply(id, null, error)", arguments: ["id":id,"error":error.localizedDescription], in: nil, contentWorld: .page)
                }
            }
        }
        struct SceneReply: Codable {
            struct State: Codable { let hidden: [Int]; let colors: [String:String]; let lights: [Int] }
            struct DeviceLight: Codable { let space_id: Int; let on: Bool; let available: Bool; let rgb: [Int]; let brightness: Int }
            struct MapView: Codable {
                struct Feature: Codable { let kind: String; let geometry: [[Double]]; let width: Double?; let height: Double; let estimated_height: Bool }
                let latitude: Double; let longitude: Double; let heading: Double; let meters_per_unit: Double; let revision: Int; let features: [Feature]?
            }
            let revision: Int; let state: State; let device_lights: [DeviceLight]?; let map_view: MapView?
        }
        private var groundKey: String?
        /// Renders a north-up Apple Maps image around the model's anchor and hands it to the viewer as ground.
        @MainActor func sendGround(_ view: SceneReply.MapView, to web: WKWebView) async {
            let key = String(format: "%.6f,%.6f", view.latitude, view.longitude)
            guard groundKey != key else { return }
            groundKey = key
            let metres = 260.0
            let options = MKMapSnapshotter.Options()
            options.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: view.latitude, longitude: view.longitude),
                                                span: MKCoordinateSpan(latitudeDelta: metres / 111_320, longitudeDelta: metres / (111_320 * cos(view.latitude * .pi / 180))))
            options.size = CGSize(width: 1024, height: 1024); options.scale = 2
            options.pointOfInterestFilter = .excludingAll
            options.mapType = .mutedStandard
            options.traitCollection = UITraitCollection(userInterfaceStyle: .light)
            guard let snapshot = try? await MKMapSnapshotter(options: options).start(), let png = snapshot.image.jpegData(compressionQuality: 0.85) else { groundKey = nil; return }
            // Square image over a square region: the image covers `metres` on each side.
            let actual = metres
            _ = try? await web.callAsyncJavaScript("window.d21SetGround?.(url, metres)", arguments: ["url": "data:image/jpeg;base64," + png.base64EncodedString(), "metres": actual], in: nil, contentWorld: .page)
        }
        func sceneRequest(_ message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let web = message.webView, web.url?.scheme == "d21ifc", web.url?.host == "viewer",
                  let body = message.body as? [String:Any], let id = body["id"] as? String, id.count <= 100,
                  let account, let documentID else { return }
            sceneTask?.cancel()
            sceneTask = Task { @MainActor [weak web] in
                guard let web else { return }
                do {
                    let operation = body["operation"] as? [String:Any]
                    let result: SceneReply = try await account.request("documents/\(documentID)/model-state", method: operation == nil ? "GET" : "POST", body: operation.map { ["operation":$0,"revision":body["revision"] ?? -1] })
                    guard !Task.isCancelled else { return }
                    let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(result))
                    _ = try? await web.callAsyncJavaScript("window.d21SceneReply(id, result, null)", arguments:["id":id,"result":json], in:nil, contentWorld:.page)
                    if let view = result.map_view { await self.sendGround(view, to: web) }
                } catch {
                    guard !Task.isCancelled else { return }
                    _ = try? await web.callAsyncJavaScript("window.d21SceneReply(id, null, error)", arguments:["id":id,"error":error.localizedDescription], in:nil, contentWorld:.page)
                }
            }
        }
        func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
            do {
                guard let url = urlSchemeTask.request.url, url.host == "viewer" else { throw IFCError.message("Ungültige Viewer-Adresse.") }
                let resources = ["index.html": "text/html", "style.css": "text/css", "viewer.js": "text/javascript", "web-ifc.wasm": "application/wasm", "model.ifc": "application/octet-stream"]
                let name = String(url.path.dropFirst())
                guard let mime = resources[name] else { throw IFCError.message("Die Viewer-Datei wurde nicht gefunden.") }
                let file: URL
                if name == "model.ifc" { file = modelURL }
                else {
                    // Synchronized Xcode groups may flatten resources; support both layouts.
                    guard let asset = Bundle.main.url(forResource: name + (name == "viewer.js" || name == "web-ifc.wasm" ? ".lzfse" : ""), withExtension: nil, subdirectory: "IFCAssets") ?? Bundle.main.url(forResource: name + (name == "viewer.js" || name == "web-ifc.wasm" ? ".lzfse" : ""), withExtension: nil) else {
                        throw IFCError.message("IFC-Viewer fehlt im App-Build. Bitte die App neu bauen.")
                    }
                    file = asset
                }
                let stored = try Data(contentsOf: file)
                let data = try file.pathExtension == "lzfse" ? decodeIFCResource(stored) : stored
                let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Content-Length": String(data.count), "Cache-Control": "no-store"])!
                urlSchemeTask.didReceive(response); urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
            } catch { urlSchemeTask.didFailWithError(error) }
        }
        func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated, let url=navigationAction.request.url, url.absoluteString == "https://www.openstreetmap.org/copyright" { UIApplication.shared.open(url);decisionHandler(.cancel);return }
            decisionHandler(navigationAction.request.url?.scheme == "d21ifc" ? .allow : .cancel)
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            activeTask?.cancel(); sceneTask?.cancel()
            webView.loadHTMLString("<meta name='viewport' content='width=device-width'><p style='font:18px -apple-system;padding:24px'>Das Modell benötigt zu viel Speicher. Bitte über „Datei öffnen“ einen kleineren IFC-Ausschnitt auswählen.</p>", baseURL: nil)
        }
    }
}
