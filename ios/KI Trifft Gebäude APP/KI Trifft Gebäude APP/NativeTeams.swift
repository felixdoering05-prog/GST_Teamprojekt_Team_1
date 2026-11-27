import SwiftUI
import PhotosUI
import ImageIO

struct NativeTeamsEntry: View {
    @ObservedObject var account: AccountModel
    var body: some View {
        #if DEBUG
        if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21BuildingTeamPreview") {
            NativeBuildingTeamView(building: Building(id: 901, name: "Gebäude D21", address: "Hochschule Darmstadt"), account: account)
        } else if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21TeamSchedulePreview") {
            NativeBuildingSchedules(building: Building(id: 901, name: "Gebäude D21", address: "Hochschule Darmstadt"), account: account)
        } else if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21TeamGroupPreview") {
            NativeGroupDetail(team: previewTeam, group: NativeBuildingGroup(id: 1, name: "Campus Darmstadt", team_id: 1, buildings: previewTeam.buildings), account: account)
        } else if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21TeamDetailPreview") {
            NativeTeamDetail(team: previewTeam, account: account)
        } else { NativeTeamsView(account: account) }
        #else
        NativeTeamsView(account: account)
        #endif
    }
    #if DEBUG
    private var previewTeam: NativeTeam {
        NativeTeam(id: 1, name: "Nala Projektteam", owner_id: 999999, leader_name: "Felix · Vorschau", primary_color: "#167d87", accent_color: "#b8e9df", has_logo: false, is_owner: NativeTeamsPreview.owner, can_manage: NativeTeamsPreview.owner, can_manage_groups: NativeTeamsPreview.owner, buildings: [NativeTeamBuilding(id: 901, name: "Gebäude D21", address: "Hochschule Darmstadt", owner_id: 999999, is_owner: NativeTeamsPreview.owner)])
    }
    #endif
}

func teamColor(_ hex: String) -> Color {
    let value = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x596b3d
    return Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
}
private func teamHex(_ color: Color) -> String {
    var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
    UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
    return String(format: "#%02x%02x%02x", Int(red * 255), Int(green * 255), Int(blue * 255))
}
private func asBuilding(_ item: NativeTeamBuilding) -> Building {
    Building(id: item.id, name: item.name, address: item.address ?? "", is_owner: item.is_owner)
}

struct TeamProblem: View {
    let message: String
    var body: some View {
        Label(message, systemImage: "exclamationmark.icloud").font(.footnote).foregroundStyle(.orange)
            .accessibilityLabel("Hinweis: \(message)")
    }
}

struct NativeTeamMark: View {
    let team: NativeTeam
    @ObservedObject var account: AccountModel
    var size: CGFloat = 60
    @State private var image: UIImage?
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 17 / 60).fill(teamColor(team.primary_color).opacity(0.15))
            if let image { Image(uiImage: image).resizable().scaledToFit().padding(size * 7 / 60) }
            else { Image(systemName: "person.3.fill").font(size < 44 ? .footnote : .title2).foregroundStyle(teamColor(team.primary_color)) }
        }.frame(width: size, height: size).accessibilityHidden(true)
            .task(id: "\(team.id)-\(team.has_logo)") {
                image = nil
                if team.has_logo, let data = try? await account.fileRequest(path: "teams/\(team.id)/logo") { image = UIImage(data: data) }
            }
    }
}

struct NativeTeamsView: View {
    @ObservedObject var account: AccountModel
    @State private var teams: [NativeTeam] = []
    @State private var loading = true
    @State private var problem: String?
    @State private var creating = false
    @State private var logoRevision = 0
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Gemeinsam Gebäude betreuen").font(.title2.bold())
                        Text("Teams, Gruppen und klare Zuständigkeiten.").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    Button { creating = true } label: { Image(systemName: "plus.circle.fill").font(.title) }.accessibilityLabel("Team erstellen")
                }
                if let problem {
                    TeamProblem(message: problem)
                    Button("Erneut laden") { Task { await load() } }
                }
                if loading && teams.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(30) }
                if !loading && teams.isEmpty && problem == nil {
                    ContentUnavailableView("Noch keine Teams", systemImage: "person.3", description: Text("Erstelle ein Team und ordne deine Gebäude zu."))
                }
                ForEach(teams) { team in
                    NavigationLink {
                        NativeTeamDetail(team: team, account: account)
                    } label: {
                        HStack(spacing: 14) {
                            NativeTeamMark(team: team, account: account).id("\(team.id)-\(logoRevision)")
                            VStack(alignment: .leading, spacing: 5) {
                                Text(team.name).font(.headline).foregroundStyle(.primary)
                                Text("\(team.buildings.count) Gebäude · \(team.is_owner ? "Teamleitung" : "Mitglied")").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                        }.padding(16).d21Card(cornerRadius: 22)
                    }.buttonStyle(.plain)
                }
            }.padding(18)
        }.background(Color(uiColor: .systemGroupedBackground))
            .task { await load() }.refreshable { await load() }
            .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) { NativeTeamEditor(team: nil, account: account) }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do { teams = try await account.request("teams"); logoRevision += 1; problem = nil }
        catch { teams = []; problem = error.localizedDescription }
    }
}

