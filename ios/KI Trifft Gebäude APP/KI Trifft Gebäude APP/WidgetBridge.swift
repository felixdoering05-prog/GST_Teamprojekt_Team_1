import SwiftUI
import AppIntents
import WidgetKit
import Combine

// MARK: - Navigation requests from widgets, deep links and Siri

/// Holds one pending navigation request until the signed-in home screen can perform it.
@MainActor final class AppRouter: ObservableObject {
    static let shared = AppRouter()
    enum Route: Equatable {
        case building(Int?, area: String)
        case locate(Int?)
    }
    @Published var route: Route?
    private var question: (buildingID: Int?, text: String)?

    func open(_ url: URL) {
        guard url.scheme == AppLink.scheme else { return }
        switch url.host {
        case "building": route = .building(Int(url.lastPathComponent), area: "Dashboard")
        case "locate": route = .locate(nil)
        default: break
        }
    }
    /// Prefills the assistant only. Nothing is sent to the AI until the user taps send.
    func ask(_ text: String, buildingID: Int?) {
        question = (buildingID, text)
        route = .building(buildingID, area: "KI")
    }
    func takeQuestion(for buildingID: Int) -> String? {
        guard let question, question.buildingID == nil || question.buildingID == buildingID else { return nil }
        self.question = nil
        return question.text
    }
}

// MARK: - Snapshot for the home-screen widget

/// Writes the widget snapshot from data the app has already loaded. No token is shared with the widget.
@MainActor enum WidgetSnapshotWriter {
    private static var weatherFetched: [Int: Date] = [:]

    private static func update(_ change: (inout WidgetSnapshot) -> Void) {
        let before = WidgetSnapshot.load() ?? WidgetSnapshot()
        var snapshot = before
        change(&snapshot)
        guard snapshot != before else { return }
        snapshot.updatedAt = Date()
        snapshot.save()
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func buildings(_ list: [Building], accountID: Int?) {
        update { snapshot in
            if snapshot.accountID != accountID { snapshot = WidgetSnapshot(accountID: accountID) }
            snapshot.buildings = list.map { building in
                var entry = snapshot.buildings.first { $0.id == building.id } ?? .init(id: building.id, name: building.name)
                entry.name = building.name
                return entry
            }
            if let favorite = snapshot.favoriteID, !list.contains(where: { $0.id == favorite }) { snapshot.favoriteID = nil }
        }
        KTGShortcuts.updateAppShortcutParameters()
    }

    static func unread(_ count: Int) { update { $0.unread = count } }

    /// The building opened last becomes the widget's default building; its stored weather is read at most every 30 minutes.
    static func opened(_ building: Building, account: AccountModel) {
        update { $0.favoriteID = building.id }
        guard Date().timeIntervalSince(weatherFetched[building.id] ?? .distantPast) > 1800 else { return }
        weatherFetched[building.id] = Date()
        Task {
            guard let reply: BuildingWeatherReply = try? await account.request("buildings/\(building.id)/weather") else { return }
            weather(reply, buildingID: building.id)
        }
    }

    static func telemetry(_ data: TelemetrySnapshot, buildingID: Int) {
        var accepted = data.source == "real"
        #if DEBUG
        accepted = accepted || WorkflowPreview.enabled
        #endif
        guard accepted else { return }
        func latest(_ metric: TelemetryMetric) -> WidgetSnapshot.Reading? {
            data.sensors.filter { $0.metric == metric }.compactMap { data.latest($0) }.max { $0.date < $1.date }
                .map { WidgetSnapshot.Reading(value: $0.value, unit: $0.unit, measuredAt: $0.date) }
        }
        let temperature = latest(.temperature), co2 = latest(.co2)
        update { snapshot in
            guard let index = snapshot.buildings.firstIndex(where: { $0.id == buildingID }) else { return }
            snapshot.buildings[index].temperature = temperature
            snapshot.buildings[index].co2 = co2
        }
    }

    static func weather(_ reply: BuildingWeatherReply, buildingID: Int) {
        guard let current = reply.weather?.current else { return }
        let cloud = current.cloud_cover ?? 50
        let symbol = cloud < 25 ? "sun.max.fill" : cloud < 70 ? "cloud.sun.fill" : "cloud.fill"
        let value = WidgetSnapshot.Weather(temperature: current.temperature, symbol: symbol, observedAt: MeasurementTime.parse(current.time))
        update { snapshot in
            guard let index = snapshot.buildings.firstIndex(where: { $0.id == buildingID }) else { return }
            snapshot.buildings[index].weather = value
        }
    }

    /// Removes all widget data, for example on logout or account deletion.
    static func clear() {
        WidgetSnapshot.erase()
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// MARK: - App Intents (Siri and Shortcuts)

struct AskBuildingIntent: AppIntent {
    static let title: LocalizedStringResource = "Frag mein Gebäude"
    static let description = IntentDescription("Öffnet Nala, deine Gebäudeassistentin, mit deiner Frage. Gesendet wird erst, wenn du in der App auf Senden tippst.")
    static let openAppWhenRun = true
    @Parameter(title: "Frage", requestValueDialog: "Was möchtest du dein Gebäude fragen?") var question: String
    @Parameter(title: "Gebäude") var building: BuildingEntity?
    static var parameterSummary: some ParameterSummary { Summary("Frag \(\.$building): \(\.$question)") }
    @MainActor func perform() async throws -> some IntentResult {
        AppRouter.shared.ask(question, buildingID: building?.id)
        return .result()
    }
}

struct OpenBuildingIntent: AppIntent {
    static let title: LocalizedStringResource = "Gebäude öffnen"
    static let description = IntentDescription("Öffnet ein Gebäude in der App.")
    static let openAppWhenRun = true
    @Parameter(title: "Gebäude", requestValueDialog: "Welches Gebäude?") var building: BuildingEntity
    static var parameterSummary: some ParameterSummary { Summary("Öffne \(\.$building)") }
    @MainActor func perform() async throws -> some IntentResult {
        AppRouter.shared.route = .building(building.id, area: "Dashboard")
        return .result()
    }
}

struct WhereAmIIntent: AppIntent {
    static let title: LocalizedStringResource = "Wo bin ich?"
    static let description = IntentDescription("Öffnet die Raumortung im zuletzt geöffneten Gebäude.")
    static let openAppWhenRun = true
    @Parameter(title: "Gebäude") var building: BuildingEntity?
    @MainActor func perform() async throws -> some IntentResult {
        AppRouter.shared.route = .locate(building?.id)
        return .result()
    }
}

struct KTGShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AskBuildingIntent(), phrases: [
            "Frag mein Gebäude in \(.applicationName)",
            "Frag mein Gebäude mit \(.applicationName)",
            "\(.applicationName) fragen",
        ], shortTitle: "Frag mein Gebäude", systemImageName: "sparkles")
        AppShortcut(intent: OpenBuildingIntent(), phrases: [
            "Öffne \(\.$building) in \(.applicationName)",
            "Öffne Gebäude \(\.$building) in \(.applicationName)",
            "Öffne ein Gebäude in \(.applicationName)",
        ], shortTitle: "Gebäude öffnen", systemImageName: "building.2")
        AppShortcut(intent: WhereAmIIntent(), phrases: [
            "Wo bin ich in \(.applicationName)",
            "Wo bin ich im Gebäude mit \(.applicationName)",
        ], shortTitle: "Wo bin ich?", systemImageName: "location.viewfinder")
    }
}
