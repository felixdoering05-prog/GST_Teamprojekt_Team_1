import Foundation

enum TelemetryMetric: String, Codable, CaseIterable {
    case temperature, co2, humidity
    var title: String { switch self { case .temperature: "Temperatur"; case .co2: "CO₂"; case .humidity: "Luftfeuchte" } }
    var unit: String { switch self { case .temperature: "°C"; case .co2: "ppm"; case .humidity: "%" } }
    var symbol: String { switch self { case .temperature: "thermometer.medium"; case .co2: "cloud"; case .humidity: "humidity" } }
}
struct TelemetrySensor: Codable, Identifiable {
    let id: String; let sensor_code: String; let name: String; let metric: TelemetryMetric; let unit: String
    let source: String
}
enum MeasurementTime {
    static func parse(_ text: String) -> Date? {
        let numbers = text.prefix(19).split(whereSeparator: { "-T:".contains($0) }).compactMap { Int($0) }
        guard numbers.count == 6 else { return nil }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = DateComponents(year: numbers[0], month: numbers[1], day: numbers[2], hour: numbers[3], minute: numbers[4], second: numbers[5])
        guard parts.isValidDate(in: calendar), numbers[3] < 24, numbers[4] < 60, numbers[5] < 60 else { return nil }
        let fraction = ISO8601DateFormatter(); fraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fraction.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    static func string(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
}
struct TelemetryPoint: Codable, Identifiable {
    let id: String; let sensor_id: String; let sensor_code: String; let metric: TelemetryMetric
    let value: Double; let unit: String; let measured_at: String; let source: String; let quality: String
    var date: Date { MeasurementTime.parse(measured_at) ?? .distantPast }
}
struct TelemetryEnergy: Codable, Identifiable {
    let id: String; let medium: String; let value: Double; let unit: String; let period_start: String; let period_end: String; let source: String
    var title: String { switch medium { case "strom": "Strom"; case "waerme": "Wärme"; case "kaltwasser": "Kaltwasser"; case "warmwasser": "Warmwasser"; default: medium } }
}
struct MetricThreshold: Codable {
    let warning_min: Double?; let warning_max: Double?; let critical_min: Double?; let critical_max: Double?
    func level(_ value: Double) -> String {
        if let max = critical_max, value > max { return "Kritisch" }
        if let min = critical_min, value < min { return "Kritisch" }
        if let max = warning_max, value > max { return "Warnung" }
        if let min = warning_min, value < min { return "Warnung" }
        return "Im Bereich"
    }
}
struct TelemetrySnapshot: Codable {
    let source: String; let generated_at: String; let truncated: Bool; let scope: String
    let sensors: [TelemetrySensor]; let measurements: [TelemetryPoint]; let energy: [TelemetryEnergy]
    let thresholds: [String:MetricThreshold]
    func series(_ sensor: TelemetrySensor) -> [TelemetryPoint] { measurements.filter { $0.sensor_id == sensor.id && $0.quality == "ok" }.sorted { $0.date < $1.date } }
    func latest(_ sensor: TelemetrySensor) -> TelemetryPoint? { series(sensor).last }
    func level(_ sensor: TelemetrySensor) -> String { guard let last = latest(sensor) else { return "Keine auswertbaren Werte" }; return thresholds[sensor.metric.rawValue]?.level(last.value) ?? "Keine Grenzwerte" }
    static func demo(now: Date = Date()) -> Self {
        let sensors = TelemetryMetric.allCases.enumerated().map { index, metric in TelemetrySensor(id: "demo-\(index)", sensor_code: "DEMO-\(index)", name: "Besprechung · \(metric.title)", metric: metric, unit: metric.unit, source: "demo") }
        let points = sensors.enumerated().flatMap { index, sensor in
            (0..<24).map { hour in
                let wave = sin(Double(hour) * 0.4)
                let value = index == 0 ? 22 + wave * 2 : index == 1 ? 650 + Double(hour) * 23 : 44 + wave * 8
                return TelemetryPoint(id: "\(sensor.id)-\(hour)", sensor_id: sensor.id, sensor_code: sensor.sensor_code, metric: sensor.metric, value: value, unit: sensor.unit, measured_at: MeasurementTime.string(now.addingTimeInterval(Double(hour - 23) * 3600)), source: "demo", quality: "ok")
            }
        }
        return Self(source: "demo", generated_at: MeasurementTime.string(now), truncated: false, scope: "Lokale, fiktive Beispieldaten. Keine Verbindung zum Projektserver oder zu Gemini.", sensors: sensors, measurements: points, energy: [TelemetryEnergy(id: "demo-energy", medium: "strom", value: 48.5, unit: "kWh", period_start: MeasurementTime.string(now.addingTimeInterval(-86400)), period_end: MeasurementTime.string(now), source: "demo")], thresholds: [
            "temperature": MetricThreshold(warning_min: 19, warning_max: 26, critical_min: 16, critical_max: 28),
            "co2": MetricThreshold(warning_min: nil, warning_max: 1000, critical_min: nil, critical_max: 1500),
            "humidity": MetricThreshold(warning_min: 30, warning_max: 60, critical_min: 25, critical_max: 70)
        ])
    }
}
struct MeasurementCSVRow: Codable, Identifiable {
    let sensor_code: String; let value: Double; let measured_at: String
    var id: String { sensor_code + measured_at + String(value) }
    var json: [String:Any] { ["sensor_code":sensor_code,"value":value,"measured_at":measured_at] }
}
enum MeasurementCSVError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { switch self { case .invalid(let message): message } }
}
enum MeasurementCSV {
    static let example = "sensor_code;measured_at;value\nTEMP-01;2026-11-03T12:00:00Z;22,4\nTEMP-01;2026-11-03T13:00:00Z;22,8\n"
    static func parse(_ text: String) throws -> [MeasurementCSVRow] {
        guard text.utf8.count <= 1_048_576 else { throw MeasurementCSVError.invalid("CSV maximal 1 MB.") }
        let cleaned = text.replacingOccurrences(of: "\u{FEFF}", with: "").replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        let lines = cleaned.split(separator: "\n", omittingEmptySubsequences: false)
        guard let first = lines.first else { throw MeasurementCSVError.invalid("Die Datei ist leer.") }
        let separator: Character = first.contains(";") ? ";" : ","
        let header = try cells(String(first), separator: separator).map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
        guard Set(header) == Set(["sensor_code", "measured_at", "value"]), header.count == 3 else { throw MeasurementCSVError.invalid("Benötigte Spalten: sensor_code, measured_at, value. Trennung mit Komma oder Semikolon.") }
        let code = header.firstIndex(of: "sensor_code")!, time = header.firstIndex(of: "measured_at")!, value = header.firstIndex(of: "value")!
        var rows: [MeasurementCSVRow] = []
        for (index, line) in lines.dropFirst().enumerated() where !line.trimmingCharacters(in: .whitespaces).isEmpty {
            let fields = try cells(String(line), separator: separator)
            guard fields.count == 3 else { throw MeasurementCSVError.invalid("Zeile \(index + 2): Erwartet werden drei Spalten.") }
            let values = fields.map { $0.trimmingCharacters(in: .whitespaces) }
            let stamp = values[time]
            let pattern = #"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$"#
            guard !values[code].isEmpty, values[code].count <= 100, let number = Double(values[value].replacingOccurrences(of: ",", with: ".")), number.isFinite, stamp.range(of: pattern, options: .regularExpression) != nil, let date = MeasurementTime.parse(stamp) else { throw MeasurementCSVError.invalid("Zeile \(index + 2): Kennung, Zahl oder ISO-Zeitpunkt mit Zeitzone fehlt bzw. ist ungültig.") }
            rows.append(MeasurementCSVRow(sensor_code: values[code], value: number, measured_at: MeasurementTime.string(date)))
            if rows.count > 200 { throw MeasurementCSVError.invalid("Höchstens 200 Messwerte pro Datei.") }
        }
        guard !rows.isEmpty else { throw MeasurementCSVError.invalid("Die Datei enthält keine Messwerte.") }
        return rows
    }
    private static func cells(_ line: String, separator: Character) throws -> [String] {
        var cells: [String] = [], field = "", quoted = false, closed = false
        let characters = Array(line); var index = 0
        while index < characters.count {
            let c = characters[index]
            if quoted {
                if c == "\"" { if index + 1 < characters.count && characters[index + 1] == "\"" { field.append("\""); index += 1 } else { quoted = false; closed = true } }
                else { field.append(c) }
            } else if c == separator { cells.append(field); field = ""; closed = false }
            else if c == "\"" && field.isEmpty && !closed { quoted = true }
            else if c == "\"" || closed && !c.isWhitespace { throw MeasurementCSVError.invalid("Ungültige CSV-Anführungszeichen. Keine mehrzeiligen Zellen verwenden.") }
            else { field.append(c) }
            index += 1
        }
        guard !quoted else { throw MeasurementCSVError.invalid("Nicht geschlossene CSV-Anführungszeichen.") }
        cells.append(field); return cells
    }
}
