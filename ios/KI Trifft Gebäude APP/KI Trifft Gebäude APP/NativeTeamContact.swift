import SwiftUI

// Team-Funktionen wie in der Web-App: eigene Kontaktdaten für das Team, Kontakt eines Mitglieds und Einladung ins Team.
struct TeamContactInfo: Decodable { var phone: String; var email: String; var share_with_team: Bool? = nil }

/// Eigene Telefonnummer und Team-E-Mail; nur mit Freigabe für Teammitglieder sichtbar.
struct NativeTeamContactEditor: View {
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var phone = ""
    @State private var email = ""
    @State private var share = false
    @State private var loading = true
    @State private var busy = false
    @State private var problem: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Telefonnummer", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                    TextField("E-Mail für das Team", text: $email).keyboardType(.emailAddress).textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                } footer: { Text("Diese Angaben sind getrennt von deinem Login und nur für Teammitglieder gedacht.") }
                Section {
                    Toggle("Mit meinen Teams teilen", isOn: $share)
                } footer: { Text("Nur wenn die Freigabe aktiv ist, können Mitglieder deiner Teams dich anrufen oder anschreiben.") }
                if let problem { Section { TeamProblem(message: problem) } }
            }
            .redacted(reason: loading ? .placeholder : [])
            .disabled(loading || busy)
            .navigationTitle("Meine Kontaktdaten").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) { Button("Sichern") { Task { await save() } }.disabled(loading || busy || phone.count > 40 || email.count > 254) }
            }
            .task { await load() }
        }.interactiveDismissDisabled(busy)
    }
    private func load() async {
        defer { loading = false }
        do { let value: TeamContactInfo = try await account.request("profile/team-contact"); phone = value.phone; email = value.email; share = value.share_with_team ?? false; problem = nil }
        catch { problem = error.localizedDescription }
    }
    private func save() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            let _: TeamContactInfo = try await account.request("profile/team-contact", method: "PATCH", body: ["phone": phone.trimmingCharacters(in: .whitespaces), "email": email.trimmingCharacters(in: .whitespaces), "share_with_team": share])
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}

/// Kontaktdaten eines Teammitglieds mit Anrufen und E-Mail.
struct NativeMemberContactSheet: View {
    let team: NativeTeam
    let member: NativeOrganisationMember
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var info: TeamContactInfo?
    @State private var problem: String?
    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        ContactInitials(name: member.name, id: member.id, size: 52)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(member.name).font(.title3.bold())
                            if let title = member.title { Text(title).foregroundStyle(d21Accent) }
                            Text(member.role).font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 4)
                }
                if let info {
                    if info.phone.isEmpty && info.email.isEmpty {
                        Section { Label("\(member.name) teilt keine Kontaktdaten mit dem Team.", systemImage: "lock").foregroundStyle(.secondary) }
                    } else {
                        Section("Kontakt") {
                            if !info.phone.isEmpty, let url = URL(string: "tel:" + info.phone.filter { "+0123456789".contains($0) }) {
                                Button { openURL(url) } label: { Label(info.phone, systemImage: "phone.fill") }
                            }
                            if !info.email.isEmpty, let url = URL(string: "mailto:" + info.email) {
                                Button { openURL(url) } label: { Label(info.email, systemImage: "envelope.fill") }
                            }
                        }
                    }
                } else if let problem { Section { TeamProblem(message: problem) } }
                else { Section { ProgressView() } }
            }
            .navigationTitle("Kontakt").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Fertig") { dismiss() } }
            .task {
                do { info = try await account.request("teams/\(team.id)/members/\(member.id)/contact") }
                catch let error as APIError where error.status == 404 { info = TeamContactInfo(phone: "", email: "") }
                catch { problem = error.localizedDescription }
            }
        }
    }
}

/// Bestätigten Kontakt einem Gebäude des Teams hinzufügen (wie „Mitglied zum Team einladen“ im Web).
struct NativeTeamInviteSheet: View {
    let team: NativeTeam
    let members: [NativeOrganisationMember]
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var contacts: [ProjectContact] = []
    @State private var contact: Int?
    @State private var building: Int?
    @State private var loading = true
    @State private var busy = false
    @State private var problem: String?
    private var buildings: [NativeTeamBuilding] { team.buildings.filter { $0.owner_id == team.owner_id } }
    private var available: [ProjectContact] { contacts.filter { c in c.status == "accepted" && !members.contains { $0.id == c.user_id } } }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Kontakt", selection: $contact) {
                        Text("Auswählen").tag(Int?.none)
                        ForEach(available) { Text($0.name).tag(Optional($0.user_id)) }
                    }
                    Picker("Gebäudezugriff", selection: $building) {
                        Text("Auswählen").tag(Int?.none)
                        ForEach(buildings) { Text($0.name).tag(Optional($0.id)) }
                    }
                } footer: { Text("Die Person bekommt eine Einladung für das Gebäude und erscheint nach Annahme im Team. Die Rolle legst du danach unter Gebäude fest.") }
                if !loading && available.isEmpty {
                    Section { Label("Keine bestätigten Kontakte ohne Teamzugang. Kontakte fügst du unter „Kontakte“ hinzu.", systemImage: "person.crop.circle.badge.questionmark").font(.footnote).foregroundStyle(.secondary) }
                }
                if let problem { Section { TeamProblem(message: problem) } }
            }
            .disabled(busy)
            .navigationTitle("Mitglied einladen").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) { Button("Einladen") { Task { await invite() } }.disabled(busy || contact == nil || building == nil) }
            }
            .task {
                defer { loading = false }
                do { contacts = try await account.request("contacts"); if buildings.count == 1 { building = buildings.first?.id } }
                catch { problem = error.localizedDescription }
            }
        }.interactiveDismissDisabled(busy)
    }
    private func invite() async {
        guard let contact, let building, !busy else { return }; busy = true; defer { busy = false }
        do { let _: LogoutResult = try await account.request("buildings/\(building)/members", method: "POST", body: ["user_id": contact]); dismiss() }
        catch { problem = error.localizedDescription }
    }
}
