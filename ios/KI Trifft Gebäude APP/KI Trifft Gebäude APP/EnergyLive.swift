import Charts
import SwiftUI

// Live-Energie wie im Web (Energie → Live): aktuelle Werte der im Energiemonitor
// zugeordneten Home-Assistant-Sensoren (Strom oder Wasser) und der Tagesverlauf.

struct EnergyLiveChannel: Decodable {
    struct Latest: Decodable { let value: Double; let time: String; let stale: Bool }
    struct Point: Decodable, Identifiable { let time: String; let value: Double; var id: String { time } }
    let name: String?
    let label: String?
    let unit: String?
    let latest: Latest?
    let points: [Point]?
    let peak: Double?
}
struct EnergyLiveData: Decodable {
    let now: String
    let channels: [String: EnergyLiveChannel]
}

struct EnergyLiveSection: View {
    @ObservedObject var account: AccountModel
    let building: Building
    @State private var medium = "strom"
    @State private var data: EnergyLiveData?
    @State private var unavailable = false

    /// Reihenfolge wie im Web; nur zugeordnete Kanäle erscheinen.
    private let order = ["load", "solar", "grid", "battery_power", "battery", "ev", "load_total", "solar_total", "import_total", "export_total", "solar_forecast",
                         "battery_health", "battery_temperature", "outdoor_temperature", "irradiance", "water_flow", "water_total", "tank"]

    var body: some View {
        Group { if !unavailable { content } }
        .task(id: "\(building.id)-\(medium)") {
            data = nil; unavailable = false
            while !Task.isCancelled {
                // Ohne Energiemonitor oder ohne Recht bleibt der Bereich einfach ausgeblendet.
                do { data = try await account.request("buildings/\(building.id)/energy/live?medium=\(medium)") }
                catch { if data == nil { unavailable = true } }
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }
    private var content: some View {
        Section {
            Picker("Medium", selection: $medium) { Text("Strom").tag("strom"); Text("Wasser").tag("wasser") }.pickerStyle(.segmented)
            if let data {
                let keys = order.filter { data.channels[$0]?.latest != nil }
                if keys.isEmpty {
                    Text("Für dieses Medium sind im Energiemonitor noch keine Sensoren zugeordnet. Das geht im Web unter Energie → Einstellungen.").font(.footnote).foregroundStyle(.secondary)
                }
                if let load = data.channels[medium == "strom" ? "load" : "water_flow"], let points = load.points, points.count > 1 {
                    Chart(points) { point in
                        if let date = nativeTeamDate(point.time) {
                            AreaMark(x: .value("Zeit", date), y: .value("Wert", point.value)).foregroundStyle(d21Accent.opacity(0.18))
                            LineMark(x: .value("Zeit", date), y: .value("Wert", point.value)).foregroundStyle(d21Accent)
                        }
                    }
                    .frame(height: 140)
                    .accessibilityLabel(tr("Tagesverlauf \(load.label ?? "")"))
                }
                ForEach(keys, id: \.self) { key in
                    if let channel = data.channels[key], let latest = channel.latest {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(channel.label ?? key)
                                if let name = channel.name { Text(name).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(latest.value.formatted(.number.precision(.fractionLength(0...1)))) \(channel.unit ?? "")").font(.headline).monospacedDigit()
                                if latest.stale { Text("veraltet").font(.caption).foregroundStyle(.orange) }
                            }
                        }
                    }
                }
            } else {
                ProgressView()
            }
        } header: { Text("Live · Home Assistant") } footer: {
            if data != nil { Text("Aktualisiert jede Minute, solange die Ansicht offen ist. Werte kommen aus Home Assistant und sind nicht unabhängig verifiziert.") }
        }
    }
}
