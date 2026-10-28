#if DEBUG
import Foundation
import UIKit

// Opt-in simulator fixture; never compiled into release builds and never sends network traffic.
enum WorkflowPreview {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-D21WorkflowPreview") }
    static let lock = NSLock()
    static var fixturesLoaded = false
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
    static let ifcWall: Data = {
        let text = """
        ISO-10303-21;
        HEADER;
        FILE_DESCRIPTION(('D21 self-authored smoke-test wall'),'2;1');
        FILE_NAME('wall.ifc','2026-10-28T12:00:00',('D21'),('D21'),'D21','D21','');
        FILE_SCHEMA(('IFC4'));
        ENDSEC;
        DATA;
        #1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'D21 Test',$,$,$,$,(#7),#8);
        #2=IFCCARTESIANPOINT((0.,0.,0.));
        #3=IFCDIRECTION((0.,0.,1.));
        #4=IFCDIRECTION((1.,0.,0.));
        #5=IFCAXIS2PLACEMENT3D(#2,#3,#4);
        #6=IFCLOCALPLACEMENT($,#5);
        #7=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#5,$);
        #8=IFCUNITASSIGNMENT((#9));
        #9=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
        #10=IFCCARTESIANPOINT((0.,0.));
        #11=IFCAXIS2PLACEMENT2D(#10,$);
        #12=IFCRECTANGLEPROFILEDEF(.AREA.,'Wall',#11,5.,0.3);
        #13=IFCEXTRUDEDAREASOLID(#12,#5,#3,3.);
        #14=IFCSHAPEREPRESENTATION(#7,'Body','SweptSolid',(#13));
        #15=IFCPRODUCTDEFINITIONSHAPE($,$,(#14));
        #16=IFCWALL('1YvctVUKr0kugbFTf53O9L',$,'D21 Testwand',$,$,#6,#15,$,.STANDARD.);
        #17=IFCRELAGGREGATES('2YvctVUKr0kugbFTf53O9L',$,$,$,#1,(#18));
        #18=IFCSITE('3YvctVUKr0kugbFTf53O9L',$,'Testgelände',$,$,#6,$,$,.ELEMENT.,$,$,$,$,$);
        #19=IFCRELCONTAINEDINSPATIALSTRUCTURE('0YvctVUKr0kugbFTf53O9M',$,$,$,(#16),#18);
        ENDSEC;
        END-ISO-10303-21;
        """
        return Data(text.utf8)
    }()
    static func setupFixturesIfNeeded() {
        guard enabled else { return }
        guard !fixturesLoaded else { return }
        fixturesLoaded = true
        if ProcessInfo.processInfo.arguments.contains("-D21IFCPreview") {
            buildings = [
                ["id":901,"name":"Gebäude D21 (Hauptcampus)","address":"Hochschule Darmstadt"],
                ["id":902,"name":"Technikum D12 (Automatisierung)","address":"Schöfferstraße 3"]
            ]
            if ProcessInfo.processInfo.arguments.contains("-D21IFCNoBuildings") { buildings = []; return }
            if ProcessInfo.processInfo.arguments.contains("-D21IFCEmpty") { return }
            let m1: [String: Any] = ["id":2001,"name":"D21_Architektur_Rohbau.ifc","mime_type":"application/x-step","size":1245184,"building_id":901]
            let m2: [String: Any] = ["id":2002,"name":"D21_Lueftungszentrale_und_Gebaeudetechnik_Nordtrakt_Entwurf_2026.ifc","mime_type":"application/x-step","size":5482910,"building_id":901]
            let m3: [String: Any] = ["id":2003,"name":"Technikum_Tragwerk_Halle.ifc","mime_type":"application/x-step","size":3145728,"building_id":902]
            files = [m1, m2, m3]
            payloads[2001] = ifcWall
            payloads[2002] = ifcWall
            payloads[2003] = ifcWall
        }
    }
}
final class WorkflowPreviewProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { WorkflowPreview.enabled }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        WorkflowPreview.lock.lock(); defer { WorkflowPreview.lock.unlock() }
        WorkflowPreview.setupFixturesIfNeeded()
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
            } else if ProcessInfo.processInfo.arguments.contains("-D21IFCListFail") {
                status = 500; result = ["error":"Projektserver vorübergehend nicht erreichbar"]
            } else { result = WorkflowPreview.buildings }
        } else if path.contains("/buildings/") && path.hasSuffix("/documents") {
            let buildingID = path.split(separator: "/").dropLast().last.flatMap { Int($0) }
            if ProcessInfo.processInfo.arguments.contains("-D21IFCBuildingFail") && buildingID == 902 {
                status = 500; result = ["error":"Gebäude 902 vorübergehend nicht erreichbar"]
            } else if method == "POST" {
                let key = request.value(forHTTPHeaderField: "X-Upload-ID") ?? UUID().uuidString
                if let id = WorkflowPreview.keys[key] { result = WorkflowPreview.files.first { $0["id"] as? Int == id }! }
                else {
                    let id = 1000 + WorkflowPreview.files.count
                    let name = request.value(forHTTPHeaderField: "X-File-Name")?.removingPercentEncoding ?? "Plan.pdf"
                    let data = name.hasSuffix(".jpg") ? WorkflowPreview.photo : name.hasSuffix(".ifc") ? WorkflowPreview.ifcWall : WorkflowPreview.pdf
                    let mime = name.hasSuffix(".jpg") ? "image/jpeg" : name.hasSuffix(".ifc") ? "application/x-step" : "application/pdf"
                    let file: [String:Any] = ["id":id,"name":name,"mime_type":mime,"size":data.count,"building_id":buildingID ?? 901]
                    WorkflowPreview.files.append(file); WorkflowPreview.payloads[id] = data; WorkflowPreview.keys[key] = id; result = file
                }
            } else {
                if let buildingID {
                    result = WorkflowPreview.files.filter { ($0["building_id"] as? Int) == nil || ($0["building_id"] as? Int) == buildingID }
                } else {
                    result = WorkflowPreview.files
                }
            }
        } else if path.contains("/documents/"), let id = Int(path.split(separator: "/").last ?? "") {
            if ProcessInfo.processInfo.arguments.contains("-D21IFCFailPreview") && id == 2002 {
                status = 500; result = ["error":"Verbindung zum Modellserver unterbrochen"]
            } else if method == "DELETE" { WorkflowPreview.files.removeAll { $0["id"] as? Int == id }; WorkflowPreview.payloads[id] = nil; result = ["ok":true] }
            else if method == "PATCH", let index = WorkflowPreview.files.firstIndex(where: { $0["id"] as? Int == id }) { WorkflowPreview.files[index]["name"] = json["name"]; result = WorkflowPreview.files[index] }
            else {
                guard let payload = WorkflowPreview.payloads[id] else {
                    status = 404; result = ["error":"Datei nicht gefunden"]
                    let data = try! JSONSerialization.data(withJSONObject: result, options: [.fragmentsAllowed])
                    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
                    client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
                    return
                }
                bytes = payload
                mime = WorkflowPreview.files.first { $0["id"] as? Int == id }?["mime_type"] as? String ?? "application/pdf"
            }
        } else { status = 404; result = ["error":"Nur lokale Vorschau"] }
        let data = bytes ?? (try! JSONSerialization.data(withJSONObject: result, options: [.fragmentsAllowed]))
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type":mime])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
