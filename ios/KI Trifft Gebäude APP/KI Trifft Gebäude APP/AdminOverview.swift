import SwiftUI

// Serverübersicht für die Projektadministration (#287), wie „Serververwaltung“ im Web:
// Serverkapazität, KI- und API-Nutzung, Speicher und Dienste. Nur Anzeige.

/// Zahl, die der Server als Zahl oder (bei PostgreSQL-COUNT/SUM) als Text liefert.
struct FlexNumber: Decodable {
    let value: Double?
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { value = nil }
        else if let number = try? container.decode(Double.self) { value = number }
        else if let text = try? container.decode(String.self) { value = Double(text) }
        else { value = nil }
    }
}
struct AdminOverview: Decodable {
    struct Counts: Decodable { let users: FlexNumber; let buildings: FlexNumber; let files: FlexNumber; let file_bytes: FlexNumber; let sessions: FlexNumber; let database_bytes: FlexNumber? }
    struct Limits: Decodable { let project_24h: Int }
    struct AI: Decodable { let requests: FlexNumber; let successful: FlexNumber; let failed: FlexNumber; let limited: FlexNumber; let provider: String; let model: String; let enabled: Bool; let key_configured: Bool; let limits: Limits }
    struct HTTP: Decodable { let requests: FlexNumber; let errors: FlexNumber; let average_ms: FlexNumber }
    struct Usage: Decodable { let used: FlexNumber?; let total: FlexNumber? }
    struct Container: Decodable, Identifiable { let name: String; let state: String?; var id: String { name } }
    struct Host: Decodable {
        let collected_at: String?
        let cpu_percent: FlexNumber?
        let cpu_cores: FlexNumber?
        let memory: Usage?
        let disk: Usage?
        let uptime_seconds: FlexNumber?
        let containers: [Container]?
    }
    let generated_at: String
    let counts: Counts
    let ai: AI
    let http: HTTP
    let host: Host?
    let host_error: String?
    let host_stale: Bool?
}

struct AdminOverviewView: View {
    @ObservedObject var account: AccountModel
    @State private var data: AdminOverview?
    @State private var problem: String?

    var body: some View {
        List {
            if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            if let data {
                Section {
                    if let error = data.host_error { Label(error, systemImage: "clock.badge.exclamationmark").foregroundStyle(.orange) }
                    else if data.host_stale == true { Label("Die Host-Messung ist älter als zwei Minuten.", systemImage: "clock.badge.exclamationmark").foregroundStyle(.orange) }
                    capacity("CPU", used: data.host?.cpu_percent?.value, total: 100, unit: .percent)
                    capacity("Arbeitsspeicher", used: data.host?.memory?.used?.value, total: data.host?.memory?.total?.value, unit: .bytes)
                    capacity("Server-Festplatte", used: data.host?.disk?.used?.value, total: data.host?.disk?.total?.value, unit: .bytes)
                    if let uptime = data.host?.uptime_seconds?.value { LabeledContent("Laufzeit", value: tr("\(Int(uptime / 86400)) Tage")) }
                } header: { Text("Serverkapazität") }
                Section("KI und API-Nutzung") {
                    LabeledContent("KI-Anfragen · 24 h", value: "\(count(data.ai.requests)) / \(data.ai.limits.project_24h)")
                    LabeledContent("Erfolgreich / fehlgeschlagen", value: "\(count(data.ai.successful)) / \(count(data.ai.failed))")
                    LabeledContent("Durch Limit abgelehnt", value: count(data.ai.limited))
                    LabeledContent("Anbieter", value: "\(data.ai.provider) · \(data.ai.model)")
                    LabeledContent("KI eingeschaltet", value: data.ai.enabled && data.ai.key_configured ? tr("Ja") : tr("Nein"))
                    LabeledContent("API-Anfragen · 24 h", value: count(data.http.requests))
                    LabeledContent("Fehlerantworten · 24 h", value: count(data.http.errors))
                    LabeledContent("Mittlere Antwortzeit", value: "\(Int(data.http.average_ms.value ?? 0)) ms")
                }
                Section("Dienste und Speicher") {
                    LabeledContent("Konten", value: count(data.counts.users))
                    LabeledContent("Aktive Sitzungen", value: count(data.counts.sessions))
                    LabeledContent("Gebäude / Dateien", value: "\(count(data.counts.buildings)) / \(count(data.counts.files))")
                    LabeledContent("Hochgeladene Dateien", value: bytes(data.counts.file_bytes.value))
                    if let database = data.counts.database_bytes?.value { LabeledContent("Datenbank", value: bytes(database)) }
                    ForEach(data.host?.containers ?? []) { container in
                        LabeledContent(container.name, value: container.state ?? "–")
                    }
                }
                Section { Text("Nur Anzeige. Aktualisiert \(projectDate(data.generated_at)) · alle 30 Sekunden, solange die Ansicht offen ist.").font(.footnote).foregroundStyle(.secondary) }
            } else if problem == nil {
                Section { ProgressView("Serverdaten werden geladen …") }
            }
        }
        .navigationTitle("Serverübersicht").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { while !Task.isCancelled { await load(); try? await Task.sleep(for: .seconds(30)) } }
    }

    private enum Unit { case percent, bytes }
    @ViewBuilder private func capacity(_ title: LocalizedStringKey, used: Double?, total: Double?, unit: Unit) -> some View {
        if let used, let total, total > 0 {
            VStack(alignment: .leading, spacing: 6) {
                HStack { Text(title); Spacer(); Text(unit == .percent ? "\(Int(used.rounded())) %" : "\(bytes(used)) / \(bytes(total))").foregroundStyle(.secondary).monospacedDigit() }
                ProgressView(value: min(used / total, 1)).tint(used / total > 0.85 ? .red : used / total > 0.7 ? .orange : d21Accent)
            }
        } else {
            LabeledContent(title, value: "–")
        }
    }
    private func count(_ number: FlexNumber) -> String { Int(number.value ?? 0).formatted() }
    private func bytes(_ value: Double?) -> String { ByteCountFormatter.string(fromByteCount: Int64(value ?? 0), countStyle: .file) }
    private func load() async {
        do { data = try await account.request("admin/overview"); problem = nil }
        catch { if !Task.isCancelled { problem = error.localizedDescription + (data == nil ? "" : " " + tr("Angezeigt wird der letzte geladene Stand.")) } }
    }
}
