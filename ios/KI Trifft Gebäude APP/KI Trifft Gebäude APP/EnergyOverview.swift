import SwiftUI
import Charts

// Stromverbrauch aus Home Assistant: Tageswerte, aktuelle Leistung, Grundlast und Hinweise.
struct EnergyOverview: Decodable {
    struct Meter: Decodable, Identifiable { var id: String { entity_id }; let entity_id: String; let name: String; let room: String?; let today_kwh: Double?; let last7_kwh: Double? }
    struct Power: Decodable, Identifiable { var id: String { entity_id }; let entity_id: String; let name: String; let room: String?; let watts: Double?; let measured_at: String; let stale: Bool }
    struct Day: Decodable, Identifiable { var id: String { day }; let day: String; let kwh: Double? }
    struct Totals: Decodable { let today_kwh: Double?; let yesterday_kwh: Double?; let last7_kwh: Double?; let avg_day_kwh: Double? }
    let meters: [Meter]; let power: [Power]; let daily: [Day]; let totals: Totals; let base_load_w: Double?; let hints: [String]
}

struct HAEnergySection: View {
    @ObservedObject var account: AccountModel
    let building: Building
    @State private var data: EnergyOverview?
    @State private var problem: String?
    var body: some View {
        Group {
            if let data, !(data.meters.isEmpty && data.power.isEmpty) {
                Section {
                    HStack(spacing: 10) {
                        tile("Heute", data.totals.today_kwh, "kWh")
                        tile("Gestern", data.totals.yesterday_kwh, "kWh")
                        tile("Ø Tag", data.totals.avg_day_kwh, "kWh")
                    }.listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                    if data.daily.contains(where: { $0.kwh != nil }) {
                        Chart(data.daily.filter { $0.kwh != nil }) { day in
                            BarMark(x: .value("Tag", date(day.day) ?? .now, unit: .day), y: .value("kWh", day.kwh ?? 0))
                                .foregroundStyle(day.day == data.daily.last?.day ? Color.orange.gradient : Color.yellow.gradient).cornerRadius(3)
                            if let avg = data.totals.avg_day_kwh { RuleMark(y: .value("Durchschnitt", avg)).foregroundStyle(.secondary).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3])) }
                        }
                        .chartXAxis { AxisMarks(values: .stride(by: .day, count: 7)) { AxisGridLine(); AxisValueLabel(format: .dateTime.day().month(.abbreviated)) } }
                        .frame(height: 170).accessibilityLabel("Stromverbrauch der letzten 30 Tage")
                    }
                } header: { Label("Strom · Home Assistant", systemImage: "bolt.fill") }
                if !data.hints.isEmpty || data.base_load_w != nil {
                    Section("Nala meint") {
                        if let base = data.base_load_w { Label("Grundlast nachts: \(Int(base)) W", systemImage: "moon.zzz.fill").foregroundStyle(.indigo) }
                        ForEach(data.hints, id: \.self) { Label($0, systemImage: "lightbulb.max").font(.subheadline) }
                    }
                }
                if !data.power.isEmpty {
                    Section("Jetzt") {
                        ForEach(data.power) { p in
                            HStack { Text(p.name); if let room = p.room { Text(room).font(.caption).foregroundStyle(.secondary) }; Spacer()
                                Text(p.watts.map { "\(Int($0)) W" } ?? "–").font(.body.monospacedDigit().weight(.semibold)).foregroundStyle(p.stale ? .secondary : .primary) }
                        }
                    }
                }
                if data.meters.count > 1 {
                    Section("Zähler · letzte 7 Tage") {
                        ForEach(data.meters) { m in HStack { Text(m.name); Spacer(); Text((m.last7_kwh ?? 0).formatted(.number.precision(.fractionLength(1)).locale(Locale(identifier: "de_DE"))) + " kWh").monospacedDigit().foregroundStyle(.secondary) } }
                    }
                }
            } else if let problem { Section { Label(problem, systemImage: "exclamationmark.icloud").foregroundStyle(.orange) } }
            else if data == nil { Section { ProgressView("Stromdaten werden geladen …") } }
        }
        .task(id: building.id) { await load() }
    }
    private func tile(_ title: String, _ value: Double?, _ unit: String) -> some View {
        VStack(spacing: 2) {
            Text(value.map { $0.formatted(.number.precision(.fractionLength($0 < 10 ? 1 : 0)).locale(Locale(identifier: "de_DE"))) } ?? "–").font(.title3.bold().monospacedDigit())
            Text("\(title) · \(unit)").font(.caption2).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity).padding(.vertical, 10).background(Color.yellow.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    private func date(_ s: String) -> Date? { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.date(from: s) }
    private func load() async { do { data = try await account.request("buildings/\(building.id)/energy-overview"); problem = nil } catch { problem = error.localizedDescription } }
}
