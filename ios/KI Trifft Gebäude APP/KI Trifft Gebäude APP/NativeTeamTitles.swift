import SwiftUI

struct NativeTeamTitlesView: View {
    let team: NativeTeam
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var titles: [NativeTeamTitle] = []
    @State private var members: [NativeOrganisationMember] = []
    @State private var title = ""
    @State private var busy = false
    @State private var loading = true
    @State private var problem: String?
    var body: some View {
        NavigationStack {
            List {
                Section { Text("Titel wie „Projektleitung“ oder „Sensorik“ beschreiben Zuständigkeiten. Die Gebäuderollen und deren Zugriffsrechte bleiben unverändert.").font(.footnote).foregroundStyle(.secondary) }
                if let problem { Section { TeamProblem(message: problem); Button("Neu laden") { Task { await load() } } } }
                if loading { Section { ProgressView() } }
                if !loading && team.can_manage {
                    Section("Titel erstellen") {
                        TextField("Zum Beispiel Sensorik", text: $title)
                        Button("Titel hinzufügen", systemImage: "plus") { Task { await create() } }.disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.count > 60)
                    }
                    if !titles.isEmpty {
                        Section {
                            ForEach(titles) { item in Text(item.name) }
                                .onDelete { offsets in let doomed = offsets.map { titles[$0] }; Task { for item in doomed { await remove(item) } } }
                                .deleteDisabled(!team.is_owner)
                        } header: { Text("Vorhandene Titel") } footer: { Text("Zum Löschen nach links wischen. Mitglieder behalten ihre Gebäuderechte.") }
                    }
                    Section("Titel zuordnen") {
                        ForEach(members.filter { $0.status == "accepted" && $0.id != team.owner_id }) { member in
                            Menu {
                                Button("Kein Titel") { Task { await assign(member, titleID: nil) } }
                                ForEach(titles) { item in Button(item.name) { Task { await assign(member, titleID: item.id) } } }
                            } label: {
                                HStack { VStack(alignment: .leading) { Text(member.name).foregroundStyle(.primary); Text(member.title ?? "Ohne Titel").font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "chevron.up.chevron.down").font(.caption) }
                            }.disabled(busy)
                        }
                    }
                }
            }.disabled(busy).navigationTitle("Titel & Zuständigkeiten").toolbar { Button("Schließen") { dismiss() }.disabled(busy) }
                .task { await load() }
        }.interactiveDismissDisabled(busy)
    }
    private func load() async {
        loading = true; defer { loading = false }
        do { titles = try await account.request("teams/\(team.id)/titles"); members = try await account.request("teams/\(team.id)/members"); problem = nil }
        catch { titles = []; members = []; problem = error.localizedDescription }
    }
    private func create() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { let _: NativeTeamTitle = try await account.request("teams/\(team.id)/titles", method: "POST", body: ["name": title.trimmingCharacters(in: .whitespacesAndNewlines)]); title = ""; await load() }
        catch { await load(); problem = error.localizedDescription }
    }
    private func remove(_ item: NativeTeamTitle) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { let _: LogoutResult = try await account.request("teams/\(team.id)/titles/\(item.id)", method: "DELETE"); await load() }
        catch { await load(); problem = error.localizedDescription }
    }
    private func assign(_ member: NativeOrganisationMember, titleID: Int?) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        let value: Any = titleID.map { $0 as Any } ?? NSNull()
        do { let _: LogoutResult = try await account.request("teams/\(team.id)/members/\(member.id)/title", method: "PUT", body: ["title_id":value]); await load() }
        catch { await load(); problem = error.localizedDescription }
    }
}
