import SwiftUI

// „Meldungen“ wie im Web (#273): Mängel und Sensorwarnungen in einem Bereich.
// Sensorwarnungen entstehen nur aus dem regelbasierten Grenzwert-Prüflauf.

struct SensorAlert: Decodable, Identifiable, Equatable {
    let id: String
    let title: String?
    let message: String?
    let severity: String?
    let metric: String?
    let value: Double?
    let threshold: Double?
    let room_id: String?
    let room_label: String?
    let sensor_code: String?
    let building_id: String?
    let triggered_at: String?
    let status: String?
    let source: String?
    let acknowledged_at: String?
}
private struct AlertPage: Decodable { let items: [SensorAlert] }

/// Umschalter zwischen Mängeln und Sensorwarnungen.
struct BuildingReportsView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    var open: (String) -> Void = { _ in }
    @State private var kind = "Mängel"
    var body: some View {
        VStack(spacing: 0) {
            Picker("Meldungen", selection: $kind) {
                Text("Mängel").tag("Mängel")
                Text("Sensorwarnungen").tag("Sensorwarnungen")
            }.pickerStyle(.segmented).padding(.horizontal, 20).padding(.top, 8)
            if kind == "Mängel" { BuildingIssuesView(building: building, account: account, open: open) }
            else { SensorAlertsView(building: building, account: account, open: open) }
        }.background(Color(uiColor: .systemGroupedBackground))
    }
}

struct SensorAlertsView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    var open: (String) -> Void = { _ in }
    @State private var alerts: [SensorAlert] = []
    @State private var loaded = false
    @State private var problem: String?
    @State private var filter = "offen"
    @State private var busy: String?
    @State private var room: String?

    private var shown: [SensorAlert] { filter == "alle" ? alerts : alerts.filter { ($0.status ?? "offen") == filter } }
    var body: some View {
        List {
            Section {
                Picker("Status", selection: $filter) {
                    Text("Offen").tag("offen"); Text("Quittiert").tag("quittiert"); Text("Erledigt").tag("erledigt"); Text("Alle").tag("alle")
                }.pickerStyle(.segmented).listRowBackground(Color.clear).listRowInsets(EdgeInsets())
            }
            if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            if !loaded {
                Section { ProgressView("Sensorwarnungen werden geladen …") }
            } else if shown.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Label(filter == "offen" ? "Keine offenen Sensorwarnungen" : "Keine Sensorwarnungen in dieser Ansicht", systemImage: "checkmark.seal").font(.headline)
                        Text("Warnungen entstehen nur aus dem regelbasierten Prüflauf gegen die hinterlegten Grenzwerte.").font(.footnote).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                }
            }
            ForEach(shown) { alert in
                Section { row(alert) }
            }
        }
        .refreshable { await load() }
        .task(id: building.id) { await load() }
        .navigationDestination(item: $room) { id in RoomCardView(building: building, roomID: id, account: account, open: open) }
    }

    private func row(_ alert: SensorAlert) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Image(systemName: icon(alert.severity)).foregroundStyle(color(alert.severity))
                Text(alert.title ?? alert.room_label ?? tr("Sensorwarnung")).font(.headline)
                Spacer()
                Text(statusLabel(alert.status)).font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 3)
                    .background(color(alert.severity).opacity(0.12), in: Capsule())
            }
            if let message = alert.message, !message.isEmpty { Text(message).font(.subheadline) }
            HStack(spacing: 6) {
                if let label = alert.room_label { Label(label, systemImage: "door.left.hand.open") }
                if let date = alert.triggered_at.flatMap({ ISO8601DateFormatter.withFractions.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) }) {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                }
                if alert.source == "demo" { Text("Demo").foregroundStyle(.orange) }
            }.font(.caption).foregroundStyle(.secondary)
            HStack {
                if alert.status == nil || alert.status == "offen" {
                    Button("Quittieren") { Task { await update(alert, status: "quittiert") } }.buttonStyle(.bordered)
                }
                if alert.status != "erledigt" {
                    Button("Erledigt") { Task { await update(alert, status: "erledigt") } }.buttonStyle(.bordered).tint(.green)
                }
                Spacer()
                if let roomID = alert.room_id { Button("Raum öffnen") { room = roomID }.buttonStyle(.borderless) }
            }.controlSize(.small).disabled(busy != nil)
        }.padding(.vertical, 4)
    }
    private func icon(_ severity: String?) -> String { severity == "critical" ? "exclamationmark.octagon.fill" : severity == "info" ? "info.circle.fill" : "exclamationmark.triangle.fill" }
    private func color(_ severity: String?) -> Color { severity == "critical" ? .red : severity == "info" ? .blue : .orange }
    private func statusLabel(_ status: String?) -> String {
        switch status { case "quittiert": tr("Quittiert"); case "erledigt": tr("Erledigt"); default: tr("Offen") }
    }
    private func load() async {
        do {
            let page: AlertPage = try await account.request("twin/Alert/filter", method: "POST",
                body: ["filter": ["building_id": String(building.id)], "options": ["sort": "-triggered_at", "limit": 200]])
            alerts = page.items; problem = nil
        } catch { problem = error.localizedDescription }
        loaded = true
    }
    private func update(_ alert: SensorAlert, status: String) async {
        busy = alert.id; defer { busy = nil }
        var data: [String: Any] = ["status": status]
        if status == "quittiert" {
            data["acknowledged_by"] = account.user?.email ?? ""
            data["acknowledged_at"] = ISO8601DateFormatter().string(from: Date())
        }
        if status == "erledigt" { data["resolution_note"] = "Manuell als erledigt markiert." }
        do {
            struct Saved: Decodable { let id: String }
            let _: Saved = try await account.request("twin/Alert/update", method: "POST", body: ["id": alert.id, "data": data])
            await load()
        } catch { problem = error.localizedDescription }
    }
}
