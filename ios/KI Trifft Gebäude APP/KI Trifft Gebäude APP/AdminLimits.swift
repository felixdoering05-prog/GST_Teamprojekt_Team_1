import SwiftUI

// Projektadministration: Limits pro Person. Der Server entscheidet, wer Admin ist (D21_ADMIN_USER_IDS);
// die App blendet den Bereich nur ein, wenn /admin/me das bestätigt.

private struct AdminMe: Decodable { let admin: Bool }

struct AdminUser: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let email: String
    let buildings: Int
    let limits_unlimited: Bool?
    let limits_custom: Bool?
    let admin: Bool?
    enum CodingKeys: String, CodingKey { case id, name, email, buildings, limits_unlimited, limits_custom, admin }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        email = try c.decode(String.self, forKey: .email)
        // Postgres COUNT kommt als Text.
        if let n = try? c.decode(Int.self, forKey: .buildings) { buildings = n } else { buildings = Int((try? c.decode(String.self, forKey: .buildings)) ?? "") ?? 0 }
        limits_unlimited = try c.decodeIfPresent(Bool.self, forKey: .limits_unlimited)
        limits_custom = try c.decodeIfPresent(Bool.self, forKey: .limits_custom)
        admin = try c.decodeIfPresent(Bool.self, forKey: .admin)
    }
}
private struct AdminUserPage: Decodable { let total: Int; let users: [AdminUser] }

struct AccountLimitItem: Decodable, Identifiable {
    let key: String
    let label: String
    let `default`: Int
    let overridden: Bool
    let override: Int?
    let effective: Int?
    var id: String { key }
}
struct AccountLimitSet: Decodable {
    let user_id: Int
    let unlimited: Bool
    let revision: Int
    let limits: [AccountLimitItem]
}

extension AccountModel {
    /// Fragt den Server, ob das angemeldete Konto Projektadmin ist. Fehler gelten als „nein“.
    func isProjectAdmin() async -> Bool {
        guard user != nil else { return false }
        return ((try? await request("admin/me") as AdminMe)?.admin) ?? false
    }
}

/// Eintrag im Profil, nur für Admins eingeblendet.
struct AdminEntrySection: View {
    @ObservedObject var account: AccountModel
    var body: some View {
        Section("Projektadministration") {
            NavigationLink { AdminUsersView(account: account) } label: { Label("Personen und Limits", systemImage: "person.badge.shield.checkmark") }
        }
    }
}

struct AdminUsersView: View {
    @ObservedObject var account: AccountModel
    @State private var users: [AdminUser] = []
    @State private var total = 0
    @State private var search = ""
    @State private var problem: String?
    @State private var loading = false
    private var shown: [AdminUser] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? users : users.filter { $0.name.lowercased().contains(q) || $0.email.lowercased().contains(q) }
    }
    var body: some View {
        List {
            if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.secondary) } }
            Section {
                ForEach(shown) { user in
                    NavigationLink { AdminLimitsView(account: account, user: user) { Task { await load() } } } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Text(user.name).font(.headline)
                                if user.admin == true { tag("Admin", .blue) }
                                if user.limits_unlimited == true { tag("Unbegrenzt", .green) }
                                else if user.limits_custom == true { tag("Eigene Limits", .orange) }
                            }
                            Text(user.email).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                        }
                    }
                }
            } footer: {
                if !users.isEmpty { Text(users.count < total ? "\(users.count) von \(total) Konten geladen" : "\(total) Konten") }
            }
            if users.count < total { Button("Weitere laden") { Task { await load(more: true) } }.disabled(loading) }
            if loading { ProgressView() }
        }
        .searchable(text: $search, prompt: "Name oder E-Mail")
        .navigationTitle("Personen und Limits").navigationBarTitleDisplayMode(.inline)
        .task { if users.isEmpty { await load() } }
        .refreshable { await load() }
    }
    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text).font(.caption2.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 2).background(color.opacity(0.15), in: Capsule()).foregroundStyle(color)
    }
    @MainActor private func load(more: Bool = false) async {
        guard !loading else { return }
        loading = true; problem = nil; defer { loading = false }
        do {
            let page: AdminUserPage = try await account.request("admin/users?limit=100&offset=\(more ? users.count : 0)")
            total = page.total
            users = more ? users + page.users.filter { u in !users.contains { $0.id == u.id } } : page.users
        } catch { problem = error.localizedDescription }
    }
}

