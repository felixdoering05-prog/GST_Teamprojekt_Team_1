import SwiftUI

private struct IFCAnalysisResponse: Decodable {
    struct Report: Decodable {
        struct Room: Decodable { let global_id: String; let name: String; let storey: String? }
        let schema: String?
        let entity_count: Int?
        let rooms: [Room]?
        let warnings: [String]?
        let limitations: [String]?
        let error: String?
        let schema_issue_count: Int?
    }
    let status: String
    let report: Report?
}
struct IFCAnalysisView: View {
    let document: BuildingDocument
    @ObservedObject var account: AccountModel
    @State private var result: IFCAnalysisResponse?
    @State private var problem: String?
    @State private var busy = false
    var body: some View {
        List {
            Section { Text(document.name).font(.headline) }
            if let result {
                Section("Hintergrundanalyse") {
                    Label(statusText(result.status), systemImage: result.status == "ready" ? "checkmark.document" : "clock")
                    if let report = result.report {
                        if let schema = report.schema { LabeledContent("IFC-Version", value: schema) }
                        if let count = report.entity_count { LabeledContent("IFC-Einträge", value: String(count)) }
                        if let issues = report.schema_issue_count { LabeledContent("Strukturhinweise", value: String(issues)) }
                        if let error = report.error { Text(error).foregroundStyle(.secondary) }
                    }
                }
                if let rooms = result.report?.rooms, !rooms.isEmpty {
                    Section("Erfasste Räume · maximal 500") {
                        ForEach(Array(rooms.enumerated()), id: \.offset) { _, room in
                            VStack(alignment: .leading) {
                                Text(room.name.isEmpty ? "Raum ohne Namen" : room.name)
                                Text(room.storey ?? "Geschoss fehlt").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if let warnings = result.report?.warnings, !warnings.isEmpty {
                    Section("Bitte prüfen") { ForEach(Array(warnings.enumerated()), id: \.offset) { _, text in Text(text) } }
                }
                if let limits = result.report?.limitations {
                    Section("Umfang der Prüfung") { ForEach(Array(limits.enumerated()), id: \.offset) { _, text in Text(text).font(.footnote).foregroundStyle(.secondary) } }
                }
            }
            if let problem { Text(problem).foregroundStyle(.secondary) }
            if busy { ProgressView() }
            Button("Aktualisieren", systemImage: "arrow.clockwise") { Task { await refresh() } }.disabled(busy)
        }
        .navigationTitle("Modellprüfung").navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }.refreshable { await refresh() }
    }
    private func statusText(_ value: String) -> String {
        switch value { case "ready": return "Basisprüfung abgeschlossen"; case "running": return "Modell wird ausgewertet"; case "failed": return "Analyse nicht abgeschlossen"; default: return "Analyse vorgemerkt" }
    }
    @MainActor private func refresh() async {
        guard !busy else { return }; busy = true; problem = nil
        defer { busy = false }
        do { result = try await account.request("documents/\(document.id)/analysis") }
        catch { result = nil; problem = error.localizedDescription }
    }
}