struct NativeTeamDetail: View {
    let team: NativeTeam
    @ObservedObject var account: AccountModel
    @State private var current: NativeTeam?
    @State private var groups: [NativeBuildingGroup] = []
    @State private var members: [NativeOrganisationMember] = []
    @State private var managingTitles = false
    @State private var problem: String?
    @State private var loading = true
    @State private var editing = false
    @State private var addGroup = false
    @State private var assignBuilding = false
    @State private var logoRevision = 0
    @State private var assigningBuilding = false
    @State private var contactMember: NativeOrganisationMember?
    @State private var editingContact = false
    @State private var inviting = false
    @Environment(\.dismiss) private var dismissDetail
    private var value: NativeTeam { current ?? team }
    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    NativeTeamMark(team: value, account: account).id(logoRevision)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(value.name).font(.title2.bold())
                        Text(value.leader_name.map { "Teamleitung: \($0)" } ?? "Gemeinsame Gebäudeverwaltung").font(.caption).foregroundStyle(.secondary)
                        HStack(spacing: 5) { Circle().fill(teamColor(value.primary_color)); Circle().fill(teamColor(value.accent_color)) }.frame(width: 28, height: 12)
                    }
                }.padding(.vertical, 7)
            }
            if let problem { Section { TeamProblem(message: problem); Button("Erneut laden") { Task { await load() } } } }
            if loading { Section { ProgressView() } }
            if current != nil {
                Section {
                    ForEach(members) { member in
                        Button { if member.status == "accepted" { contactMember = member } } label: {
                        HStack(spacing: 12) {
                            ContactInitials(name: member.name, id: member.id, size: 38)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(member.name).font(.body.weight(.semibold))
                                if let title = member.title { Text(title).font(.subheadline).foregroundStyle(d21Accent) }
                                Text(member.role + (member.status == "pending" ? " · Einladung offen" : "")).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            if member.status == "accepted" { Image(systemName: "phone.circle").font(.title3).foregroundStyle(.secondary) }
                        }.contentShape(Rectangle())
                        }.buttonStyle(.plain).accessibilityHint(member.status == "accepted" ? "Kontaktdaten anzeigen" : "")
                    }
                    if value.is_owner && value.buildings.contains(where: { $0.owner_id == value.owner_id }) { Button("Mitglied einladen", systemImage: "person.badge.plus") { inviting = true } }
                    Button("Meine Kontaktdaten", systemImage: "phone.badge.checkmark") { editingContact = true }
                    if value.can_manage { Button("Titel & Zuständigkeiten", systemImage: "person.text.rectangle") { managingTitles = true } }
                } header: { Text("Teammitglieder") } footer: { Text("Jede Person erscheint einmal. Tippe auf ein Mitglied für Telefon und E-Mail, sofern es sie mit dem Team teilt. Titel beschreiben Zuständigkeiten und ändern keine Zugriffsrechte.") }
                Section {
                    ForEach(groups) { group in
                        NavigationLink { NativeGroupDetail(team: value, group: group, account: account) } label: {
                            Label { VStack(alignment: .leading) { Text(group.name); Text("\(group.buildings.count) sichtbare Gebäude").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "square.stack.3d.up").foregroundStyle(teamColor(value.primary_color)) }
                        }
                    }
                    if groups.isEmpty { Text("Noch keine Gebäudegruppen").foregroundStyle(.secondary) }
                    if value.can_manage_groups { Button("Gebäudegruppe erstellen", systemImage: "plus") { addGroup = true } }
                } header: { Text("Gebäudegruppen") } footer: { Text("Gruppen bündeln Gebäude. Eine Mitgliedschaft und Rolle gelten weiterhin je Gebäude.") }
                Section("Gebäude") {
                    ForEach(value.buildings) { building in
                        NavigationLink { NativeBuildingTeamView(building: asBuilding(building), account: account) } label: {
                            Label { VStack(alignment: .leading) { Text(building.name); if let address = building.address, !address.isEmpty { Text(address).font(.caption).foregroundStyle(.secondary) } } } icon: { Image(systemName: "building.2").foregroundStyle(teamColor(value.primary_color)) }
                        }
                    }
                    if value.buildings.isEmpty { Text("Diesem Team sind noch keine Gebäude zugeordnet.").foregroundStyle(.secondary) }
                    if value.can_manage { Button("Gebäude zuordnen", systemImage: "building.2.crop.circle") { assignBuilding = true } }
                }
            }
        }.scrollContentBackground(.hidden)
            .background(value.background_color.map(teamColor) ?? Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Teamübersicht").navigationBarTitleDisplayMode(.inline)
            .toolbar { if current?.can_manage == true { Button("Bearbeiten", systemImage: "pencil") { editing = true } } }
            .task { await load() }.refreshable { await load() }
            .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) { NativeTeamEditor(team: value, account: account, onDeleted: { dismissDetail() }) }
            .sheet(item: $contactMember) { member in NativeMemberContactSheet(team: value, member: member, account: account).presentationDetents([.medium]) }
            .sheet(isPresented: $editingContact) { NativeTeamContactEditor(account: account) }
            .sheet(isPresented: $inviting, onDismiss: { Task { await load() } }) { NativeTeamInviteSheet(team: value, members: members, account: account) }
            .sheet(isPresented: $addGroup, onDismiss: { Task { await load() } }) { NativeGroupEditor(team: value, group: nil, account: account) }
            .sheet(isPresented: $assignBuilding, onDismiss: { Task { await load() } }) { buildingAssignment }
            .sheet(isPresented: $managingTitles, onDismiss: { Task { await load() } }) { NativeTeamTitlesView(team: value, account: account) }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do {
            let all: [NativeTeam] = try await account.request("teams")
            guard let fresh = all.first(where: { $0.id == team.id }) else { throw APIError(status: 404, message: "Dieses Team ist nicht mehr verfügbar.") }
            let list: [NativeBuildingGroup] = try await account.request("teams/\(team.id)/groups")
            let people: [NativeOrganisationMember] = try await account.request("teams/\(team.id)/members")
            current = fresh; groups = list; members = people; logoRevision += 1; problem = nil
        } catch { current = nil; groups = []; members = []; problem = error.localizedDescription }
    }
    private var buildingAssignment: some View {
        NavigationStack {
            List {
                Section { Text("Ein eigenes Gebäude kann einem Team zugeordnet werden. Bestehende Gebäudegruppen werden dadurch nicht automatisch angepasst.").font(.footnote).foregroundStyle(.secondary) }
                ForEach(account.buildings.filter { $0.is_owner == true && !value.buildings.map(\.id).contains($0.id) }) { building in
                    Button(building.name) {
                        Task {
                            guard !assigningBuilding else { return }; assigningBuilding = true; defer { assigningBuilding = false }
                            do { let _: NativeAssignedBuilding = try await account.request("teams/\(team.id)/buildings/\(building.id)", method: "PUT"); assignBuilding = false; await load() }
                            catch { problem = error.localizedDescription; assignBuilding = false }
                        }
                    }
                }
            }.disabled(assigningBuilding).navigationTitle("Gebäude zuordnen").toolbar { Button("Schließen") { assignBuilding = false } }
        }
    }
}
private struct NativeAssignedBuilding: Decodable { let id: Int }