private enum LimitMode: String, CaseIterable, Identifiable { case standard = "Standard", custom = "Eigener Wert", unlimited = "Unbegrenzt"; var id: String { rawValue } }
private struct LimitDraft { var mode: LimitMode; var value: Int }

struct AdminLimitsView: View {
    @ObservedObject var account: AccountModel
    let user: AdminUser
    var onSaved: () -> Void = {}
    @State private var set: AccountLimitSet?
    @State private var unlimited = false
    @State private var drafts: [String: LimitDraft] = [:]
    @State private var problem: String?
    @State private var saving = false
    @State private var saved = false
    var body: some View {
        Form {
            Section {
                LabeledContent("Name", value: user.name)
                LabeledContent("E-Mail", value: user.email)
            }
            if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.red) } }
            if let set {
                Section {
                    Toggle("Unbegrenzt", isOn: $unlimited)
                } footer: {
                    Text("Hebt alle Kontolimits und die gemeinsamen Projekt-Tageskontingente für diese Person auf. Schutz vor gleichzeitiger Überlastung, Dateigrößen pro Upload und Anbieter-Limits (z. B. Gemini) bleiben bestehen.")
                }
                Section("Einzelne Limits") {
                    ForEach(set.limits) { item in row(item) }
                }.disabled(unlimited)
                Section {
                    Button { Task { await save() } } label: { HStack { Spacer(); if saving { ProgressView() } else { Text("Speichern").bold() }; Spacer() } }.disabled(saving)
                    if saved { Label("Gespeichert, gilt sofort", systemImage: "checkmark.circle").foregroundStyle(.green) }
                    Button("Alles auf Standard zurücksetzen", role: .destructive) {
                        unlimited = false
                        for item in set.limits { drafts[item.key] = LimitDraft(mode: .standard, value: item.default) }
                    }.disabled(saving)
                }
            } else if problem == nil {
                ProgressView("Limits werden geladen …")
            }
        }
        .navigationTitle("Limits").navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: unlimited) { _, _ in saved = false }
    }
    @ViewBuilder private func row(_ item: AccountLimitItem) -> some View {
        let draft = Binding(get: { drafts[item.key] ?? LimitDraft(mode: .standard, value: item.default) }, set: { drafts[item.key] = $0; saved = false })
        VStack(alignment: .leading, spacing: 8) {
            Text(item.label)
            Picker(item.label, selection: draft.mode) { ForEach(LimitMode.allCases) { Text($0.rawValue).tag($0) } }
                .pickerStyle(.segmented).labelsHidden()
            switch draft.wrappedValue.mode {
            case .standard: Text("Standard: \(item.default)").font(.caption).foregroundStyle(.secondary)
            case .unlimited: Text("Kein Limit").font(.caption).foregroundStyle(.secondary)
            case .custom:
                HStack {
                    TextField("Wert", value: draft.value, format: .number).keyboardType(.numberPad).textFieldStyle(.roundedBorder).frame(maxWidth: 120)
                    Stepper("", value: draft.value, in: 0...1_000_000).labelsHidden()
                    Text("Standard \(item.default)").font(.caption).foregroundStyle(.secondary)
                }
            }
        }.padding(.vertical, 4)
    }
    @MainActor private func load() async {
        problem = nil
        do {
            let result: AccountLimitSet = try await account.request("admin/users/\(user.id)/limits")
            apply(result)
        } catch { problem = error.localizedDescription }
    }
    private func apply(_ result: AccountLimitSet) {
        set = result; unlimited = result.unlimited
        drafts = Dictionary(uniqueKeysWithValues: result.limits.map { item in
            (item.key, !item.overridden ? LimitDraft(mode: .standard, value: item.default)
                : item.override == nil ? LimitDraft(mode: .unlimited, value: item.default)
                : LimitDraft(mode: .custom, value: item.override ?? item.default))
        })
    }
    @MainActor private func save() async {
        guard let set else { return }
        saving = true; problem = nil; saved = false; defer { saving = false }
        var limits: [String: Any] = [:]
        for item in set.limits {
            guard let d = drafts[item.key] else { continue }
            switch d.mode {
            case .standard: break
            case .unlimited: limits[item.key] = NSNull()
            case .custom: limits[item.key] = min(max(d.value, 0), 1_000_000)
            }
        }
        do {
            let result: AccountLimitSet = try await account.request("admin/users/\(user.id)/limits", method: "PUT", body: ["unlimited": unlimited, "limits": limits, "revision": set.revision])
            apply(result); saved = true; onSaved()
        } catch { problem = error.localizedDescription; if (error as? APIError)?.status == 409 { await load() } }
    }
}
