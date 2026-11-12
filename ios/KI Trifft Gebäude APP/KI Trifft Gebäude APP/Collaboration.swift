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
    var body: some View {
        Text(String(name.prefix(1)).uppercased()).font(.headline)
            .frame(width: 42, height: 42).background(d21Accent.opacity(0.12), in: Circle()).foregroundStyle(d21Accent)
            .accessibilityHidden(true)
    }
}
struct ContactsView: View {
    @ObservedObject var account: AccountModel
    @ObservedObject var social: CollaborationModel
    @State private var email = ""
    @State private var sending = false
    @State private var confirmation: String?
    @State private var removal: ProjectContact?
    var body: some View {
        List {
            Section {
                Text("Gemeinsam an Gebäuden arbeiten").font(.headline)
                Text("Füge jemanden über die E-Mail-Adresse seines Kontos hinzu. Nach der Bestätigung erscheint der Vorname hier.").foregroundStyle(.secondary)
                TextField("E-Mail-Adresse", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button { Task { await send() } } label: { Label(sending ? "Anfrage wird gesendet …" : "Kontaktanfrage senden", systemImage: "person.badge.plus") }.disabled(sending || email.trimmingCharacters(in: .whitespaces).isEmpty)
                if let confirmation { Text(confirmation).font(.footnote).foregroundStyle(.secondary) }
            }
            if let problem = social.problem { Section { Text(problem).foregroundStyle(.red); Button("Erneut laden") { Task { await social.reload(account) } } } }
            let pending = social.contacts.filter { $0.status == "pending" }
            if !pending.isEmpty {
                Section("Kontaktanfragen") {
                    ForEach(pending) { contact in
                        VStack(alignment: .leading, spacing: 12) {
                            Label(contact.name, systemImage: "person")
                            HStack {
                                Button("Annehmen") { Task { _ = await social.act(account, path: "contacts/\(contact.id)/accept") } }.buttonStyle(.borderedProminent)
                                Button("Ablehnen") { Task { _ = await social.act(account, path: "contacts/\(contact.id)", method: "DELETE") } }.buttonStyle(.bordered)
                            }.disabled(social.acting)
                        }.padding(.vertical, 4)
                    }
                }
            }
            Section("Meine Kontakte") {
                ForEach(social.contacts.filter { $0.status == "accepted" }) { contact in
                    HStack(spacing: 12) { ContactInitials(name: contact.name); Text(contact.name); Spacer(); Image(systemName: "checkmark.circle.fill").foregroundStyle(d21Accent) }
                        .contextMenu { Button("Kontakt entfernen", role: .destructive) { removal = contact } }
                }
                if social.contacts.filter({ $0.status == "accepted" }).isEmpty { ContentUnavailableView("Vernetze dich mit deinem Team", systemImage: "person.2", description: Text("Bestätigte Kontakte erscheinen hier. Eine Anfrage allein gibt noch keinen Gebäudezugriff frei.")) }
            }
        }.navigationTitle("Kontakte").refreshable { await social.reload(account) }
        .confirmationDialog("Kontakt entfernen?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) {
            Button("Entfernen", role: .destructive) { if let contact = removal { Task { _ = await social.act(account, path: "contacts/\(contact.id)", method: "DELETE") } }; removal = nil }
        } message: { Text("Bestehende Gebäudefreigaben bleiben bestehen. Diese verwaltest du im jeweiligen Gebäude.") }
    }
    private func send() async {
        sending = true; defer { sending = false }
        do { let result: ResetMessage = try await account.request("contacts", method: "POST", body: ["email": email]); confirmation = result.message; email = ""; await social.reload(account) }
        catch { social.problem = error.localizedDescription }
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
            Image(systemName: notice.icon).foregroundStyle(d21Accent).frame(width: 24)
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
    private func open(_ area: String) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { section = area }
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                ForEach(areas, id: \.0) { item in
                    Button { open(item.0) } label: {
                        HStack(spacing: 6) { Image(systemName: item.2).font(.subheadline); if section == item.0 { Text(item.1).font(.caption.weight(.semibold)) } }
                            .padding(.horizontal, 12).frame(minWidth: 40, minHeight: 42)
                            .foregroundStyle(section == item.0 ? .white : .secondary)
                            .background { if section == item.0 { Capsule().fill(d21Accent).matchedGeometryEffect(id: "selected-area", in: tabs) } }
                    }.buttonStyle(.plain).accessibilityLabel(item.1).accessibilityAddTraits(section == item.0 ? .isSelected : [])
                }
            }.padding(5).background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule()).padding(.horizontal, 16).padding(.vertical, 8)
            content.id(section).transition(.opacity)
        }.background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(name).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Gebäudeverwaltung", systemImage: "slider.horizontal.3") { managing = true }
                    Button("Mitglieder und Freigaben", systemImage: "person.badge.plus") { sharing = true }
                    Button("Dateien", systemImage: "folder") { open("Dateien") }
                } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Gebäude verwalten")
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .onChange(of: model.buildings) { _, all in if !all.contains(where: { $0.id == building.id }) { dismiss() } }
        .sheet(isPresented: $sharing) { BuildingSharingView(building: building, account: model) }
        .sheet(isPresented: $managing) { management }
    }
    @ViewBuilder private var content: some View {
        switch section {
        case "Dateien": BuildingFilesView(building: building, model: model)
        case "3D": BuildingModelView(building: building, account: model)
        case "Geräte": BuildingDevicesView(building: building, account: model)
        case "Heatmap": BuildingHeatmapView(account: model, building: building)
        case "KI": BuildingAssistantView(building: building, account: model)
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
        do {
            let _: LogoutResult = try await model.request("buildings/\(building.id)", method: "DELETE", body: ["confirmation":"DELETE"])
            try? model.draftStore(buildingID: building.id)?.clear()
            if let store = model.draftStore(), let draft = try? store.load(), draft.building?.id == building.id { try? store.clear() }
            managing = false; model.buildings.removeAll { $0.id == building.id }; await model.loadBuildings(); dismiss()
        } catch { problem = error.localizedDescription }
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
    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                List {
                    if hasMore && !messages.isEmpty { Button(older ? "Wird geladen …" : "Ältere Nachrichten laden") { Task { await loadOlder() } }.disabled(older) }
                    if messages.isEmpty && problem == nil { ContentUnavailableView("Euer Gebäude-Gespräch", systemImage: "bubble.left.and.bubble.right", description: Text("Stellt Fragen zu Plänen und haltet Absprachen hier fest.")) }
                    ForEach(messages) { message in
                        VStack(alignment: message.user_id == account.user?.id ? .trailing : .leading, spacing: 5) {
                            Text(message.user_id == account.user?.id ? "Du" : message.name).font(.caption.bold()).foregroundStyle(d21Accent)
                            if message.deleted == true { Label("Nachricht gelöscht", systemImage: "trash").font(.subheadline).foregroundStyle(.secondary) }
                            else { Text(message.text).textSelection(.enabled) }
                            Text(projectDate(message.created_at)).font(.caption2).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity, alignment: message.user_id == account.user?.id ? .trailing : .leading).padding(.vertical, 6).id(message.id)
                        .contextMenu { if message.user_id == account.user?.id && message.deleted != true { Button("Nachricht löschen", systemImage: "trash", role: .destructive) { deleteTarget = message }.disabled(deleting) } }
                    }
                }.listStyle(.plain).refreshable { await load() }
                .onChange(of: messages.last?.id) { _, id in if let id, !older { proxy.scrollTo(id, anchor: .bottom) } }
            }
            if let problem { HStack { Text(problem).font(.footnote).foregroundStyle(.red); Button("Erneut laden") { Task { await load() } } }.padding(.horizontal) }
            HStack(alignment: .bottom) {
                TextField("Nachricht an das Gebäude", text: $text, axis: .vertical).lineLimit(1...5).textFieldStyle(.roundedBorder).disabled(sending)
                Button { Task { await send() } } label: { Image(systemName: sending ? "hourglass" : "arrow.up.circle.fill").font(.title2) }.accessibilityLabel("Nachricht senden").disabled(sending || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.utf16.count>2000)
            }.padding().background(.bar)
            Text("Nur für Gebäudemitglieder · Aktualisierung bei geöffneter App").font(.caption2).foregroundStyle(.secondary).padding(.bottom, 4)
        }.confirmationDialog("Eigene Nachricht für alle löschen?", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }), titleVisibility: .visible, presenting: deleteTarget) { target in
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
