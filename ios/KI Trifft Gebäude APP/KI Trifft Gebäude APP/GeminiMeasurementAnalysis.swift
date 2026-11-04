import SwiftUI

private struct MeasurementAnalysisStatus: Decodable {
    struct Context: Codable {
        struct Facts: Codable { let name: String }
        struct Metric: Codable, Identifiable { let metric: String; let count: Int; let unit: String?; let min: Double?; let max: Double?; let mean: Double?; let first_at: String?; let last_at: String?; var id: String { metric } }
        let mode: String; let building: Facts; let source: String; let metrics: [Metric]
        let thresholds: [String:MetricThreshold]; let truncated: Bool; let limitations: [String]; let scope: String
    }
    let enabled: Bool; let model: String; let notice: String; let context: Context; let context_hash: String
}
struct GeminiMeasurementAnalysisView: View {
    @ObservedObject var account: AccountModel
    let building: Building; let source: String
    @State private var status: MeasurementAnalysisStatus?
    @State private var loading = false
    @State private var sending = false
    @State private var problem: String?
    @State private var answer: AssistantAnswer?
    @State private var requestKey = UUID()
    private var hasData: Bool { status?.context.metrics.contains { $0.count > 0 } == true }
    var body: some View {
        Form {
            Section {
                Label("Gemini · Messwerte erläutern", systemImage: "sparkles").font(.headline).foregroundStyle(d21Accent)
                Text("Kein Training: Gemini erhält einen begrenzten Datenkontext für diese einzelne Auswertung. Keine automatische Übertragung.").font(.footnote).foregroundStyle(.secondary)
                Text(source == "demo" ? "DEMO: Es werden nur als Demo gespeicherte Werte ausgewertet." : "Importierte Messwerte: nicht unabhängig verifiziert.").font(.footnote).foregroundStyle(source == "demo" ? .orange : .secondary)
            }
            if loading { Section { ProgressView("Übertragungsumfang wird vorbereitet …") } }
            if let status {
                Section("1 · Übertragungsumfang prüfen") {
                    Text("Gebäudename: " + status.context.building.name)
                    ForEach(status.context.metrics) { metric in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(TelemetryMetric(rawValue: metric.metric)?.title ?? metric.metric).font(.headline)
                            Text("\(metric.count) gültige Werte").font(.subheadline)
                            if let mean = metric.mean { Text("Mittel: \(mean.formatted()) \(metric.unit ?? "") · Min: \(metric.min?.formatted() ?? "–") · Max: \(metric.max?.formatted() ?? "–")").font(.caption) }
                            if let first = metric.first_at, let last = metric.last_at { Text(first + " – " + last).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    Text("Zusätzlich: Projekt-Grenzwerte, Quelle und unten sichtbare Einschränkungen. Keine Rohdateien, Adresse, Kontaktdaten oder Chatverläufe.").font(.footnote).foregroundStyle(.secondary)
                    DisclosureGroup("Vollständigen Kontext anzeigen") { Text(contextText(status)).font(.caption.monospaced()).textSelection(.enabled) }
                    if status.context.truncated { Label("Datenbestand ist größer als dieser Ausschnitt", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                }
                Section("2 · Auswerten") {
                    if !account.aiPreferences.active { NavigationLink { AISettingsView(account: account) } label: { Label("KI-Einstellungen öffnen", systemImage: "sparkles") } }
                    Text("Frage: Beschreibe Auffälligkeiten und Datenlücken im Messwertkontext. Unterscheide Beobachtung, Unsicherheit und nächsten Schritt. Stelle keine Prognose oder Raumdiagnose.").font(.footnote).foregroundStyle(.secondary)
                    Text("Anbieter: Google Gemini · \(status.model). Es gelten die gemeinsamen App-Kontingente. Es gelten die Anbieterbedingungen zur Verarbeitung.").font(.caption).foregroundStyle(.secondary)
                    if !status.enabled { Text("Gemini ist auf dem Projektserver noch nicht verfügbar.").foregroundStyle(.orange) }
                    if !hasData { Text("Für diese Quelle fehlen auswertbare Messwerte. Zuerst Daten importieren.").foregroundStyle(.orange) }
                    Button(sending ? "Gemini wertet aus …" : "Auswertung senden") { Task { await send(status) } }.disabled(!account.aiPreferences.active || !status.enabled || !hasData || sending || answer != nil)
                }
            }
            if let answer {
                Section("Gemini-Antwort · kann Fehler enthalten") { Text(answer.answer).textSelection(.enabled); Text(answer.notice).font(.footnote).foregroundStyle(.secondary); Text(answer.cached ? "Gespeicherte Antwort derselben Anfrage" : "Neue Antwort").font(.caption).foregroundStyle(.secondary) }
            }
            if let problem { Section { Text(problem).foregroundStyle(.red); Text("Bei gleicher Anfrage lässt sich erneut senden. Nach einer Datenänderung zuerst neu vorbereiten.").font(.footnote) } }
            Section { Button("Kontext neu vorbereiten") { Task { await review() } }.disabled(sending || loading) }
        }
        .navigationTitle("KI-Analyse").navigationBarTitleDisplayMode(.inline)
        .task { await account.refreshAIPreferences(); await review() }
        .interactiveDismissDisabled(sending)
    }
    private func contextText(_ status: MeasurementAnalysisStatus) -> String { let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted,.sortedKeys]; return (try? String(data: encoder.encode(status.context), encoding: .utf8)) ?? "Kontext konnte nicht dargestellt werden." }
    private func review() async {
        guard !loading, !sending else { return }; loading = true; answer = nil; status = nil; requestKey = UUID(); defer { loading = false }
        do { let value: MeasurementAnalysisStatus = try await account.request("buildings/\(building.id)/assistant?mode=measurement-analysis&source=\(source)"); guard !Task.isCancelled else { return }; status = value; problem = nil }
        catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
    private func send(_ status: MeasurementAnalysisStatus) async {
        guard account.aiPreferences.active, !sending, status.enabled, hasData else { return }; sending = true; defer { sending = false }
        do {
            let result: AssistantAnswer = try await account.request("buildings/\(building.id)/assistant", method: "POST", body: ["mode":"measurement-analysis","source":source,"consent":"yes","context_hash":status.context_hash,"question":"Beschreibe Auffälligkeiten und Datenlücken im Messwertkontext. Unterscheide Beobachtung, Unsicherheit und nächsten Schritt. Stelle keine Prognose oder Raumdiagnose."], headers: ["X-Request-ID":requestKey.uuidString.lowercased()], timeout: 45)
            guard !Task.isCancelled else { return }; answer = result; problem = nil
        } catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
}
