import Foundation
import CryptoKit

struct Building: Identifiable, Codable, Equatable, Hashable {
    let id: Int
    let name: String
    let address: String
}
struct BuildingDocument: Identifiable, Codable {
    let id: Int
    let name: String
    let mime_type: String
    let size: Int
}

enum BuildingStep: Int, Codable, CaseIterable {
    case name = 1, address, photos, plans, overview
    var title: String {
        switch self {
        case .name: "Name"
        case .address: "Adresse"
        case .photos: "Fotos"
        case .plans: "Pläne"
        case .overview: "Übersicht"
        }
    }
}
enum UploadState: String, Codable { case queued, uploading, failed, saved }
struct DraftUpload: Identifiable, Codable {
    let id: UUID
    let name: String
    let isPhoto: Bool
    var state: UploadState = .queued
    var problem: String?
    var document: BuildingDocument?
    var payloadName: String { id.uuidString + ".data" }
}
struct BuildingDraft: Codable {
    let id: UUID
    var name = ""
    var address = ""
    var step: BuildingStep = .name
    var building: Building?
    var files: [DraftUpload] = []
    init(building: Building? = nil) {
        id = UUID(); self.building = building
        if let building { name = building.name; address = building.address; step = .overview }
    }
    var pendingCount: Int { files.filter { $0.state != .saved }.count }
    mutating func recoverInterruptedUploads() {
        for index in files.indices where files[index].state == .uploading {
            files[index].state = .queued
            files[index].problem = "Übertragung wurde unterbrochen. Du kannst sie erneut starten."
        }
    }
}
enum DraftStorageError: LocalizedError {
    case tooLarge, missingFile, localLimit
    var errorDescription: String? {
        switch self {
        case .tooLarge: "Bitte eine nicht leere Datei bis 25 MB auswählen."
        case .missingFile: "Die lokale Datei fehlt. Bitte diese Datei erneut auswählen."
        case .localLimit: "Für ausstehende Dateien sind lokal höchstens 250 MB vorgesehen. Bitte zuerst vorhandene Uploads abschließen."
        }
    }
}
// A separate protected directory per server, account and workflow. No passwords or tokens.
struct BuildingDraftStore {
    let directory: URL
    init(scope: String, root: URL? = nil) {
        let root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("D21Drafts")
        let key = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        directory = root.appendingPathComponent(key, isDirectory: true)
    }
    func load() throws -> BuildingDraft? {
        let url = directory.appendingPathComponent("draft.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        var draft = try JSONDecoder().decode(BuildingDraft.self, from: Data(contentsOf: url))
        draft.recoverInterruptedUploads()
        return draft
    }
    func save(_ draft: BuildingDraft) throws {
        try prepareDirectory()
        try protectedWrite(JSONEncoder().encode(draft), to: directory.appendingPathComponent("draft.json"))
    }
    func stage(data: Data, name: String, isPhoto: Bool) throws -> DraftUpload {
        guard !data.isEmpty, data.count <= 25 * 1024 * 1024 else { throw DraftStorageError.tooLarge }
        try prepareDirectory()
        let urls = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey])
        let bytes = try urls.filter { $0.pathExtension == "data" }.reduce(0) { try $0 + ($1.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) }
        guard bytes + data.count <= 250 * 1024 * 1024 else { throw DraftStorageError.localLimit }
        let item = DraftUpload(id: UUID(), name: name, isPhoto: isPhoto)
        try protectedWrite(data, to: payloadURL(item))
        return item
    }
    func payloadURL(_ item: DraftUpload) -> URL { directory.appendingPathComponent(item.payloadName) }
    func data(for item: DraftUpload) throws -> Data {
        guard FileManager.default.fileExists(atPath: payloadURL(item).path) else { throw DraftStorageError.missingFile }
        return try Data(contentsOf: payloadURL(item), options: .mappedIfSafe)
    }
    func removePayload(_ item: DraftUpload) throws {
        let url = payloadURL(item)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
    func clear() throws {
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }
    private func prepareDirectory() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var directory = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }
    private func protectedWrite(_ data: Data, to url: URL) throws {
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
}
