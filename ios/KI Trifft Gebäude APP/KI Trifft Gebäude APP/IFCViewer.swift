import SwiftUI
import Combine
import WebKit
import UniformTypeIdentifiers

struct IFCLibraryView: View {
    @ObservedObject var model: AccountModel
    @StateObject private var library: IFCLibraryState
    @State private var search = ""
    @State private var openingID: Int?
    @State private var downloadTask: Task<Void, Never>?
    @State private var downloadOperation = UUID()
    @State private var downloadFailure: BuildingDocument?
    @State private var downloadMessage = ""
    @State private var preview: DocumentPreview?
    private var scope: String { model.serverURL + "#" + String(model.user?.id ?? -1) }
    init(model: AccountModel) {
        self.model = model
        _library = StateObject(wrappedValue: IFCLibraryState(source: IFCLibrarySource(
            scope: { model.user.map { model.serverURL + "#" + String($0.id) } },
            buildings: { try await model.fetchBuildings() },
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
                    Label("Deine Gebäude in 3D", systemImage: "cube.transparent").font(.title2.bold())
                    Text("Gespeichert auf dem Projektserver. Öffne dein Modell und entdecke die Bauteile.").foregroundStyle(.secondary)
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
                NavigationLink { IFCViewer() } label: { Label("Lokale IFC-Datei ohne Upload öffnen", systemImage: "folder").padding(.vertical, 8) }
                Text("IFC2x3 / IFC4 · bis 20 MB pro Modell · 250 MB pro Konto. Zum Öffnen gespeicherter Modelle brauchst du eine Internetverbindung.")
                    .font(.footnote).foregroundStyle(.secondary)
            }.padding(20).frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("IFC-Modelle").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Modell oder Gebäude suchen")
        .task(id: scope) { await library.refresh() }
        .refreshable { await library.refresh() }
        .onChange(of: scope) { _, _ in cancelDownload(); preview = nil; search = "" }
        .onDisappear { cancelDownload() }
        .sheet(item: $preview) { DocumentPreviewView(item: $0) }
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
                    Text(openingID == entry.id ? "Modell wird geladen …" : "In 3D öffnen").fixedSize(horizontal: false, vertical: true)
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
    var body: some View { IFCWebView(modelURL: url) }
}

/// Optional local preview; server-stored models are opened through IFCLibraryView.
struct IFCViewer: View {
    @StateObject private var files = IFCTemporaryFiles()
    @State private var importing = false
    @State private var modelURL: URL?
    @State private var modelName = ""
    @State private var problem: String?
    @State private var reading = false
    var body: some View {
        VStack(spacing: 0) {
            if let modelURL {
                IFCWebView(modelURL: modelURL).id(modelURL)
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

private struct IFCWebView: UIViewRepresentable {
    let modelURL: URL
    func makeCoordinator() -> Coordinator { Coordinator(modelURL: modelURL) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(context.coordinator, forURLScheme: "d21ifc")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.scrollView.isScrollEnabled = false
        web.load(URLRequest(url: URL(string: "d21ifc://viewer/index.html")!))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.stopLoading(); uiView.navigationDelegate = nil

    }
    final class Coordinator: NSObject, WKURLSchemeHandler, WKNavigationDelegate {
        let modelURL: URL
        init(modelURL: URL) { self.modelURL = modelURL }
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
            decisionHandler(navigationAction.request.url?.scheme == "d21ifc" ? .allow : .cancel)
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.loadHTMLString("<meta name='viewport' content='width=device-width'><p style='font:18px -apple-system;padding:24px'>Das Modell benötigt zu viel Speicher. Bitte über „Datei öffnen“ einen kleineren IFC-Ausschnitt auswählen.</p>", baseURL: nil)
        }
    }
}
