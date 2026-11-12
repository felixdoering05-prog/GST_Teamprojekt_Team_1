import SwiftUI

private struct ProjectServiceStatus: Decodable {
    struct Configuration: Decodable { let ai, voice, generation: Bool }
    struct Quota: Decodable { let used: Int; let limit: Int? }
    struct Usage: Decodable { let questions, live, recognition, playback: Quota }
    struct Generation: Decodable { let queued, running, ready, failed_24h: Int }
    let checked_at: String
    let account_ai_enabled: Bool
    let configuration: Configuration
    let usage_24h: Usage
    let generation: Generation
    let notice: String
}

struct ProjectServiceStatusView: View {
    @ObservedObject var account: AccountModel
    @State private var status: ProjectServiceStatus?
    @State private var problem: String?
    @State private var loading = false
    var body: some View {
        List {
            if let status {
                Section {
                    Label("Projektserver erreichbar", systemImage: "checkmark.icloud.fill").foregroundStyle(.green)
                    if let date = checkedDate(status.checked_at) {
                        Text("Geprüft: \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("KI und Sprache") {
                    LabeledContent("Für dein Konto", value: status.account_ai_enabled ? "Aktiviert" : "Deaktiviert")
                    configured("KI-Anbindung", status.configuration.ai)
                    configured("Sprachanbindung", status.configuration.voice)
                    NavigationLink("KI-Einstellungen") { AISettingsView(account: account) }
                }
                Section("Deine Nutzung · letzte 24 Stunden") {
                    quota("KI-Anfragen", status.usage_24h.questions)
                    quota("Live-Gespräche", status.usage_24h.live)
                    quota("Spracherkennung", status.usage_24h.recognition)
                    quota("Wiedergabe", status.usage_24h.playback)
                }
                Section("Gebäude generieren") {
                    configured("Planverarbeitung", status.configuration.generation)
                    LabeledContent("Wartend", value: String(status.generation.queued))
                    LabeledContent("In Bearbeitung", value: String(status.generation.running))
                    LabeledContent("Zum Prüfen bereit", value: String(status.generation.ready))
                    LabeledContent("Fehlgeschlagen · 24 Stunden", value: String(status.generation.failed_24h))
                }
                Section { Text(status.notice).font(.footnote).foregroundStyle(.secondary) }
            }
            if let problem {
                Section { Label(problem, systemImage: "exclamationmark.icloud").foregroundStyle(.secondary) }
            }
            if loading { ProgressView("Serverstatus wird geprüft …") }
            Button("Erneut prüfen", systemImage: "arrow.clockwise") { Task { await refresh() } }.disabled(loading)
        }
        .navigationTitle("Serverstatus").navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
        .refreshable { await refresh() }
        .onChange(of: account.user?.id) { _, _ in status = nil; problem = nil }
        .onChange(of: account.serverURL) { _, _ in status = nil; problem = nil }
    }
    private func checkedDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }
    private func configured(_ title: String, _ enabled: Bool) -> some View {
        LabeledContent(title, value: enabled ? "Serverseitig aktiviert" : "Nicht aktiviert")
    }
    private func quota(_ title: String, _ value: ProjectServiceStatus.Quota) -> some View {
        LabeledContent(title, value: value.limit.map { "\(value.used) / \($0)" } ?? "\(value.used) · kein Kontolimit")
    }
    @MainActor private func refresh() async {
        guard !loading else { return }
        loading = true; problem = nil
        defer { loading = false }
        do { status = try await account.request("profile/service-status") }
        catch { status = nil; problem = error.localizedDescription }
    }
}
