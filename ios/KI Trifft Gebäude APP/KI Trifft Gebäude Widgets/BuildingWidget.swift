import WidgetKit
import SwiftUI
import AppIntents

// Home-screen widget. Reads only the snapshot the app wrote into the App Group; no token, no network.

private let accent = Color(red: 0.07, green: 0.49, blue: 0.51)

struct SelectBuildingIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Gebäude wählen"
    static let description = IntentDescription("Ohne Auswahl zeigt das Widget das zuletzt in der App geöffnete Gebäude.")
    @Parameter(title: "Gebäude") var building: BuildingEntity?
}

struct BuildingWidgetEntry: TimelineEntry {
    let date: Date
    let building: WidgetSnapshot.Entry?
    let unread: Int?
    /// false when no App Group is available (data-less widget, deep link only).
    let sharedDataAvailable: Bool
}

struct BuildingWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> BuildingWidgetEntry {
        BuildingWidgetEntry(date: .now, building: .init(id: 0, name: "Mein Gebäude",
            temperature: .init(value: 21.5, unit: "°C", measuredAt: .now), co2: .init(value: 640, unit: "ppm", measuredAt: .now),
            weather: .init(temperature: 12, symbol: "cloud.sun.fill", observedAt: .now)), unread: 2, sharedDataAvailable: true)
    }
    func snapshot(for configuration: SelectBuildingIntent, in context: Context) async -> BuildingWidgetEntry {
        context.isPreview && WidgetSnapshot.load() == nil ? placeholder(in: context) : entry(configuration)
    }
    func timeline(for configuration: SelectBuildingIntent, in context: Context) async -> Timeline<BuildingWidgetEntry> {
        // The app reloads timelines whenever it writes new data; this is only a fallback re-read.
        Timeline(entries: [entry(configuration)], policy: .after(.now.addingTimeInterval(1800)))
    }
    private func entry(_ configuration: SelectBuildingIntent) -> BuildingWidgetEntry {
        let snapshot = WidgetSnapshot.load()
        return BuildingWidgetEntry(date: .now, building: snapshot?.entry(configuration.building?.id), unread: snapshot?.unread,
                                   sharedDataAvailable: SharedContainer.groupURL != nil)
    }
}

struct BuildingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BuildingWidgetEntry

    var body: some View {
        Group {
            if let building = entry.building {
                if family == .systemMedium { medium(building) } else { small(building) }
            } else {
                empty
            }
        }
        .widgetURL(entry.building.map { AppLink.building($0.id) } ?? AppLink.home)
        .containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
    }

    private func header(_ building: WidgetSnapshot.Entry) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "building.2.fill").foregroundStyle(accent)
            Text(building.name).font(family == .systemSmall ? .subheadline.bold() : .headline)
                .lineLimit(1).minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            if let unread = entry.unread, unread > 0 {
                Text("\(unread)").font(.caption2.bold()).foregroundStyle(.white)
                    .padding(.horizontal, 6).padding(.vertical, 2).background(.red, in: Capsule())
                    .accessibilityLabel("\(unread) ungelesene Mitteilungen")
            }
        }
    }

    private func value(_ reading: WidgetSnapshot.Reading?, digits: Int) -> String {
        guard let reading else { return "–" }
        return reading.value.formatted(.number.precision(.fractionLength(digits))) + " " + reading.unit
    }

    private func small(_ building: WidgetSnapshot.Entry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            header(building)
            Spacer(minLength: 0)
            Text(value(building.temperature, digits: 1)).font(.system(.title, design: .rounded, weight: .bold))
                .minimumScaleFactor(0.6).lineLimit(1)
            Label(value(building.co2, digits: 0), systemImage: "aqi.medium").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 4) {
                if let weather = building.weather {
                    Image(systemName: weather.symbol).symbolRenderingMode(.multicolor)
                    Text(weather.temperature.map { $0.formatted(.number.precision(.fractionLength(0))) + "°" } ?? "")
                }
                Spacer(minLength: 0)
                if let date = building.temperature?.measuredAt ?? building.co2?.measuredAt { Text(date, style: .time) }
            }.font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func medium(_ building: WidgetSnapshot.Entry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            header(building)
            HStack(alignment: .top, spacing: 12) {
                tile("Innen", value(building.temperature, digits: 1), "thermometer.medium", .orange)
                tile("CO₂", value(building.co2, digits: 0), "aqi.medium", accent)
                tile("Außen", building.weather?.temperature.map { $0.formatted(.number.precision(.fractionLength(0))) + " °C" } ?? "–",
                     building.weather?.symbol ?? "cloud", .blue)
            }
            Spacer(minLength: 0)
            HStack {
                if let date = building.temperature?.measuredAt ?? building.co2?.measuredAt {
                    Text("Messwert \(date.formatted(.dateTime.locale(Locale(identifier: "de_DE")).hour().minute())) Uhr")
                } else {
                    Text("Noch kein Messwert – Gebäude in der App öffnen")
                }
                Spacer(minLength: 0)
                Text(entry.unread.map { $0 == 1 ? "1 Mitteilung" : "\($0) Mitteilungen" } ?? "")
            }.font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
    }

    private func tile(_ title: String, _ value: String, _ symbol: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: symbol).font(.caption2).foregroundStyle(color).symbolRenderingMode(.multicolor)
            Text(value).font(.system(.title3, design: .rounded, weight: .bold)).minimumScaleFactor(0.6).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "building.2.fill").font(.title2).foregroundStyle(accent)
            Text("Nala Solutions").font(.headline)
            Text(entry.sharedDataAvailable ? "Melde dich in der App an und öffne ein Gebäude." : "Tippen, um die App zu öffnen.")
                .font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct BuildingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "BuildingWidget", intent: SelectBuildingIntent.self, provider: BuildingWidgetProvider()) { entry in
            BuildingWidgetView(entry: entry)
        }
        .configurationDisplayName("Mein Gebäude")
        .description("Letzter Messwert, Wetter und ungelesene Mitteilungen deines Gebäudes.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main struct KTGWidgetBundle: WidgetBundle {
    var body: some Widget { BuildingWidget() }
}
