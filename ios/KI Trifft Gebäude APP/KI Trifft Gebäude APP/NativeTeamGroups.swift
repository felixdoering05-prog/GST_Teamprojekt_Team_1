import SwiftUI

struct NativeGroupEditor: View {
    let team: NativeTeam
    let group: NativeBuildingGroup?
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var selected: Set<Int>
    @State private var available: [NativeTeamBuilding] = []
    @State private var loading = true
    @State private var busy = false
    @State private var problem: String?
    init(team: NativeTeam, group: NativeBuildingGroup?, account: AccountModel) {
        self.team = team; self.group = group; self.account = account
        _name = State(initialValue: group?.name ?? "")
        _selected = State(initialValue: Set(group?.buildings.map(\.id) ?? []))
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Gruppe") { TextField("Gruppenname", text: $name) }
                Section {
                    if loading { ProgressView() }
                    ForEach(available) { building in
                        Toggle(building.name, isOn: Binding(get: { selected.contains(building.id) }, set: { if $0 { selected.insert(building.id) } else { selected.remove(building.id) } }))
                    }
                    if !loading && available.isEmpty { Text("Für diese Gebäude fehlen dir die Verwaltungsrechte.").foregroundStyle(.secondary) }
                } header: { Text("Gebäude auswählen") } footer: { Text("Nur Gebäude mit eigener Mitgliederverwaltung sind auswählbar. Das Gruppieren allein vergibt keine Zugriffsrechte.") }
                if let problem { Section { TeamProblem(message: problem) } }
            }.navigationTitle(group == nil ? "Neue Gebäudegruppe" : "Gruppe bearbeiten").disabled(busy)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button("Speichern") { Task { await save() } }.disabled(loading || busy || selected.isEmpty || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 80 || !selected.isSubset(of: Set(available.map(\.id)))) }
                }.task { await load() }
        }.interactiveDismissDisabled(busy)
    }
    private func load() async {
        loading = true; defer { loading = false }
        do {
            var choices: [NativeTeamBuilding] = []
            for building in team.buildings {
                let access: NativeBuildingAccess = try await account.request("buildings/\(building.id)/team-access")
                if access.can_manage_members { choices.append(building) }
            }
            available = choices; problem = nil
        } catch { available = []; problem = error.localizedDescription }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            let path = "teams/\(team.id)/groups" + (group.map { "/\($0.id)" } ?? "")
            let _: NativeBuildingGroup = try await account.request(path, method: group == nil ? "POST" : "PATCH", body: ["name": name.trimmingCharacters(in: .whitespacesAndNewlines), "building_ids": selected.sorted()])
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}

struct NativeGroupDetail: View {
    let team: NativeTeam
    let group: NativeBuildingGroup
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var current: NativeBuildingGroup?
    @State private var access: [Int: NativeBuildingAccess] = [:]
    @State private var problem: String?
    @State private var loading = true
    @State private var editing = false
    @State private var assigning = false
    @State private var deleting = false
    @State private var busy = false
    private var mayManage: Bool { current.map { !$0.buildings.isEmpty && $0.buildings.allSatisfy { access[$0.id]?.can_manage_members == true } } ?? false }
    var body: some View {
        List {
            Section { Label(current?.name ?? group.name, systemImage: "square.stack.3d.up.fill").font(.title2.bold()); Text("Rollen werden je Gebäude vergeben – auch bei einem gemeinsamen Gruppenauftrag.").font(.footnote).foregroundStyle(.secondary) }
            if let problem { Section { TeamProblem(message: problem); Button("Neu laden") { Task { await load() } } } }
            if loading { Section { ProgressView() } }
            if let current {
                Section("Gebäude") {
                    ForEach(current.buildings) { building in
                        NavigationLink { NativeBuildingTeamView(building: Building(id: building.id, name: building.name, address: building.address ?? ""), account: account) } label: { Label(building.name, systemImage: "building.2") }
                    }
                }
                if mayManage {
                    Section {
                        Button("Person für diese Gruppe zuordnen", systemImage: "person.badge.key") { assigning = true }
                        Button("Gebäudeauswahl bearbeiten", systemImage: "pencil") { editing = true }
                        Button("Gruppe löschen", systemImage: "trash", role: .destructive) { deleting = true }
                    }.disabled(busy)
                }
            }
        }.navigationTitle("Gebäudegruppe").navigationBarTitleDisplayMode(.inline)
            .task { await load() }.refreshable { await load() }
            .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) { if let current { NativeGroupEditor(team: team, group: current, account: account) } }
            .sheet(isPresented: $assigning, onDismiss: { Task { await load() } }) { if let current { NativeGroupAssignment(team: team, group: current, access: access, account: account) } }
            .confirmationDialog("Gruppe löschen?", isPresented: $deleting, titleVisibility: .visible) {
                Button("Nur Gruppe löschen", role: .destructive) { Task { await remove() } }
            } message: { Text("Gebäude und bereits vergebene Einzelrechte bleiben bestehen.") }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do {
            let groups: [NativeBuildingGroup] = try await account.request("teams/\(team.id)/groups")
            guard let fresh = groups.first(where: { $0.id == group.id }) else { throw APIError(status: 404, message: "Diese Gruppe ist nicht mehr verfügbar.") }
            var rights: [Int: NativeBuildingAccess] = [:]
            for building in fresh.buildings { rights[building.id] = try await account.request("buildings/\(building.id)/team-access") }
            current = fresh; access = rights; problem = nil
        } catch { current = nil; access = [:]; problem = error.localizedDescription }
    }
    private func remove() async {
        busy = true; defer { busy = false }
        do { let _: LogoutResult = try await account.request("teams/\(team.id)/groups/\(group.id)", method: "DELETE"); dismiss() }
        catch { await load(); problem = error.localizedDescription }
    }
}

