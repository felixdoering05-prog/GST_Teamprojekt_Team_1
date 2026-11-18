import SwiftUI

struct NativeBuildingTeamView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var access: NativeBuildingAccess?
    @State private var contacts: [ProjectContact] = []
    @State private var loading = true
    @State private var busy = false
    @State private var problem: String?
    @State private var inviting = false
    @State private var addingRole = false
    @State private var removal: NativeTeamMember?
    var body: some View {
        List {
            Section {
                Label(building.name, systemImage: "building.2").font(.headline)
                if let access { Label(access.actor_role.name, systemImage: access.is_owner ? "crown" : "person.badge.shield.checkmark").foregroundStyle(d21Accent) }
            }
            if let problem { Section { TeamProblem(message: problem); Button("Neu laden") { Task { await load() } } } }
            if loading { Section { ProgressView() } }
            if let access {
                Section("Zusammenarbeit") {
                    if access.allows("coordination") { NavigationLink { BuildingChatView(building: building, account: account) } label: { Label("Gebäudechat", systemImage: "bubble.left.and.bubble.right") } }
                }
                Section {
                    ForEach(access.members) { member in
                        HStack(spacing: 12) {
                            ContactInitials(name: member.name, id: member.id, size: 38)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(member.name).font(.body.weight(.semibold))
                                Text(member.role_name + (member.status == "pending" ? " · Einladung offen" : "")).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if access.canManage(member, userID: account.user?.id) {
                                Menu {
                                    ForEach(access.assignableRoles) { role in
                                        Button(role.name, systemImage: member.role_id == role.id ? "checkmark.circle" : "person.badge.key") { Task { await change(member, to: role.id) } }
                                    }
                                    Divider()
                                    Button("Gebäudezugriff entfernen", systemImage: "person.badge.minus", role: .destructive) { removal = member }
                                } label: { Image(systemName: "ellipsis.circle").padding(5) }.disabled(busy).accessibilityLabel("\(member.name) verwalten")
                            }
                        }.padding(.vertical, 3)
                    }
                    if access.can_manage_members && !access.assignableRoles.isEmpty { Button("Person einladen", systemImage: "person.badge.plus") { inviting = true }.disabled(busy) }
                } header: { Text("Mitglieder") } footer: { Text("Einladungen müssen angenommen werden. Rollen und Zugriff gelten nur für dieses Gebäude.") }
                Section {
                    ForEach(access.roles) { role in
                        if access.can_manage_roles {
                            NavigationLink { NativeRoleEditor(building: building, role: role, account: account) } label: { roleLabel(role) }
                        } else { roleLabel(role) }
                    }.onMove { from, to in moveRoles(from, to: to) }.moveDisabled(!access.can_manage_roles || busy)
                    if access.can_manage_roles { Button("Eigene Rolle erstellen", systemImage: "plus") { addingRole = true }.disabled(busy) }
                } header: { Text("Rollen & Funktionsrechte") } footer: { Text(access.can_manage_roles ? "Weiter oben bedeutet einen höheren Rang. Über „Bearbeiten“ lässt sich die Reihenfolge ändern. Nur die Eigentümerin oder der Eigentümer darf Rollen bearbeiten." : "Verwaltende Personen können ausschließlich niedrigere Rollen vergeben. Der Server prüft jeden Auftrag erneut.") }
            }
        }.navigationTitle("Gebäudeteam").navigationBarTitleDisplayMode(.inline)
            .toolbar { if access?.can_manage_roles == true { EditButton() } }
            .task { await load() }.refreshable { await load() }
            .sheet(isPresented: $inviting, onDismiss: { Task { await load() } }) {
                if let access { NativeBuildingInvitationEditor(building: building, account: account, roles: access.assignableRoles, contacts: contacts.filter { $0.status == "accepted" && !access.members.map(\.id).contains($0.user_id) }) }
            }
            .sheet(isPresented: $addingRole, onDismiss: { Task { await load() } }) { NavigationStack { NativeRoleEditor(building: building, role: nil, account: account) } }
            .confirmationDialog("Gebäudezugriff für \(removal?.name ?? "diese Person") entfernen?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) {
                Button("Zugriff entfernen", role: .destructive) { if let removal { Task { await remove(removal) } } }
            } message: { Text("Zugriff auf andere Gebäude und der Kontakt bleiben bestehen.") }
    }
    private func roleLabel(_ role: NativeBuildingRole) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(role.name, systemImage: role.can_manage_members == true ? "person.2.badge.key" : "shield")
            if let permissions = role.permissions {
                Text("\(permissions.values.filter { $0 == "edit" }.count) Bereiche bearbeiten · \(permissions.values.filter { $0 == "read" }.count) nur lesen").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do { access = try await account.request("buildings/\(building.id)/team-access"); contacts = try await account.request("contacts"); problem = nil }
        catch { access = nil; problem = error.localizedDescription }
    }
    private func change(_ member: NativeTeamMember, to role: Int) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/team-access/members/\(member.id)/role", method: "PATCH", body: ["role_id": role]); await load() }
        catch { await load(); problem = error.localizedDescription }
    }
    private func remove(_ member: NativeTeamMember) async {
        guard !busy else { return }; busy = true; defer { busy = false }; removal = nil
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/team-access/members/\(member.id)", method: "DELETE"); await load() }
        catch { await load(); problem = error.localizedDescription }
    }
    private func moveRoles(_ from: IndexSet, to: Int) {
        guard let access, access.can_manage_roles, !busy else { return }
        var order = access.roles; order.move(fromOffsets: from, toOffset: to)
        busy = true
        Task {
            do { let _: NativeRoleOrderResult = try await account.request("buildings/\(building.id)/team-access/roles/order", method: "PATCH", body: ["role_ids": order.map(\.id)]); await load() }
            catch { await load(); problem = error.localizedDescription }
            busy = false
        }
    }
}
private struct NativeRoleOrderResult: Decodable { let ok: Bool }

