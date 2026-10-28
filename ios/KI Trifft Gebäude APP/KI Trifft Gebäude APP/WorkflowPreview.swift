#if DEBUG
import Foundation
import UIKit

// Opt-in simulator fixture; never compiled into release builds and never sends network traffic.
enum WorkflowPreview {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-D21WorkflowPreview") }
    static let lock = NSLock()
    static var files: [[String: Any]] = []
    static var payloads: [Int: Data] = [:]
    static var buildings: [[String: Any]] = [["id":901,"name":"Gebäude D21","address":"Hochschule Darmstadt"]]
    static var keys: [String: Int] = [:]
    static let photo: Data = {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 320, height: 200))
        return renderer.jpegData(withCompressionQuality: 0.8) { ctx in
            UIColor.systemTeal.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 320, height: 200))
            "D21 · Testfoto".draw(at: CGPoint(x: 50, y: 85), withAttributes: [.font:UIFont.boldSystemFont(ofSize: 26), .foregroundColor:UIColor.white])
        }
    }()
    static let pdf: Data = {
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 320, height: 440))
        return renderer.pdfData { ctx in ctx.beginPage(); "D21 · Testplan".draw(at: CGPoint(x: 40, y: 40), withAttributes: [.font:UIFont.systemFont(ofSize: 24)]) }
    }()
}
final class WorkflowPreviewProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { WorkflowPreview.enabled }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        WorkflowPreview.lock.lock(); defer { WorkflowPreview.lock.unlock() }
        let path = request.url!.path, method = request.httpMethod ?? "GET"
        var body = request.httpBody
        if body == nil, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096), data = Data()
            while true { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count)) }
            body = data
        }
        let json = body.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String:String] ?? [:]
        var result: Any = [:], bytes: Data?, mime = "application/json", status = 200
        if path.hasSuffix("auth/me") { result = ["id":999999,"name":"Felix · Vorschau","email":"vorschau@example.invalid"] }
        else if path.hasSuffix("profile/avatar") { status = 404 }
        else if path == "/api/v1/buildings" {
            if method == "POST" {
                let key = request.value(forHTTPHeaderField: "X-Request-ID") ?? UUID().uuidString
                if let id = WorkflowPreview.keys[key] { result = WorkflowPreview.buildings.first { $0["id"] as? Int == id }! }
                else { let id = 902 + WorkflowPreview.buildings.count; let building: [String:Any] = ["id":id,"name":json["name"] ?? "D21 Neubau","address":json["address"] ?? ""]; WorkflowPreview.buildings.append(building); WorkflowPreview.keys[key] = id; result = building }
            } else { result = WorkflowPreview.buildings }
        } else if path.contains("/buildings/") && path.hasSuffix("/documents") {
            if method == "POST" {
                let key = request.value(forHTTPHeaderField: "X-Upload-ID") ?? UUID().uuidString
                if let id = WorkflowPreview.keys[key] { result = WorkflowPreview.files.first { $0["id"] as? Int == id }! }
                else {
                    let id = 1000 + WorkflowPreview.files.count
                    let name = request.value(forHTTPHeaderField: "X-File-Name")?.removingPercentEncoding ?? "Plan.pdf"
                    let data = name.hasSuffix(".jpg") ? WorkflowPreview.photo : WorkflowPreview.pdf
                    let file: [String:Any] = ["id":id,"name":name,"mime_type":name.hasSuffix(".jpg") ? "image/jpeg" : "application/pdf","size":data.count]
                    WorkflowPreview.files.append(file); WorkflowPreview.payloads[id] = data; WorkflowPreview.keys[key] = id; result = file
                }
            } else { result = WorkflowPreview.files }
        } else if path.contains("/documents/"), let id = Int(path.split(separator: "/").last ?? "") {
            if method == "DELETE" { WorkflowPreview.files.removeAll { $0["id"] as? Int == id }; WorkflowPreview.payloads[id] = nil; result = ["ok":true] }
            else if method == "PATCH", let index = WorkflowPreview.files.firstIndex(where: { $0["id"] as? Int == id }) { WorkflowPreview.files[index]["name"] = json["name"]; result = WorkflowPreview.files[index] }
            else { bytes = WorkflowPreview.payloads[id]; mime = WorkflowPreview.files.first { $0["id"] as? Int == id }?["mime_type"] as? String ?? "application/pdf" }
        } else { status = 404; result = ["error":"Nur lokale Vorschau"] }
        let data = bytes ?? (try! JSONSerialization.data(withJSONObject: result, options: [.fragmentsAllowed]))
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type":mime])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