struct NativeGroupAssignment: View {
    let team: NativeTeam
    let group: NativeBuildingGroup
    let access: [Int: NativeBuildingAccess]
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var contacts: [ProjectContact] = []
    @State private var person = 0
    @State private var roles: [Int: Int] = [:]
    @State private var busy = false
    @State private var loading = true
    @State private var problem: String?
    @State private var confirming = false
    private var valid: Bool { person > 0 && group.buildings.allSatisfy { building in access[building.id]?.assignableRoles.contains(where: { $0.id == roles[building.id] }) == true } }
    var body: some View {
        NavigationStack {
            Form {
                Section("Person") { Picker("Bestätigter Kontakt", selection: $person) { Text("Bitte auswählen").tag(0); ForEach(contacts) { Text($0.name).tag($0.user_id) } } }
                Section {
                    ForEach(group.buildings) { building in
                        Picker(building.name, selection: Binding(get: { roles[building.id] ?? 0 }, set: { roles[building.id] = $0 })) {
                            Text("Rolle auswählen").tag(0)
                            ForEach(access[building.id]?.assignableRoles ?? []) { Text($0.name).tag($0.id) }
                        }
                    }
                } header: { Text("Rolle je Gebäude") } footer: { Text("Bestehende Rollen dieser Person werden in den aufgeführten Gebäuden ersetzt. Bei neuem Gebäudezugriff entsteht eine Einladung, die angenommen werden muss. Andere Gebäude bleiben unverändert.") }
                if loading { Section { ProgressView() } }
                if !loading && contacts.isEmpty { Section { Text("Es gibt keine passenden bestätigten Kontakte. Gebäudeeigentümer können nicht über einen Gruppenauftrag umgestuft werden.").font(.footnote).foregroundStyle(.secondary) } }
                if let problem { Section { TeamProblem(message: problem) } }
            }.navigationTitle("Gruppenrechte vergeben").disabled(busy)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button("Prüfen") { confirming = true }.disabled(!valid || busy || loading) }
                }.task { await load() }
                .confirmationDialog("Rechte für \(contacts.first(where: { $0.user_id == person })?.name ?? "diese Person") übernehmen?", isPresented: $confirming, titleVisibility: .visible) {
                    Button("Für \(group.buildings.count) Gebäude übernehmen") { Task { await save() } }
                } message: { Text("Die ausgewählten Rollen ersetzen bestehende Einzelrollen. Der Server prüft jedes Gebäude und jeden Rang vor dem Speichern.") }
        }.interactiveDismissDisabled(busy)
    }
    private func load() async {
        loading = true; defer { loading = false }
        do {
            let all: [ProjectContact] = try await account.request("contacts")
            let owners = Set(team.buildings.filter { group.buildings.map(\.id).contains($0.id) }.compactMap(\.owner_id))
            contacts = all.filter { contact in
                contact.status == "accepted" && contact.user_id != account.user?.id && !owners.contains(contact.user_id)
                    && group.buildings.allSatisfy { building in
                        guard let rights = access[building.id], !rights.assignableRoles.isEmpty else { return false }
                        guard let member = rights.members.first(where: { $0.id == contact.user_id }) else { return true }
                        return rights.canManage(member, userID: account.user?.id)
                    }
            }
            problem = nil
        } catch { contacts = []; problem = error.localizedDescription }
    }
    private func save() async {
        guard valid, !busy else { return }; busy = true; defer { busy = false }
        let assignments = group.buildings.map { ["building_id": $0.id, "role_id": roles[$0.id] ?? 0] }
        do { let _: LogoutResult = try await account.request("teams/\(team.id)/groups/\(group.id)/assign", method: "POST", body: ["user_id": person, "assignments": assignments]); dismiss() }
        catch { problem = error.localizedDescription }
    }
}
