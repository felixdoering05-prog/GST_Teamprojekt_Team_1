import SwiftUI
import Combine

struct ProjectContact: Decodable, Identifiable {
    let id: Int; let user_id: Int; let name: String; let status: String
}
struct BuildingInvitation: Decodable, Identifiable {
    let id: Int; let name: String; let address: String; let owner_name: String
}
struct BuildingMember: Decodable, Identifiable {
    let id: Int; let name: String; let status: String
}
struct ProjectNotice: Decodable, Identifiable {
    let id: Int; let kind: String; let title: String; let building_id: Int?
    let created_at: String; let read_at: String?
    var tint: Color { switch kind { case "chat": .blue; case "file": .orange; case "plan_ready": .indigo; case "invitation": .pink; default: d21Accent } }
    var icon: String { switch kind { case "chat": "bubble.left.and.bubble.right"; case "file": "doc.badge.plus"; case "plan_ready": "cube.fill"; case "invitation": "person.badge.plus"; default: "person.2" } }
}
struct BuildingMessage: Decodable, Identifiable {
    let id: Int; let user_id: Int; let name: String; let text: String; let created_at: String
    var deleted: Bool? = nil
}
func projectDate(_ value: String) -> String {
    let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = parser.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    return date?.formatted(date: .abbreviated, time: .shortened) ?? ""
}
@MainActor final class CollaborationModel: ObservableObject {
    @Published var contacts: [ProjectContact] = []
    @Published var invitations: [BuildingInvitation] = []
    @Published var notices: [ProjectNotice] = []
    @Published var problem: String?
    @Published var loading = false
    @Published var acting = false
    var unread: Int { notices.filter { $0.read_at == nil }.count }
    func reload(_ account: AccountModel) async {
        guard !loading, account.user != nil else { return }
        loading = true; defer { loading = false }
        do {
            async let c: [ProjectContact] = account.request("contacts")
            async let i: [BuildingInvitation] = account.request("building-invitations")
            async let n: [ProjectNotice] = account.request("notifications")
            let result = try await (c, i, n)
            contacts = result.0; invitations = result.1; notices = result.2; problem = nil
        } catch { problem = error.localizedDescription }
    }
    func act(_ account: AccountModel, path: String, method: String = "POST", body: [String: String]? = nil) async -> Bool {
        guard !acting else { return false }; acting = true; defer { acting = false }
        do { let _: LogoutResult = try await account.request(path, method: method, body: body); await reload(account); return true }
        catch { problem = error.localizedDescription; return false }
    }
}
struct ContactInitials: View {
    let name: String
    var id: Int = 0
    var size: CGFloat = 44
    private static let palettes: [[Color]] = [[.teal, .cyan], [.indigo, .purple], [.orange, .pink], [.blue, .teal], [.mint, .green], [.pink, .purple]]
    var body: some View {
        let palette = Self.palettes[abs(id) % Self.palettes.count]
        Text(initials).font(.system(size: size * 0.38, weight: .bold, design: .rounded)).foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(LinearGradient(colors: palette, startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
            .accessibilityHidden(true)
    }
    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let value = parts.compactMap { $0.first.map(String.init) }.joined()
        return (value.isEmpty ? "?" : value).uppercased()
    }
}
struct ContactsView: View {
    @ObservedObject var account: AccountModel
    @ObservedObject var social: CollaborationModel
    @State private var adding = false
    @State private var removal: ProjectContact?
    @State private var search = ""
    private var accepted: [ProjectContact] { social.contacts.filter { $0.status == "accepted" } }
    private var pending: [ProjectContact] { social.contacts.filter { $0.status == "pending" } }
    private var shown: [ProjectContact] { search.isEmpty ? accepted : accepted.filter { $0.name.localizedCaseInsensitiveContains(search) } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if let problem = social.problem {
                    HStack(spacing: 12) {
                        Image(systemName: "exclamationmark.icloud").foregroundStyle(.orange)
                        Text(problem).font(.footnote)
                        Spacer(minLength: 0)
                        Button("Neu laden") { Task { await social.reload(account) } }.font(.footnote.weight(.semibold))
                    }.padding(14).d21Card(cornerRadius: 18)
                }
                if !pending.isEmpty {
                    sectionTitle("Anfragen", count: pending.count)
                    VStack(spacing: 10) { ForEach(pending) { requestCard($0) } }
                }
                sectionTitle("Meine Kontakte", count: accepted.count)
                if accepted.count > 5 {
                    HStack { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("Kontakt suchen", text: $search).textInputAutocapitalization(.never) }
                        .padding(12).d21Card(cornerRadius: 14)
                }
                if accepted.isEmpty {
                    VStack(spacing: 14) {
                        HStack(spacing: -12) { ForEach(0..<3) { i in ContactInitials(name: ["A", "B", "C"][i], id: i * 2 + 1, size: 46).overlay(Circle().stroke(Color(uiColor: .secondarySystemGroupedBackground), lineWidth: 3)) } }
                        Text("Vernetze dich mit deinem Team").font(.headline)
                        Text("Bestätigte Kontakte erscheinen hier. Eine Anfrage allein gibt noch keinen Gebäudezugriff frei.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button { adding = true } label: { Label("Ersten Kontakt hinzufügen", systemImage: "person.badge.plus") }.buttonStyle(.borderedProminent).tint(d21Accent)
                    }.frame(maxWidth: .infinity).padding(24).d21Card(cornerRadius: 24)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { index, contact in
                            HStack(spacing: 14) {
                                ContactInitials(name: contact.name, id: contact.user_id)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(contact.name).font(.body.weight(.semibold))
                                    Label("Verbunden", systemImage: "checkmark.seal.fill").font(.caption).foregroundStyle(d21Accent).labelStyle(.titleAndIcon)
                                }
                                Spacer(minLength: 0)
                                Menu {
                                    Button("Kontakt entfernen", systemImage: "person.badge.minus", role: .destructive) { removal = contact }
                                } label: { Image(systemName: "ellipsis").font(.body.weight(.semibold)).foregroundStyle(.secondary).frame(width: 36, height: 36).contentShape(Rectangle()) }
                                    .accessibilityLabel("Optionen für \(contact.name)")
                            }.padding(.horizontal, 16).padding(.vertical, 12)
                            .contextMenu { Button("Kontakt entfernen", systemImage: "person.badge.minus", role: .destructive) { removal = contact } }
                            .accessibilityElement(children: .combine)
                            if index < shown.count - 1 { Divider().padding(.leading, 74) }
                        }
                        if shown.isEmpty { Text("Kein Kontakt gefunden.").font(.subheadline).foregroundStyle(.secondary).padding(16) }
                    }.d21Card(cornerRadius: 22)
                }
                Label("Kontakte sehen nur deinen Namen. Gebäude teilst du einzeln über „Mitglieder und Freigaben“ im jeweiligen Gebäude.", systemImage: "lock.shield")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .refreshable { await social.reload(account) }
        .sheet(isPresented: $adding) { AddContactSheet(account: account, social: social) }
        .confirmationDialog("Kontakt entfernen?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) {
            Button("Entfernen", role: .destructive) { if let contact = removal { Task { _ = await social.act(account, path: "contacts/\(contact.id)", method: "DELETE") } }; removal = nil }
        } message: { Text("Bestehende Gebäudefreigaben bleiben bestehen. Diese verwaltest du im jeweiligen Gebäude.") }
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Dein Team").font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.75))
                    Text(accepted.count == 1 ? "1 Kontakt" : "\(accepted.count) Kontakte").font(.system(.title, design: .rounded, weight: .bold))
                }
                Spacer()
                HStack(spacing: -12) {
                    ForEach(Array(accepted.prefix(3).enumerated()), id: \.element.id) { _, contact in
                        ContactInitials(name: contact.name, id: contact.user_id, size: 36).overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2))
                    }
                }.accessibilityHidden(true)
            }
            HStack {
                if !pending.isEmpty { Label(pending.count == 1 ? "1 offene Anfrage" : "\(pending.count) offene Anfragen", systemImage: "person.crop.circle.badge.questionmark").font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 7).background(.white.opacity(0.16), in: Capsule()) }
                Spacer()
                Button { adding = true } label: { Label("Hinzufügen", systemImage: "plus").font(.subheadline.weight(.semibold)).padding(.horizontal, 14).frame(minHeight: 38).background(.white, in: Capsule()).foregroundStyle(Color(red: 0.07, green: 0.18, blue: 0.31)) }
                    .buttonStyle(BuildingTileButtonStyle()).accessibilityLabel("Kontakt hinzufügen")
            }
        }
        .foregroundStyle(.white).padding(20)
        .background(LinearGradient(colors: [Color(red: 0.06, green: 0.15, blue: 0.28), Color(red: 0.05, green: 0.36, blue: 0.42)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
    private func sectionTitle(_ title: String, count: Int) -> some View {
        HStack(spacing: 8) {
            Text(title).font(.title3.bold())
            if count > 0 { Text("\(count)").font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3).background(d21Accent.opacity(0.14), in: Capsule()).foregroundStyle(d21Accent) }
        }
    }
    private func requestCard(_ contact: ProjectContact) -> some View {
        HStack(spacing: 14) {
            ContactInitials(name: contact.name, id: contact.user_id)
            VStack(alignment: .leading, spacing: 2) {
                Text(contact.name).font(.body.weight(.semibold))
                Text("möchte sich mit dir verbinden").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button { Task { _ = await social.act(account, path: "contacts/\(contact.id)", method: "DELETE") } } label: {
                Image(systemName: "xmark").font(.subheadline.weight(.bold)).frame(width: 38, height: 38).background(Color(uiColor: .tertiarySystemFill), in: Circle())
            }.buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Anfrage von \(contact.name) ablehnen")
            Button { Task { _ = await social.act(account, path: "contacts/\(contact.id)/accept") } } label: {
                Image(systemName: "checkmark").font(.subheadline.weight(.bold)).frame(width: 38, height: 38).background(d21Accent, in: Circle()).foregroundStyle(.white)
            }.buttonStyle(.plain).accessibilityLabel("Anfrage von \(contact.name) annehmen")
        }.padding(14).d21Card(cornerRadius: 20).disabled(social.acting)
    }
}
struct AddContactSheet: View {
    @ObservedObject var account: AccountModel
    @ObservedObject var social: CollaborationModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var sending = false
    @State private var confirmation: String?
    @State private var problem: String?
    @FocusState private var focused: Bool
    private var valid: Bool { let v = email.trimmingCharacters(in: .whitespaces); return v.contains("@") && v.contains(".") && v.count >= 5 }
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "person.crop.circle.badge.plus").font(.system(size: 44)).foregroundStyle(d21Accent)
                Text("Kontakt hinzufügen").font(.title2.bold())
                Text("Gib die E-Mail-Adresse des App-Kontos ein. Die Person muss die Anfrage bestätigen – erst dann seht ihr euch gegenseitig.").font(.subheadline).foregroundStyle(.secondary)
                HStack {
                    Image(systemName: "envelope").foregroundStyle(.secondary)
                    TextField("name@beispiel.de", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().focused($focused).submitLabel(.send).onSubmit { if valid { Task { await send() } } }
                }.padding(14).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let confirmation { Label(confirmation, systemImage: "checkmark.circle.fill").font(.footnote).foregroundStyle(d21Accent) }
                if let problem { Label(problem, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.orange) }
                Spacer()
                Button { Task { await send() } } label: { Text(sending ? "Wird gesendet …" : "Anfrage senden").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).tint(d21Accent).controlSize(.large).disabled(sending || !valid)
            }.padding(24).background(Color(uiColor: .systemGroupedBackground))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() } } }
            .onAppear { focused = true }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    private func send() async {
        sending = true; problem = nil; defer { sending = false }
        do { let result: ResetMessage = try await account.request("contacts", method: "POST", body: ["email": email.trimmingCharacters(in: .whitespaces)]); confirmation = result.message; email = ""; await social.reload(account) }
        catch { problem = error.localizedDescription }
    }
}
struct NotificationsView: View {
    @ObservedObject var account: AccountModel
    @ObservedObject var social: CollaborationModel
    var openContacts: () -> Void
    var body: some View {
        List {
            if let problem = social.problem { Section { Text(problem).foregroundStyle(.red); Button("Erneut versuchen") { Task { await social.reload(account) } } } }
            if !social.invitations.isEmpty {
                Section("Einladungen zu Gebäuden") {
                    ForEach(social.invitations) { invitation in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(invitation.name).font(.headline); Text("Von \(invitation.owner_name)").foregroundStyle(.secondary)
                            HStack {
                                Button("Beitreten") { Task { if await social.act(account, path: "buildings/\(invitation.id)/invitation", body: ["action":"accept"]) { await account.loadBuildings() } } }.buttonStyle(.borderedProminent)
                                Button("Ablehnen") { Task { _ = await social.act(account, path: "buildings/\(invitation.id)/invitation", body: ["action":"decline"]) } }.buttonStyle(.bordered)
                            }.disabled(social.acting)
                        }.padding(.vertical, 4)
                    }
                }
            }
            Section("Deine Mitteilungen") {
                if social.notices.isEmpty { ContentUnavailableView("Alles auf dem neuesten Stand", systemImage: "bell", description: Text("Anfragen, Einladungen, neue Dateien und Chatnachrichten erscheinen hier. Zum Aktualisieren nach unten ziehen.")) }
                ForEach(social.notices) { notice in
                    Group {
                        if let id = notice.building_id, let building = account.buildings.first(where: { $0.id == id }) {
                            NavigationLink {
                                if notice.kind == "plan_ready" { PlanConversionView(building: building, account: account, onAdopt: {}) }
                                else { BuildingDetailView(building: building, model: account, initialSection: notice.kind == "chat" ? "Chat" : "Dateien") }
                            } label: { noticeLabel(notice) }
                                .simultaneousGesture(TapGesture().onEnded { markRead(notice) })
                        } else {
                            Button { markRead(notice); if notice.kind == "contact" { openContacts() } } label: { noticeLabel(notice) }.foregroundStyle(.primary)
                        }
                    }.contextMenu { if notice.read_at == nil { Button("Als gelesen markieren") { markRead(notice) } } }
                }
            }
        }.navigationTitle("Mitteilungen").refreshable { await social.reload(account); await account.loadBuildings() }
    }
    private func noticeLabel(_ notice: ProjectNotice) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: notice.icon).font(.subheadline.weight(.semibold)).foregroundStyle(notice.tint).frame(width: 36, height: 36)
                .background(notice.tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            VStack(alignment: .leading, spacing: 5) { Text(notice.title).fontWeight(notice.read_at == nil ? .semibold : .regular); Text(projectDate(notice.created_at)).font(.caption).foregroundStyle(.secondary) }
            if notice.read_at == nil { Circle().fill(d21Accent).frame(width: 8, height: 8).accessibilityLabel("Ungelesen") }
        }.padding(.vertical, 5)
    }
    private func markRead(_ notice: ProjectNotice) { guard notice.read_at == nil else { return }; Task { _ = await social.act(account, path: "notifications/\(notice.id)/read") } }
}
struct BuildingDetailView: View {
    let building: Building
    @ObservedObject var model: AccountModel
    @State private var section: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var tabs
    @State private var sharing = false
    @State private var managing = false
    @State private var confirmDeletion = false
    @State private var deleting = false
    @State private var name = ""
    @State private var address = ""
    @State private var problem: String?
    @State private var saving = false
    init(building: Building, model: AccountModel, initialSection: String = "Dashboard") {
        self.building = building; self.model = model
        _section = State(initialValue: initialSection == "Übersicht" ? "Dashboard" : initialSection)
        _name = State(initialValue: building.name); _address = State(initialValue: building.address)
    }
    private var isOwner: Bool { model.buildings.first(where: { $0.id == building.id })?.is_owner == true || building.is_owner == true }
    private let areas = [("Dashboard", "Start", "chart.bar.xaxis"), ("3D", "Modell", "cube.transparent"), ("Geräte", "Geräte", "lightbulb"), ("KI", "KI", "sparkles"), ("Team", "Chat", "bubble.left.and.bubble.right")]
    private func isSelected(_ area: String) -> Bool { section == area || (area == "KI" && section == "Sprache") }
    private func open(_ area: String) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { section = area }
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                ForEach(areas, id: \.0) { item in
                    Button { open(item.0) } label: {
                        HStack(spacing: 6) { Image(systemName: item.2).font(.subheadline); if isSelected(item.0) { Text(item.1).font(.caption.weight(.semibold)) } }
                            .padding(.horizontal, 12).frame(minWidth: 40, minHeight: 42)
                            .foregroundStyle(isSelected(item.0) ? .white : .secondary)
                            .background { if isSelected(item.0) { Capsule().fill(d21Accent).matchedGeometryEffect(id: "selected-area", in: tabs) } }
                    }.buttonStyle(.plain).accessibilityLabel(item.1).accessibilityAddTraits(isSelected(item.0) ? .isSelected : [])
                }
            }.padding(5).background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule()).padding(.horizontal, 16).padding(.vertical, 8)
            // Size cap like the system tab bar so the selected label never breaks into single letters.
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            content.id(section).transition(.opacity)
        }.background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(name).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if section == "KI" {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { open("Sprache") } label: { Image(systemName: "waveform") }.accessibilityLabel("Sprachchat öffnen")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Gebäudeverwaltung", systemImage: "slider.horizontal.3") { managing = true }
                    Button("Mitglieder und Freigaben", systemImage: "person.badge.plus") { sharing = true }
                    Button("Dateien", systemImage: "folder") { open("Dateien") }
                    if isOwner {
                        Divider()
                        Button("Gebäude löschen", systemImage: "trash", role: .destructive) { confirmDeletion = true }
                    }
                } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Gebäude verwalten")
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .onChange(of: model.buildings) { _, all in if !all.contains(where: { $0.id == building.id }) { dismiss() } }
        .sheet(isPresented: $sharing) { BuildingSharingView(building: building, account: model) }
        .sheet(isPresented: $managing) { management }
        .confirmationDialog("„\(name)“ endgültig löschen?", isPresented: Binding(get: { confirmDeletion && !managing }, set: { if !$0 { confirmDeletion = false } }), titleVisibility: .visible) {
            Button("Gebäude und zugehörige Daten löschen", role: .destructive) { Task { await deleteBuilding() } }
        } message: { Text("Alle Mitglieder verlieren den Zugriff. Dateien und Chat-/KI-Verläufe dieses Gebäudes werden entfernt. Das kann in der App nicht rückgängig gemacht werden.") }
    }
    @ViewBuilder private var content: some View {
        switch section {
        case "Dateien": BuildingFilesView(building: building, model: model)
        case "3D": BuildingModelView(building: building, account: model)
        case "Geräte": BuildingDevicesView(building: building, account: model)
        case "Heatmap": BuildingHeatmapView(account: model, building: building)
        case "KI": BuildingAssistantView(building: building, account: model)
        case "Sprache": BuildingVoiceView(building: building, account: model)
        case "Team", "Chat": BuildingChatView(building: building, account: model)
        case "Sensorik", "Energie", "Analyse": TelemetryDashboardView(account: model, building: building, initialArea: section)
        default: BuildingCockpit(building: building, account: model, open: open)
        }
    }
    private var management: some View {
        NavigationStack {
            Form {
                Section("Gebäudedaten") {
                    TextField("Name", text: $name)
                    TextField("Adresse", text: $address)
                    Button(saving ? "Wird gespeichert …" : "Speichern") { Task { await save() } }.disabled(saving || deleting || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if isOwner {
                    Section {
                        NavigationLink { PlanConversionView(building: building, account: model, onAdopt: {}) } label: { Label("3D-Entwurf aus Plänen", systemImage: "wand.and.stars") }
                        Button("Gebäude dauerhaft löschen", systemImage: "trash", role: .destructive) { confirmDeletion = true }.disabled(saving || deleting)
                    } footer: { Text("Löscht dieses Gebäude samt hochgeladenen Dateien, Geräten, Messdaten und zugehörigen Chat-/KI-Verläufen. Andere Gebäude bleiben erhalten.") }
                }
                if let problem { Section { Text(problem).foregroundStyle(.red) } }
                if deleting { ProgressView("Gebäude wird gelöscht …") }
            }.navigationTitle("Gebäude verwalten").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { managing = false }.disabled(saving || deleting) } }
            .interactiveDismissDisabled(saving || deleting)
            .confirmationDialog("„\(name)“ endgültig löschen?", isPresented: $confirmDeletion, titleVisibility: .visible) {
                Button("Gebäude und zugehörige Daten löschen", role: .destructive) { Task { await deleteBuilding() } }
            } message: { Text("Alle Mitglieder verlieren den Zugriff. Dateien und Chat-/KI-Verläufe dieses Gebäudes werden entfernt. Das kann in der App nicht rückgängig gemacht werden. Bereits heruntergeladene Kopien und historische Backups werden nicht dadurch gelöscht.") }
        }
    }
    private func save() async {
        saving = true; defer { saving = false }
        do { let _: LogoutResult = try await model.request("buildings/\(building.id)", method: "PATCH", body: ["name":name,"address":address]); await model.loadBuildings(); problem = nil }
        catch { problem = error.localizedDescription }
    }
    private func deleteBuilding() async {
        guard !deleting, isOwner else { return }; deleting = true; defer { deleting = false }
        do { try await model.deleteOwnedBuilding(building); managing = false; dismiss() }
        catch { problem = error.localizedDescription }
    }
}
extension AccountModel {
    /// Deletes a building the account owns (server checks session and ownership) and clears local drafts.
    func deleteOwnedBuilding(_ building: Building) async throws {
        let _: LogoutResult = try await request("buildings/\(building.id)", method: "DELETE", body: ["confirmation": "DELETE"])
        try? draftStore(buildingID: building.id)?.clear()
        if let store = draftStore(), let draft = try? store.load(), draft.building?.id == building.id { try? store.clear() }
        buildings.removeAll { $0.id == building.id }
        await loadBuildings()
    }
}

