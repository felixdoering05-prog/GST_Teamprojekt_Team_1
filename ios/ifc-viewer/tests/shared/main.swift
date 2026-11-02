// macOS WKWebView integration test, using the same local URL scheme as iOS.
import AppKit
import WebKit
let assetRoot = URL(fileURLWithPath: CommandLine.arguments[1])
let model = URL(fileURLWithPath: CommandLine.arguments[2])
let expectError = CommandLine.arguments.contains("--expect-error")
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
final class Bridge: NSObject, WKURLSchemeHandler, WKScriptMessageHandler, WKNavigationDelegate {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        do {
            let url = task.request.url!
            let name = url.lastPathComponent
            let file = name == "model.ifc" ? model : assetRoot.appendingPathComponent(name + (name == "viewer.js" || name == "web-ifc.wasm" ? ".lzfse" : ""))
            let stored = try Data(contentsOf: file)
            let data = try file.pathExtension == "lzfse" ? decodeIFCResource(stored) : stored
            let types = ["html":"text/html", "js":"text/javascript", "css":"text/css", "wasm":"application/wasm"]
            task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":types[(name as NSString).pathExtension] ?? "application/octet-stream"])!)
            task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
    var revision = 0
    var reads = 0
    var saves = 0
    var ready = false
    var current: [String:Any] = ["hidden":[],"colors":[:],"lights":[]]
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "ifcState" { ready = String(describing:message.body).hasPrefix("ready:"); return }
        guard let body = message.body as? [String:Any], let id = body["id"] as? String else { exit(1) }
        if let operation = body["operation"] as? [String:Any] {
            guard body["revision"] as? Int == revision, operation["action"] as? String == "hide", let ids = operation["ids"] as? [Int], ids.count == 1 else { print("BAD_OPERATION",body); exit(1) }
            current["hidden"] = ids; revision += 1; saves += 1
        } else { reads += 1 }
        let result: [String:Any] = ["revision":revision,"state":current]
        Task { @MainActor in
            do {
                _ = try await web.callAsyncJavaScript("window.d21SceneReply(id, result, null)", arguments:["id":id,"result":result], in:nil, contentWorld:.page)
                if saves == 1 {
                    let value = try await web.evaluateJavaScript("document.querySelector('#show-all').textContent.includes('(1)') && document.querySelector('#sync-status').textContent.includes('gespeichert')")
                    guard value as? Bool == true else { print("SHARED_STATE_NOT_VISIBLE",value as Any); exit(1) }
                    // A later server-side reset must arrive via the polling bridge.
                    current = ["hidden":[],"colors":[:],"lights":[]]; revision += 1; saves += 1
                } else if saves == 2 && reads > 1 {
                    let value = try await web.evaluateJavaScript("!document.querySelector('#show-all').textContent.includes('(1)')")
                    guard value as? Bool == true else { print("POLL_FAILED"); exit(1) }
                    print("WK_SHARED_MODEL_PASS"); exit(0)
                } else if saves == 0 {
                    _ = try await web.evaluateJavaScript("document.querySelector('#command-open').click();document.querySelector('#command-input').value='Blende alle Wände aus';document.querySelector('#command-preview').click();document.querySelector('#command-execute').click();true")
                }
            } catch { print(error); exit(1) }
        }
    }

}
let bridge = Bridge()
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
// Keep the background test webview logically visible so its foreground-only polling runs.
config.userContentController.addUserScript(WKUserScript(source:"Object.defineProperty(document, 'hidden', {get:()=>false});", injectionTime:.atDocumentStart, forMainFrameOnly:true))
config.setURLSchemeHandler(bridge, forURLScheme: "d21ifc")
config.userContentController.add(bridge, name: "ifcState")
config.userContentController.add(bridge, name: "ifcSceneRequest")
let web = WKWebView(frame: NSRect(x:0,y:0,width:430,height:760), configuration: config)
let window = NSWindow(contentRect:web.frame, styleMask:[.titled], backing:.buffered, defer:false)
window.contentView = web; window.orderFront(nil)
web.load(URLRequest(url: URL(string:"d21ifc://viewer/index.html")!))
DispatchQueue.main.asyncAfter(deadline:.now()+40) {
    web.evaluateJavaScript("document.body.innerText") { result, _ in print("TIMEOUT",result as Any); exit(2) }
}
app.run()