struct NativeBuildingInvitationEditor: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let roles: [NativeBuildingRole]
    let contacts: [ProjectContact]
    @Environment(\.dismiss) private var dismiss
    @State private var person = 0
    @State private var role = 0
    @State private var busy = false
    @State private var problem: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Kontakt", selection: $person) { Text("Person auswählen").tag(0); ForEach(contacts) { Text($0.name).tag($0.user_id) } }
                    Picker("Rolle", selection: $role) { Text("Rolle auswählen").tag(0); ForEach(roles) { Text($0.name).tag($0.id) } }
                } footer: { Text("Nur bestätigte Kontakte sind auswählbar. Die Einladung gilt für „\(building.name)“ und muss angenommen werden.") }
                if contacts.isEmpty { Section { Text("Füge zuerst unter Team → Kontakte eine Person hinzu und lasse die Anfrage bestätigen.").foregroundStyle(.secondary) } }
                if let problem { Section { TeamProblem(message: problem) } }
            }.navigationTitle("Person einladen").disabled(busy)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button("Einladen") { Task { await save() } }.disabled(busy || person == 0 || role == 0) }
                }
        }.interactiveDismissDisabled(busy)
    }
    private func save() async {
        busy = true; defer { busy = false }
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/team-access/members", method: "POST", body: ["user_id": person, "role_id": role]); dismiss() }
        catch { problem = error.localizedDescription }
    }
}

struct NativeRoleEditor: View {
    let building: Building
    let role: NativeBuildingRole?
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var permissions: [String: String]
    @State private var manages: Bool
    @State private var busy = false
    @State private var problem: String?
    @State private var deleting = false
    init(building: Building, role: NativeBuildingRole?, account: AccountModel) {
        self.building = building; self.role = role; self.account = account
        _name = State(initialValue: role?.name ?? "")
        _permissions = State(initialValue: role?.permissions ?? [:])
        _manages = State(initialValue: role?.can_manage_members ?? false)
    }
    var body: some View {
        Form {
            Section("Rolle") { TextField("Name", text: $name); Toggle("Niedrigere Rollen verwalten", isOn: $manages) }
            Section("Funktionsrechte") {
                ForEach(nativeTeamModules, id: \.key) { module in
                    Picker(module.title, selection: Binding(get: { permissions[module.key] ?? "none" }, set: { permissions[module.key] = $0 })) {
                        Text("Kein Zugriff").tag("none"); Text("Lesen").tag("read"); Text("Bearbeiten").tag("edit")
                    }
                }
            }
            if let problem { Section { TeamProblem(message: problem) } }
            if role != nil && role?.is_system == false { Section { Button("Rolle löschen", role: .destructive) { deleting = true } } }
        }.navigationTitle(role == nil ? "Neue Rolle" : "Rolle bearbeiten").disabled(busy)
            .toolbar { Button("Speichern") { Task { await save() } }.disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 80) }
            .confirmationDialog("Rolle löschen?", isPresented: $deleting, titleVisibility: .visible) {
                Button("Rolle löschen", role: .destructive) { Task { await delete() } }
            } message: { Text("Ordne Mitglieder vorher einer anderen Rolle zu. Standardrollen bleiben erhalten.") }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            let path = "buildings/\(building.id)/team-access/roles" + (role.map { "/\($0.id)" } ?? "")
            let _: NativeBuildingRole = try await account.request(path, method: role == nil ? "POST" : "PATCH", body: ["name": name.trimmingCharacters(in: .whitespacesAndNewlines), "permissions": permissions, "can_manage_members": manages])
            dismiss()
        } catch { problem = error.localizedDescription }
    }
    private func delete() async {
        guard let role else { return }; busy = true; defer { busy = false }
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/team-access/roles/\(role.id)", method: "DELETE"); dismiss() }
        catch { problem = error.localizedDescription }
    }
}
