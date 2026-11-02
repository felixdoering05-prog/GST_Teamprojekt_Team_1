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
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let state = String(describing: message.body)
        print("VIEWER_STATE \(state)")
        if expectError { exit(state.hasPrefix("error:") ? 0 : 1) }
        guard state.hasPrefix("ready:") else {
            web.evaluateJavaScript("document.querySelector('#status').textContent") { result, _ in print(result ?? "unknown"); exit(1) }; return
        }
        let checks = """
        document.querySelector('#command-open').click();
        const input = document.querySelector('#command-input');
        const preview = document.querySelector('#command-preview');
        const execute = document.querySelector('#command-execute');
        const result = document.querySelector('#command-result');
        for (const phrase of ['Färbe alle Wände blau', 'Blende alle Wände aus', 'Alles zurücksetzen']) {
          input.value = phrase; input.dispatchEvent(new Event('input')); preview.click();
          if (execute.disabled || !result.textContent.includes('Betroffen: 1')) throw new Error('Preview failed: '+result.textContent);
          execute.click();
          if (!execute.disabled || !result.textContent.includes('1 Bauteil(e) in dieser Ansicht geändert')) throw new Error('Execution failed');
        }
        input.value = 'Lösche das Modell'; input.dispatchEvent(new Event('input')); preview.click();
        if (!execute.disabled) throw new Error('Unsafe command enabled');
        true;
        """
        web.evaluateJavaScript(checks) { result, error in
            guard error == nil, result as? Bool == true else { print(error as Any); exit(1) }
            print("WK_IFC_COMMANDS_PASS"); exit(0)
        }
    }
}
let bridge = Bridge()
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
config.setURLSchemeHandler(bridge, forURLScheme: "d21ifc")
config.userContentController.add(bridge, name: "ifcState")
let web = WKWebView(frame: NSRect(x:0,y:0,width:430,height:760), configuration: config)
let window = NSWindow(contentRect:web.frame, styleMask:[.titled], backing:.buffered, defer:false)
window.contentView = web; window.orderFront(nil)
web.load(URLRequest(url: URL(string:"d21ifc://viewer/index.html")!))
DispatchQueue.main.asyncAfter(deadline:.now()+40) {
    web.evaluateJavaScript("document.body.innerText") { result, _ in print("TIMEOUT",result as Any); exit(2) }
}
app.run()
