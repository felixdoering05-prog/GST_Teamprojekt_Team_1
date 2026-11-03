import Foundation

@main struct TelemetryChecks {
    static func main() throws {
        func rejected(_ text: String) { do { _ = try MeasurementCSV.parse(text); preconditionFailure("Invalid CSV accepted") } catch {} }
        let semicolon = try MeasurementCSV.parse("\u{FEFF}sensor_code;measured_at;value\r\nTEMP-01;2026-11-03T12:00:00Z;22,4\r\n")
        precondition(semicolon.count == 1 && semicolon[0].value == 22.4)
        let comma = try MeasurementCSV.parse("value,sensor_code,measured_at\n23.2,\"TEMP-01\",2026-11-03T13:00:00+01:00")
        precondition(comma.count == 1 && comma[0].measured_at == "2026-11-03T12:00:00Z")
        rejected("sensor_code,value,measured_at\nTEMP,NaN,2026-11-03T12:00:00Z")
        rejected("sensor_code,value,measured_at\nTEMP,inf,2026-11-03T12:00:00Z")
        rejected("sensor_code,value,measured_at\nTEMP,23,2026-11-03T12:00:00")
        rejected("sensor_code,value,measured_at\n\"TEMP,23,2026-11-03T12:00:00Z")
        rejected("sensor_code,value,measured_at\n\"TEMP\"evil,23,2026-11-03T12:00:00Z")
        rejected("sensor_code,value,value\nTEMP,23,23")
        rejected("sensor_code,value,measured_at\n")
        let row = "TEMP,23,2026-11-03T12:00:00Z\n"
        let maximum = try MeasurementCSV.parse("sensor_code,value,measured_at\n" + String(repeating: row, count: 200))
        precondition(maximum.count == 200)
        rejected("sensor_code,value,measured_at\n" + String(repeating: row, count: 201))
        rejected(String(repeating: "x", count: 1_048_577))
        rejected("sensor_code,value,measured_at\nTEMP,23,2026-02-30T12:00:00Z")
        let data = TelemetrySnapshot.demo(now: Date(timeIntervalSince1970: 1_794_000_000))
        precondition(data.source == "demo" && data.sensors.count == 3 && data.measurements.count == 72)
        precondition(data.measurements.allSatisfy { $0.source == "demo" && $0.quality == "ok" })
        for sensor in data.sensors { precondition(data.series(sensor).count == 24 && data.latest(sensor) != nil) }
        precondition(data.thresholds["co2"]?.level(1000) == "Im Bereich")
        precondition(data.thresholds["co2"]?.level(1001) == "Warnung")
        precondition(data.thresholds["co2"]?.level(1501) == "Kritisch")
        let restored = try JSONDecoder().decode(TelemetrySnapshot.self, from: JSONEncoder().encode(data))
        precondition(restored.measurements.count == 72)
        print("CSV boundaries, quoting, timestamps, demo isolation, thresholds and snapshot roundtrip passed")
    }
}
