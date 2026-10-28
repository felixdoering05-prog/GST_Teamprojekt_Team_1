import SwiftUI
import Combine
import WebKit
import UniformTypeIdentifiers

/// Version 1: deliberate local-only preview; does not change the server's upload contract.
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