struct NativeTeamEditor: View {
    let team: NativeTeam?
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var primary: Color
    @State private var accent: Color
    @State private var background: Color
    @State private var customBackground: Bool
    @State private var saved: NativeTeam?
    @State private var photo: PhotosPickerItem?
    @State private var logo: Data?
    @State private var removeLogo = false
    @State private var problem: String?
    @State private var busy = false
    @State private var confirmDelete = false
    var onDeleted: (() -> Void)? = nil
    init(team: NativeTeam?, account: AccountModel, onDeleted: (() -> Void)? = nil) {
        self.team = team; self.account = account; self.onDeleted = onDeleted
        _name = State(initialValue: team?.name ?? "")
        _primary = State(initialValue: teamColor(team?.primary_color ?? "#596b3d"))
        _accent = State(initialValue: teamColor(team?.accent_color ?? "#cbd5a3"))
        _background = State(initialValue: teamColor(team?.background_color ?? "#f2f2f7"))
        _customBackground = State(initialValue: team?.background_color != nil)
        _saved = State(initialValue: team)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Team") { TextField("Teamname", text: $name); ColorPicker("Hauptfarbe", selection: $primary, supportsOpacity: false); ColorPicker("Akzentfarbe", selection: $accent, supportsOpacity: false) }
                Section {
                    Toggle("Eigener Teamhintergrund", isOn: $customBackground)
                    if customBackground { ColorPicker("Hintergrundfarbe", selection: $background, supportsOpacity: false) }
                } footer: { Text("Ohne eigene Hintergrundfarbe verwendet die Teamansicht dein helles oder dunkles Appdesign.") }
                Section("Logo") {
                    if let logo, let image = UIImage(data: logo) { Image(uiImage: image).resizable().scaledToFit().frame(height: 80) }
                    PhotosPicker(selection: $photo, matching: .images) { Label("Logo auswählen", systemImage: "photo") }
                    if logo != nil || (saved?.has_logo == true && !removeLogo) {
                        Button("Logo entfernen", role: .destructive) { logo = nil; removeLogo = true }
                    }
                }
                if let problem { Section { TeamProblem(message: problem) } }
                if let team, team.is_owner, team.is_default != true {
                    Section {
                        Button("Team entfernen", systemImage: "trash", role: .destructive) { confirmDelete = true }
                    } footer: { Text("Team, Logo, Design, Titel und Gebäudegruppen werden dauerhaft entfernt. Die Gebäude bleiben erhalten und kommen in dein Standardteam.") }
                }
            }.navigationTitle(team == nil ? "Neues Team" : "Team bearbeiten")
                .confirmationDialog("„\(team?.name ?? "")“ unwiderruflich entfernen?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Team entfernen", role: .destructive) { Task { await deleteTeam() } }
                } message: { Text("Das lässt sich nicht rückgängig machen. Die Gebäude bleiben erhalten.") }
                .disabled(busy)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button("Speichern") { Task { await save() } }.disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 80) }
                }
                .onChange(of: photo) { _, item in Task { await prepareLogo(item) } }
        }.interactiveDismissDisabled(busy)
    }
    private func prepareLogo(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        busy = true; defer { busy = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self), data.count <= 25 * 1024 * 1024,
                  let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 1024] as CFDictionary),
                  let jpeg = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.8), jpeg.count <= 2 * 1024 * 1024 else {
                throw APIError(status: 400, message: "Bitte ein kleineres Bild als Teamlogo auswählen.")
            }
            logo = jpeg; removeLogo = false; problem = nil
        } catch { problem = error.localizedDescription }
    }
    private func deleteTeam() async {
        guard let team, !busy else { return }; busy = true; defer { busy = false }
        do { let _: LogoutResult = try await account.request("teams/\(team.id)", method: "DELETE"); dismiss(); onDeleted?() }
        catch { problem = error.localizedDescription }
    }
    private func save() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
            if saved == nil { saved = try await account.request("teams", method: "POST", body: ["name": clean]) }
            guard let id = saved?.id else { return }
            let backgroundValue: Any = customBackground ? teamHex(background) : NSNull()
            let fresh: NativeTeam = try await account.request("teams/\(id)", method: "PATCH", body: ["name": clean, "primary_color": teamHex(primary), "accent_color": teamHex(accent), "background_color": backgroundValue])
            saved = fresh
            if let logo { _ = try await account.fileRequest(path: "teams/\(id)/logo", data: logo, method: "PUT", contentType: "image/jpeg") }
            else if removeLogo && fresh.has_logo { let _: LogoutResult = try await account.request("teams/\(id)/logo", method: "DELETE") }
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}
