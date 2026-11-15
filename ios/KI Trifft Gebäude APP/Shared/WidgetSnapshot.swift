import Foundation
import AppIntents

// Shared by the app and the widget extension.
// The widget never receives a session token and never talks to the server: the app writes this small
// snapshot into the shared App Group container after it has loaded data anyway, and the widget only reads it.

nonisolated enum SharedContainer {
    /// Base bundle identifier of the app, also for the widget extension (`<base>.widgets`).
    static var baseBundleID: String {
        let id = Bundle.main.bundleIdentifier ?? "de.kitrifftgebaeude.d21team1"
        return id.hasSuffix(".widgets") ? String(id.dropLast(".widgets".count)) : id
    }
    static var appGroupID: String { "group." + baseBundleID }
    static var isExtension: Bool { Bundle.main.bundleURL.pathExtension == "appex" }
    /// Shared App Group folder. `nil` when the signing team provides no App Group.
    static var groupURL: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) }
    /// Where the snapshot is stored. Without App Group the app still keeps a private copy for Siri, the widget then shows no data.
    static var snapshotURL: URL? {
        if let groupURL { return groupURL.appendingPathComponent("widget-snapshot.json") }
        if isExtension { return nil }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("widget-snapshot.json")
    }
}

nonisolated struct WidgetSnapshot: Codable, Sendable, Equatable {
    nonisolated struct Reading: Codable, Sendable, Equatable { var value: Double; var unit: String; var measuredAt: Date }
    nonisolated struct Weather: Codable, Sendable, Equatable { var temperature: Double?; var symbol: String; var observedAt: Date? }
    nonisolated struct Entry: Codable, Sendable, Equatable, Identifiable {
        var id: Int
        var name: String
        var temperature: Reading?
        var co2: Reading?
        var weather: Weather?
    }
    var version = 1
    var accountID: Int?
    var updatedAt = Date()
    var unread: Int?
    var favoriteID: Int?
    var buildings: [Entry] = []

    var favorite: Entry? { buildings.first { $0.id == favoriteID } ?? buildings.first }
    func entry(_ id: Int?) -> Entry? { id.flatMap { id in buildings.first { $0.id == id } } ?? favorite }

    static func load() -> WidgetSnapshot? {
        guard let url = SharedContainer.snapshotURL, let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }
    func save() {
        guard let url = SharedContainer.snapshotURL else { return }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(self) else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        // Readable by the widget after the first unlock, encrypted while the device was never unlocked since boot.
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func erase() {
        guard let url = SharedContainer.snapshotURL else { return }
        try? FileManager.default.removeItem(at: url)
    }
}

/// Deep links shared by widget, App Intents and the app.
nonisolated enum AppLink {
    static let scheme = "kitrifftgebaeude"
    static func building(_ id: Int) -> URL { URL(string: "\(scheme)://building/\(id)")! }
    static let locate = URL(string: "\(scheme)://locate")!
    static let home = URL(string: "\(scheme)://home")!
}

/// Buildings known from the last snapshot. Siri and the widget configuration use names and IDs only.
nonisolated struct BuildingEntity: AppEntity, Identifiable, Sendable {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Gebäude")
    static let defaultQuery = BuildingEntityQuery()
    let id: Int
    let name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

nonisolated struct BuildingEntityQuery: EntityStringQuery {
    private var all: [BuildingEntity] { (WidgetSnapshot.load()?.buildings ?? []).map { BuildingEntity(id: $0.id, name: $0.name) } }
    func entities(for identifiers: [Int]) async throws -> [BuildingEntity] { all.filter { identifiers.contains($0.id) } }
    func entities(matching string: String) async throws -> [BuildingEntity] { all.filter { $0.name.localizedCaseInsensitiveContains(string) } }
    func suggestedEntities() async throws -> [BuildingEntity] { all }
    func defaultResult() async -> BuildingEntity? { WidgetSnapshot.load()?.favorite.map { BuildingEntity(id: $0.id, name: $0.name) } }
}
