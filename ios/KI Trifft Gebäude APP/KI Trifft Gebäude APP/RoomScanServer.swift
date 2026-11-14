import Foundation
import simd

// Server-assisted room scan: the RoomPlan result is sent as JSON to the project server, which builds a
// clean IFC4 with ifcopenshell (rooms, walls with thickness, openings, furniture). The person checks the
// result and adds it to the building. When the server is not reachable, the on-device RoomScanIFC is used.

struct RoomScanJob: Decodable {
    struct Room: Decodable, Identifiable { let name: String; let type: String; let area_m2: Double; let objects: Int?; var id: String { name } }
    struct Counts: Decodable { let rooms: Int; let walls: Int; let shared_walls: Int?; let doors: Int; let windows: Int; let openings: Int?; let objects: Int }
    struct Summary: Decodable { let storey: String?; let rooms: [Room]; let counts: Counts?; let room_height_m: Double? }
    let id: String
    let status: String
    let summary: Summary?
    let warnings: [String]?
    let failure_code: String?
    let output_document_id: Int?
    var pending: Bool { status == "queued" || status == "running" }
}
struct RoomScanApproval: Decodable { let document_id: Int; let document: BuildingDocument? }

extension ScannedBuilding {
    /// RoomPlan object categories the server accepts; anything else is sent as "unknown".
    static let serverCategories: Set<String> = ["table", "chair", "sofa", "bed", "storage", "fireplace", "television", "refrigerator", "stove", "oven", "dishwasher", "washerDryer", "sink", "toilet", "bathtub", "stairs"]
    static let serverLabels: Set<String> = ["bathroom", "bedroom", "diningRoom", "kitchen", "livingRoom"]

    /// JSON contract of `POST buildings/:id/room-scans` (see dashboard/backend/src/room-scan.js).
    func serverPayload(buildingName: String, storey: String) throws -> Data {
        func round(_ v: Float) -> Double { (Double(v) * 10_000).rounded() / 10_000 }
        func box(_ b: Box) -> [String: Any] {
            let m = b.transform
            let columns = [m.columns.0, m.columns.1, m.columns.2, m.columns.3]
            return ["transform": columns.flatMap { [round($0.x), round($0.y), round($0.z), round($0.w)] }, "size": [round(b.width), round(b.height), round(b.depth)]]
        }
        let object: [String: Any] = [
            "version": 1,
            "building_name": String(buildingName.prefix(120)),
            "storey": String(storey.prefix(80)),
            "walls": walls.map(box), "doors": doors.map(box), "windows": windows.map(box), "openings": openings.map(box),
            "objects": objects.map { o -> [String: Any] in var v = box(o.box); v["category"] = Self.serverCategories.contains(o.category) ? o.category : "unknown"; return v },
            "floors": floors.map { f -> [String: Any] in
                ["corners": f.corners.map { [round($0.x), round($0.y), round($0.z)] },
                 "label": f.label.flatMap { Self.serverLabels.contains($0) ? $0 as Any : nil } ?? NSNull(),
                 "name": String(f.name.filter { !$0.isASCII || $0.asciiValue! >= 0x20 }.prefix(80))]
            },
        ]
        return try JSONSerialization.data(withJSONObject: object)
    }
}

extension AccountModel {
    private func roomScanPath(_ buildingID: Int, _ suffix: String = "") -> String { "buildings/\(buildingID)/room-scans" + suffix }
    func submitRoomScan(buildingID: Int, payload: Data, requestID: UUID) async throws -> RoomScanJob {
        guard payload.count <= 4 * 1024 * 1024 else { throw APIError(status: 413, message: "Der Scan ist zu groß für den Server. Bitte weniger Räume auf einmal scannen.") }
        let data = try await fileRequest(path: roomScanPath(buildingID), data: payload, requestID: requestID)
        return try JSONDecoder().decode(RoomScanJob.self, from: data)
    }
    func roomScan(buildingID: Int, id: String) async throws -> RoomScanJob { try await request(roomScanPath(buildingID, "/\(id)")) }
    func approveRoomScan(buildingID: Int, id: String) async throws -> RoomScanApproval { try await request(roomScanPath(buildingID, "/\(id)/approve"), method: "POST", body: [:], timeout: 60) }
    func rejectRoomScan(buildingID: Int, id: String) async throws { let _: LogoutResult = try await request(roomScanPath(buildingID, "/\(id)/reject"), method: "POST", body: [:]) }
}

enum RoomScanServerError {
    /// True when the server cannot help right now and the on-device IFC should be used instead.
    static func unreachable(_ error: Error) -> Bool {
        if error is URLError { return true }
        if let api = error as? APIError { return api.status == 0 || api.status == 404 || api.status >= 500 }
        return false
    }
}