struct BuildingSharingView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var members: [BuildingMember] = []
    @State private var contacts: [ProjectContact] = []
    @State private var problem: String?
    @State private var acting = false
    @State private var removal: BuildingMember?
    var owner: Bool { building.is_owner != false }
    var body: some View {
        NavigationStack {
            List {
                Section { Text("Mitglieder können Gebäudedaten, Dateien und Chat gemeinsam nutzen. Nur der Eigentümer verwaltet Einladungen und Freigaben.").foregroundStyle(.secondary) }
                if let problem { Section { Text(problem).foregroundStyle(.red); Button("Erneut laden") { Task { await load() } } } }
                Section("Mitglieder") {
                    ForEach(members) { member in
                        HStack { ContactInitials(name: member.name); VStack(alignment: .leading) { Text(member.name); Text(member.status == "owner" ? "Eigentümer" : member.status == "pending" ? "Einladung offen" : "Mitglied").font(.caption).foregroundStyle(.secondary) }; Spacer()
                            if member.status != "owner", owner || member.id == account.user?.id { Button(role: .destructive) { removal = member } label: { Image(systemName: "minus.circle") }.accessibilityLabel(member.id == account.user?.id ? "Gebäude verlassen" : "Zugriff für \(member.name) entfernen") }
                        }
                    }
                }
                if owner {
                    Section("Kontakt einladen") {
                        ForEach(contacts.filter { c in c.status == "accepted" && !members.contains(where: { $0.id == c.user_id }) }) { contact in
                            Button { Task { await invite(contact) } } label: { Label(contact.name, systemImage: "person.badge.plus") }.disabled(acting)
                        }
                        Text("Fehlt jemand? Vernetze dich zuerst im Tab Kontakte.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }.navigationTitle("Zusammenarbeiten").toolbar { Button("Fertig") { dismiss() } }.task { await load() }
            .confirmationDialog("Gebäudezugriff entfernen?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) {
                Button("Zugriff entfernen", role: .destructive) { if let member = removal { Task { await remove(member) } }; removal = nil }
            } message: { Text("Neue Datei- und Chatanfragen werden danach abgewiesen. Bereits heruntergeladene Kopien können nicht zurückgerufen werden.") }
        }
    }
    private func load() async {
        do { members = try await account.request("buildings/\(building.id)/members"); contacts = try await account.request("contacts"); problem = nil } catch { problem = error.localizedDescription }
    }
    private func invite(_ contact: ProjectContact) async {
        acting = true; defer { acting = false }
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/members", method: "POST", body: ["user_id":String(contact.user_id)]); await load() } catch { problem = error.localizedDescription }
    }
    private func remove(_ member: BuildingMember) async {
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/members/\(member.id)", method: "DELETE"); await account.loadBuildings(); if member.id == account.user?.id { dismiss() } else { await load() } } catch { problem = error.localizedDescription }
    }
}
struct BuildingChatView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var messages: [BuildingMessage] = []
    @State private var text = ""
    @State private var sending = false
    @State private var loading = false
    @State private var problem: String?
    @State private var requestID = UUID()
    @State private var pendingText: String?
    @State private var older = false
    @State private var hasMore = true
    @State private var deleteTarget: BuildingMessage?
    @State private var deleting = false
    @Environment(\.scenePhase) private var scenePhase
    private func mine(_ m: BuildingMessage) -> Bool { m.user_id == account.user?.id }
    private func messageDate(_ value: String) -> Date? {
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    private func dayLabel(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return "Heute" }
        if Calendar.current.isDateInYesterday(date) { return "Gestern" }
        return date.formatted(Date.FormatStyle(locale: Locale(identifier: "de_DE")).weekday(.wide).day().month(.wide))
    }
    @ViewBuilder private func bubble(_ message: BuildingMessage, index: Int) -> some View {
        let own = mine(message)
        let previous = index > 0 ? messages[index - 1] : nil
        let date = messageDate(message.created_at)
        let newDay = date.map { d in previous.flatMap { messageDate($0.created_at) }.map { !Calendar.current.isDate($0, inSameDayAs: d) } ?? true } ?? false
        let firstOfGroup = newDay || previous?.user_id != message.user_id
        if newDay, let date {
            Text(dayLabel(date)).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                .padding(.horizontal, 12).padding(.vertical, 5).background(Color(uiColor: .tertiarySystemFill), in: Capsule())
                .frame(maxWidth: .infinity).padding(.top, 10)
        }
        HStack(alignment: .bottom, spacing: 8) {
            if own { Spacer(minLength: 48) }
            else if firstOfGroup { ContactInitials(name: message.name, id: message.user_id, size: 30) }
            else { Color.clear.frame(width: 30, height: 1) }
            VStack(alignment: own ? .trailing : .leading, spacing: 3) {
                if firstOfGroup && !own { Text(message.name).font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.leading, 4) }
                Group {
                    if message.deleted == true { Label("Nachricht gelöscht", systemImage: "trash").italic().foregroundStyle(.secondary) }
                    else { Text(message.text).textSelection(.enabled).foregroundStyle(own ? .white : .primary) }
                }
                .font(.body)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background {
                    if message.deleted == true { RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color(uiColor: .separator), style: StrokeStyle(lineWidth: 1, dash: [4])) }
                    else if own { UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 6, topTrailingRadius: 18, style: .continuous).fill(LinearGradient(colors: [d21Accent, Color(red: 0.06, green: 0.40, blue: 0.55)], startPoint: .topLeading, endPoint: .bottomTrailing)) }
                    else { UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 6, bottomTrailingRadius: 18, topTrailingRadius: 18, style: .continuous).fill(Color(uiColor: .secondarySystemGroupedBackground)) }
                }
                if let date { Text(date.formatted(date: .omitted, time: .shortened)).font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 4) }
            }
            if !own { Spacer(minLength: 48) }
        }
        .padding(.top, firstOfGroup ? 8 : 1)
        .id(message.id)
        .contextMenu {
            if message.deleted != true { Button("Text kopieren", systemImage: "doc.on.doc") { UIPasteboard.general.string = message.text } }
            if own && message.deleted != true { Button("Nachricht löschen", systemImage: "trash", role: .destructive) { deleteTarget = message }.disabled(deleting) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel((own ? "Du" : message.name) + ": " + (message.deleted == true ? "Nachricht gelöscht" : message.text))
    }
    private var canSend: Bool { !sending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf16.count <= 2000 }
    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if hasMore && !messages.isEmpty {
                            Button { Task { await loadOlder() } } label: { Label(older ? "Wird geladen …" : "Ältere Nachrichten", systemImage: "arrow.up.circle") }
                                .font(.footnote.weight(.semibold)).buttonStyle(.bordered).tint(d21Accent).disabled(older).padding(.vertical, 8)
                        }
                        if messages.isEmpty && problem == nil && !loading {
                            VStack(spacing: 12) {
                                Image(systemName: "bubble.left.and.text.bubble.right.fill").font(.system(size: 42)).foregroundStyle(d21Accent.gradient)
                                Text("Euer Gebäude-Chat").font(.title3.bold())
                                Text("Stellt Fragen zu Plänen und haltet Absprachen fest. Nur Mitglieder dieses Gebäudes lesen mit.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                            }.padding(32).frame(maxWidth: .infinity).padding(.top, 40)
                        }
                        ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in bubble(message, index: index) }
                    }.padding(.horizontal, 14).padding(.bottom, 10)
                }
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(.bottom)
                .refreshable { await load() }
                .onChange(of: messages.last?.id) { _, id in if let id, !older { withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(id, anchor: .bottom) } } }
            }
            if let problem {
                HStack(spacing: 10) { Image(systemName: "exclamationmark.icloud").foregroundStyle(.orange); Text(problem).font(.footnote); Spacer(minLength: 0); Button("Neu laden") { Task { await load() } }.font(.footnote.weight(.semibold)) }
                    .padding(.horizontal, 16).padding(.vertical, 8)
            }
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Nachricht an alle im Gebäude", text: $text, axis: .vertical)
                    .lineLimit(1...5).disabled(sending)
                    .padding(.horizontal, 16).padding(.vertical, 11)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color(uiColor: .separator).opacity(0.5)))
                Button { Task { await send() } } label: {
                    Group { if sending { ProgressView().tint(.white) } else { Image(systemName: "arrow.up").font(.body.weight(.bold)) } }
                        .foregroundStyle(.white).frame(width: 42, height: 42)
                        .background(canSend || sending ? d21Accent : Color(uiColor: .systemGray3), in: Circle())
                }.buttonStyle(BuildingTileButtonStyle()).accessibilityLabel("Nachricht senden").disabled(!canSend)
            }
            .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)
            .background(.bar)
            Text("Nur für Gebäudemitglieder · aktualisiert sich bei geöffneter App").font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.bottom, 4).background(.bar)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .confirmationDialog("Eigene Nachricht für alle löschen?", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }), titleVisibility: .visible, presenting: deleteTarget) { target in
            Button("Nachricht löschen", role: .destructive) { Task { await remove(target) } }
            Button("Behalten", role: .cancel) { deleteTarget = nil }
        } message: { _ in Text("Der Text wird durch einen Löschhinweis ersetzt. Die Aktion kann in der App nicht rückgängig gemacht werden.") }
        .task {
            await load()
            while !Task.isCancelled { do { try await Task.sleep(for: .seconds(10)) } catch { return }; if scenePhase == .active { await load() } }
        }
    }
    private func load() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do {
            let latest: [BuildingMessage] = try await account.request("buildings/\(building.id)/messages")
            let ids = Set(latest.map(\.id)), oldIDs = messages.filter { !ids.contains($0.id) }.suffix(450).map { String($0.id) }
            let old: [BuildingMessage] = oldIDs.isEmpty ? [] : try await account.request("buildings/\(building.id)/messages?ids=" + oldIDs.joined(separator: ","))
            messages = Array((old + latest).sorted { $0.id < $1.id }.suffix(500)); hasMore = messages.count < 500 && latest.count == 50; problem = nil
        }
        catch { problem = error.localizedDescription }
    }
    private func loadOlder() async {
        guard !older, !loading, messages.count < 500, let first = messages.first else { return }; older = true; defer { older = false }
        do { let page: [BuildingMessage] = try await account.request("buildings/\(building.id)/messages?before=\(first.id)"); let ids = Set(messages.map(\.id)); messages = Array((page.filter { !ids.contains($0.id) } + messages).suffix(500)); hasMore = page.count == 50 && messages.count < 500 } catch { problem = error.localizedDescription }
    }
    private func send() async {
        sending = true; defer { sending = false }
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if pendingText != content { requestID = UUID(); pendingText = content }
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/messages", method: "POST", body: ["text":content], headers: ["X-Request-ID":requestID.uuidString]); text = ""; pendingText = nil; await load() }
        catch { problem = error.localizedDescription }
    }
    private func remove(_ message: BuildingMessage) async {
        guard !deleting else { return }; deleting = true; defer { deleting = false; deleteTarget = nil }
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/messages/\(message.id)", method: "DELETE"); messages.removeAll { $0.id == message.id }; await load() } catch { problem = error.localizedDescription }
    }
}

struct UIPreferences:Decodable {let presentation_mode:Bool;let revision:Int}
struct TeamInboxView:View {
    @ObservedObject var account:AccountModel
    @ObservedObject var social:CollaborationModel
    @State private var section="Kontakte"
    var body:some View {
        VStack(spacing:0) {
            Picker("Team",selection:$section){Text("Kontakte").tag("Kontakte");Text(social.unread>0 ? "Mitteilungen (\(social.unread))" : "Mitteilungen").tag("Mitteilungen")}.pickerStyle(.segmented).padding()
            if section=="Kontakte" {ContactsView(account:account,social:social)} else {NotificationsView(account:account,social:social,openContacts:{section="Kontakte"})}
        }.navigationTitle("Team")
    }
}
