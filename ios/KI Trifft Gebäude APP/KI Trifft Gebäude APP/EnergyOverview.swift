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

private struct PassportEnergySnapshot: Decodable {
    struct Range: Decodable {
        let from: String
        let to: String
        var label: String { "\(passportDate(from)) – \(passportDate(to))" }
    }

    struct Ranges: Decodable {
        let current: Range?
        let previous: Range?
    }

    struct UsageUnit: Decodable, Identifiable {
        let id: String
        let name: String
    }

    struct Reading: Decodable, Identifiable {
        let id: String
        let medium: String
        let value: Double?
        let unit: String
        let unit_id: String?
        let unit_name: String?
        let meter_code: String?
        let meter_name: String?
        let meter_reading: Double?
        let reading_date: String?
        let period_start: String?
        let period_end: String?
        let cost_eur: Double?
        let capture_method: String?
        let source: String
        let note: String?

        var sourceLabel: String {
            let labels = ["manual": "Manuell", "csv": "CSV-Import", "building_pass": "Gebäudepass in ChatGPT Sites"]
            let label = labels[capture_method ?? ""] ?? (note == "Importierter Ablesewert" ? "CSV-Import" : "Nala-Bestand")
            return source == "demo" ? "\(label) · Demo" : label
        }
    }

    struct Series: Decodable, Identifiable {
        struct Point: Decodable, Identifiable {
            let month: String
            let value: Double?
            var id: String { month }
        }
        var id: String { unit }
        let unit: String
        let current: Double?
        let previous: Double?
        let points: [Point]
    }

    struct Summary: Decodable, Identifiable {
        var id: String { medium }
        let medium: String
        let label: String
        let series: [Series]
        let cost_eur: Double?
        let meter_count: Int
        let meters: [Reading]?
    }

    struct Reference: Decodable {
        struct Metric: Decodable, Identifiable {
            var id: String { label }
            let label: String
            let value: Double
            let unit: String
            let note: String
        }
        let month: String
        let metrics: [Metric]
        let hints: [String]
    }

    let units: [UsageUnit]
    let summaries: [Summary]
    let ranges: Ranges
    let source: String
    let readings: [Reading]
    let reading_count: Int
    let reference: Reference?
}

private func passportDate(_ value: String?, format: String = "dd.MM.yyyy") -> String {
    guard let value else { return "–" }
    let input = DateFormatter()
    input.locale = Locale(identifier: "en_US_POSIX")
    input.timeZone = TimeZone(identifier: "Europe/Berlin")
    input.dateFormat = "yyyy-MM-dd"
    let date = value.count == 10 ? input.date(from: value) : MeasurementTime.parse(value)
    guard let date else { return "–" }
    input.locale = Locale(identifier: "de_DE")
    input.dateFormat = format
    return input.string(from: date)
}

private func passportQuantity(_ value: Double?, _ unit: String) -> String {
    value.map { $0.formatted(.number.precision(.fractionLength(0...3))) + (unit.isEmpty ? "" : " " + unit) } ?? "Keine Daten"
}

private func passportCost(_ value: Double?) -> String {
    value.map { $0.formatted(.currency(code: "EUR")) } ?? "Keine Daten"
}

struct PassportEnergyView: View {
    @ObservedObject var account: AccountModel
    let building: Building
    @State private var selectedBuilding: Building?

    var body: some View {
        let current = selectedBuilding ?? building
        List {
            if account.buildings.count > 1 {
                Section {
                    Picker("Gebäude", selection: Binding(
                        get: { current.id },
                        set: { id in selectedBuilding = account.buildings.first { $0.id == id } }
                    )) {
                        ForEach(account.buildings) { Text($0.name).tag($0.id) }
                    }
                }
            }
            EnergyLiveSection(account: account, building: current).id("live-\(current.id)")
            PassportEnergySections(account: account, building: current).id(current.id)
        }
        .navigationTitle("Energie")
    }
}

struct PassportEnergySections: View {
    @ObservedObject var account: AccountModel
    let building: Building
    var medium: String? = nil
    @State private var snapshot: PassportEnergySnapshot?
    @State private var unit = ""
    @State private var months = "12"
    @State private var source = ""
    @State private var offset = 0
    @State private var error: String?
    @State private var reload = 0

    init(account: AccountModel, building: Building, medium: String? = nil, unit: String = "", months: String = "12", source: String = "") {
        self.account = account
        self.building = building
        self.medium = medium
        _unit = State(initialValue: unit)
        _months = State(initialValue: months)
        _source = State(initialValue: source)
    }

    private var path: String {
        var components = URLComponents()
        components.path = "energy-consumption"
        components.queryItems = [
            URLQueryItem(name: "building", value: String(building.id)),
            URLQueryItem(name: "months", value: months),
            URLQueryItem(name: "unit", value: unit),
            URLQueryItem(name: "source", value: source),
            URLQueryItem(name: "medium", value: medium ?? ""),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        return components.string ?? "energy-consumption"
    }

    var body: some View {
        Group {
            Section("Verbrauchsfilter") {
                LabeledContent("Gebäude", value: building.name)
                Picker("Zeitraum", selection: $months) {
                    Text("1 Kalendermonat").tag("1")
                    Text("3 Kalendermonate").tag("3")
                    Text("12 Kalendermonate").tag("12")
                    Text("Gesamte Historie").tag("all")
                }.onChange(of: months) { offset = 0 }
                Picker("Nutzungseinheit", selection: $unit) {
                    Text("Alle Nutzungseinheiten").tag("")
                    ForEach(snapshot?.units ?? []) { Text($0.name).tag($0.id) }
                }.onChange(of: unit) { offset = 0 }
                Picker("Datenbestand", selection: $source) {
                    Text("Automatisch").tag("")
                    Text("Echte Daten").tag("real")
                    Text("Demo-Daten").tag("demo")
                }.onChange(of: source) { unit = ""; offset = 0 }
            }
            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.icloud").foregroundStyle(.orange)
                    Button("Erneut laden") { reload += 1 }
                }
            } else if let snapshot {
                Section {
                    if let range = snapshot.ranges.current { LabeledContent("Zeitraum", value: range.label) }
                    if let previous = snapshot.ranges.previous { LabeledContent("Vorzeitraum", value: previous.label) }
                    if snapshot.source == "demo" { Label("Demo-Daten", systemImage: "testtube.2").foregroundStyle(.orange) }
                }
                if medium == nil { overview(snapshot) }
                else if let summary = snapshot.summaries.first { details(summary, snapshot: snapshot) }
            } else {
                Section { ProgressView("Verbrauchsdaten werden geladen …") }
            }
        }
        .task(id: "\(path)#\(reload)") {
            error = nil
            do {
                let result: PassportEnergySnapshot = try await account.request(path)
                guard !Task.isCancelled else { return }
                snapshot = result
            } catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
        }
    }

    @ViewBuilder private func overview(_ data: PassportEnergySnapshot) -> some View {
        Section("Verbrauchsarten") {
            ForEach(data.summaries) { summary in
                NavigationLink {
                    List {
                        PassportEnergySections(account: account, building: building, medium: summary.medium, unit: unit, months: months, source: source)
                        if summary.medium == "strom" { HAEnergySection(account: account, building: building) }
                    }.navigationTitle(summary.label).navigationBarTitleDisplayMode(.inline)
                } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(summary.label).font(.headline)
                        ForEach(summary.series) { series in
                            Text(passportQuantity(series.current, series.unit)).font(.title3.monospacedDigit())
                        }
                        Text("Kosten \(passportCost(summary.cost_eur)) · \(summary.meter_count) Zähler")
                            .font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                }
            }
        }
        if let reference = data.reference {
            Section("Kennzahlen aus dem Gebäudepass") {
                Text("ChatGPT Sites · Demo · \(passportDate(reference.month + "-01", format: "MMMM yyyy"))").font(.caption).foregroundStyle(.secondary)
                ForEach(reference.metrics) { metric in
                    VStack(alignment: .leading, spacing: 3) {
                        LabeledContent(metric.label, value: passportQuantity(metric.value, metric.unit))
                        Text(metric.note).font(.caption).foregroundStyle(.secondary)
                    }
                }
                DisclosureGroup("Betriebliche Hinweise") {
                    ForEach(reference.hints, id: \.self) { Text($0).font(.caption) }
                }
            }
        }
    }

    @ViewBuilder private func details(_ summary: PassportEnergySnapshot.Summary, snapshot: PassportEnergySnapshot) -> some View {
        ForEach(summary.series) { series in
            Section(summary.medium == "warmwasser" && series.unit == "kWh" ? "Energie zur Warmwasserbereitung" : "Verbrauchsentwicklung · \(series.unit)") {
                LabeledContent("Verbrauch", value: passportQuantity(series.current, series.unit))
                LabeledContent("Vorzeitraum", value: passportQuantity(series.previous, series.unit))
                if let current = series.current, let previous = series.previous {
                    let difference = current - previous
                    let percentage = previous == 0 ? "" : " (\((difference / previous).formatted(.percent.precision(.fractionLength(1)))))"
                    LabeledContent("Änderung", value: passportQuantity(difference, series.unit) + percentage)
                }
                if series.points.contains(where: { $0.value != nil }) {
                    Chart(series.points) { point in
                        if let value = point.value {
                            BarMark(x: .value("Monat", point.month), y: .value(series.unit, value)).foregroundStyle(d21Accent)
                        }
                    }.chartXScale(domain: series.points.map(\.month))
                        .frame(height: 160).accessibilityLabel("Monatlicher Verbrauch in \(series.unit)")
                }
            }
        }
        Section("Kosten") {
            LabeledContent("Im Zeitraum", value: passportCost(summary.cost_eur))
        }
        Section("Zähler") {
            LabeledContent("Zähler im Zeitraum", value: String(summary.meter_count))
            ForEach(summary.meters ?? []) { row in
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.meter_name ?? row.meter_code ?? "–").font(.headline)
                    Text("Zählerstand \(passportQuantity(row.meter_reading, row.unit)) · \(passportDate(row.reading_date))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        Section("Verbrauchshistorie") {
            if snapshot.readings.isEmpty { Text("Für diese Filter liegen keine Verbrauchswerte vor.").foregroundStyle(.secondary) }
            ForEach(snapshot.readings) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(passportQuantity(row.value, row.unit)).font(.headline)
                    Text([building.name, row.unit_name ?? row.unit_id, row.meter_name ?? row.meter_code].compactMap { $0 }.joined(separator: " · "))
                    Text("Zählerstand \(passportQuantity(row.meter_reading, row.unit))")
                    Text("Ablesedatum \(passportDate(row.reading_date))")
                    Text("Verbrauchszeitraum \(passportDate(row.period_start)) – \(passportDate(row.period_end))")
                    Text("Kosten \(passportCost(row.cost_eur)) · \(row.sourceLabel)")
                }.font(.caption)
            }
            if snapshot.reading_count > 50 {
                HStack {
                    Button("Zurück") { offset = max(0, offset - 50) }.disabled(offset == 0)
                    Spacer()
                    Button("Weiter") { offset += 50 }.disabled(offset + 50 >= snapshot.reading_count)
                }.buttonStyle(.borderless)
            }
        }
    }
}
