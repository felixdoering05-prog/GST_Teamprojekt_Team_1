import SwiftUI
import UserNotifications

// Wartung und Lebenszyklus: wiederkehrende Prüfungen je Gebäude mit Fälligkeit, Garantie und Erinnerung auf dem iPhone.
struct MaintenanceItem: Decodable, Identifiable, Equatable {
    let id: Int; let title: String; let category: String; let interval_months: Int?
    let last_done: String?; let next_due: String?; let warranty_until: String?; let notes: String
    let revision: Int; let status: String; let can_edit: Bool
}
struct MaintenanceList: Decodable { struct Summary: Decodable { let overdue: Int; let soon: Int; let total: Int }; let items: [MaintenanceItem]; let summary: Summary }
struct MaintenanceTemplate: Decodable, Identifiable { var id: String { title }; let title: String; let category: String; let interval_months: Int; let notes: String }
private struct MaintenanceTemplates: Decodable { let templates: [MaintenanceTemplate] }

enum MaintenanceCategory {
    static let all: [(String, String, String)] = [
        ("heizung", "Heizung", "flame"), ("lueftung", "Lüftung", "wind"), ("wasser", "Wasser", "drop"), ("elektro", "Elektro", "bolt"),
        ("dach", "Dach", "house"), ("fenster", "Fenster", "window.vertical.closed"), ("brandschutz", "Brandschutz", "smoke"),
        ("aufzug", "Aufzug", "arrow.up.arrow.down.square"), ("garten", "Außenanlage", "leaf"), ("sonstiges", "Sonstiges", "wrench.and.screwdriver"),
    ]
    static func label(_ key: String) -> String { all.first { $0.0 == key }?.1 ?? "Sonstiges" }
    static func symbol(_ key: String) -> String { all.first { $0.0 == key }?.2 ?? "wrench.and.screwdriver" }
}

private let isoDay: DateFormatter = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = .current; f.dateFormat = "yyyy-MM-dd"; return f }()
private func parseDay(_ s: String?) -> Date? { s.flatMap { isoDay.date(from: $0) } }
private func showDay(_ s: String?) -> String { parseDay(s)?.formatted(date: .abbreviated, time: .omitted) ?? "–" }

/// Lokale Erinnerungen um 9 Uhr am Fälligkeitstag; kein Server-Push nötig.
enum MaintenanceReminders {
    static let key = "maintenance.reminders"
    static var enabled: Bool { UserDefaults.standard.bool(forKey: key) }
    static func enable() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        UserDefaults.standard.set(granted, forKey: key); return granted
    }
    static func disable(building: Int) async { UserDefaults.standard.set(false, forKey: key); await clear(building: building) }
    static func clear(building: Int) async {
        let center = UNUserNotificationCenter.current(), prefix = "maint-\(building)-"
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }
    static func schedule(_ items: [MaintenanceItem], building: Building) async {
        guard enabled else { return }
        await clear(building: building.id)
        let center = UNUserNotificationCenter.current(), today = Calendar.current.startOfDay(for: .now)
        for item in items.prefix(40) {
            guard let due = parseDay(item.next_due), due >= today else { continue }
            let content = UNMutableNotificationContent()
            content.title = "Wartung fällig: \(item.title)"; content.body = "\(building.name) · \(MaintenanceCategory.label(item.category))"; content.sound = .default
            var parts = Calendar.current.dateComponents([.year, .month, .day], from: due); parts.hour = 9
            try? await center.add(UNNotificationRequest(identifier: "maint-\(building.id)-\(item.id)", content: content, trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)))
        }
    }
}

struct BuildingMaintenanceView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var list: MaintenanceList?
    @State private var problem: String?
    @State private var editing: MaintenanceItem?
    @State private var adding = false
    @State private var busy: Int?
    @State private var reminders = MaintenanceReminders.enabled
    var body: some View {
        List {
            if let list {
                Section { header(list.summary) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                group("Überfällig", list.items.filter { $0.status == "ueberfaellig" }, tint: .red)
                group("In den nächsten 4 Wochen", list.items.filter { $0.status == "bald" }, tint: .orange)
                group("Geplant", list.items.filter { $0.status == "ok" }, tint: .green)
                group("Ohne Termin", list.items.filter { $0.status == "ohne_termin" }, tint: .gray)
                if list.items.isEmpty {
                    ContentUnavailableView { Label("Noch kein Wartungsplan", systemImage: "wrench.and.screwdriver") } description: {
                        Text("Lege Heizungswartung, Rauchmelder, Dachrinne & Co. an. Nala erinnert dich, wenn etwas fällig wird.")
                    } actions: { Button("Ersten Eintrag anlegen") { adding = true }.buttonStyle(.borderedProminent) }
                }
            } else if problem == nil { ProgressView().frame(maxWidth: .infinity) }
            if let problem { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
        }
        .navigationTitle("Wartung")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Wartung hinzufügen") }
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await toggleReminders() } } label: { Image(systemName: reminders ? "bell.badge.fill" : "bell.slash") }
                    .accessibilityLabel(reminders ? "Erinnerungen aus" : "Erinnerungen an")
            }
        }
        .refreshable { await load() }
        .task(id: building.id) { await load() }
        .sheet(isPresented: $adding) { MaintenanceEditor(account: account, building: building, item: nil) { await load() } }
        .sheet(item: $editing) { item in MaintenanceEditor(account: account, building: building, item: item) { await load() } }
    }
    private func header(_ s: MaintenanceList.Summary) -> some View {
        HStack(spacing: 12) {
            stat("\(s.overdue)", "überfällig", s.overdue > 0 ? .red : .secondary)
            stat("\(s.soon)", "bald fällig", s.soon > 0 ? .orange : .secondary)
            stat("\(s.total)", "Einträge", .secondary)
        }.padding(.vertical, 6)
    }
    private func stat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) { Text(value).font(.title2.bold()).foregroundStyle(color); Text(label).font(.caption).foregroundStyle(.secondary) }
            .frame(maxWidth: .infinity).padding(.vertical, 12).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    @ViewBuilder private func group(_ title: String, _ items: [MaintenanceItem], tint: Color) -> some View {
        if !items.isEmpty {
            Section(title) { ForEach(items) { row($0, tint: tint) } }
        }
    }
    private func row(_ item: MaintenanceItem, tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: MaintenanceCategory.symbol(item.category)).font(.body.weight(.semibold)).foregroundStyle(tint).frame(width: 36, height: 36).background(tint.opacity(0.14), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title).font(.body.weight(.semibold))
                Text(detail(item)).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 0)
            if busy == item.id { ProgressView() }
            else if item.interval_months != nil || item.next_due != nil {
                Button { Task { await markDone(item) } } label: { Image(systemName: "checkmark.circle").font(.title3) }
                    .buttonStyle(.borderless).accessibilityLabel("\(item.title) als erledigt markieren")
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { if item.can_edit { editing = item } }
        .swipeActions(edge: .trailing) {
            if item.can_edit { Button("Löschen", role: .destructive) { Task { await delete(item) } } }
            Button("Erledigt") { Task { await markDone(item) } }.tint(.green)
        }
    }
    private func detail(_ item: MaintenanceItem) -> String {
        var parts: [String] = []
        if item.next_due != nil { parts.append("Fällig \(showDay(item.next_due))") }
        if let m = item.interval_months { parts.append(m % 12 == 0 ? (m == 12 ? "jährlich" : "alle \(m / 12) Jahre") : "alle \(m) Monate") }
        if item.last_done != nil { parts.append("zuletzt \(showDay(item.last_done))") }
        if let w = item.warranty_until { parts.append((parseDay(w) ?? .distantPast) < .now ? "Garantie abgelaufen" : "Garantie bis \(showDay(w))") }
        return parts.joined(separator: " · ")
    }
    private func load() async {
        do { let value: MaintenanceList = try await account.request("buildings/\(building.id)/maintenance"); list = value; problem = nil; await MaintenanceReminders.schedule(value.items, building: building) }
        catch { problem = error.localizedDescription }
    }
    private func markDone(_ item: MaintenanceItem) async {
        busy = item.id; defer { busy = nil }
        do { let _: MaintenanceItem = try await account.request("maintenance/\(item.id)/done", method: "POST", body: ["revision": item.revision]); await load() }
        catch { problem = error.localizedDescription }
    }
    private func delete(_ item: MaintenanceItem) async {
        struct OK: Decodable { let ok: Bool }
        do { let _: OK = try await account.request("maintenance/\(item.id)", method: "DELETE"); await load() } catch { problem = error.localizedDescription }
    }
    private func toggleReminders() async {
        if reminders { await MaintenanceReminders.disable(building: building.id); reminders = false }
        else { reminders = await MaintenanceReminders.enable(); if reminders, let list { await MaintenanceReminders.schedule(list.items, building: building) } else if !reminders { problem = "Mitteilungen sind für Nala nicht erlaubt. Bitte in den iPhone-Einstellungen freigeben." } }
    }
}

struct MaintenanceEditor: View {
    @ObservedObject var account: AccountModel
    let building: Building
    let item: MaintenanceItem?
    let saved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var category = "sonstiges"
    @State private var interval = 12
    @State private var repeats = true
    @State private var hasLast = false
    @State private var last = Date()
    @State private var hasDue = false
    @State private var due = Date()
    @State private var hasWarranty = false
    @State private var warranty = Date()
    @State private var notes = ""
    @State private var templates: [MaintenanceTemplate] = []
    @State private var saving = false
    @State private var problem: String?
    var body: some View {
        NavigationStack {
            Form {
                if item == nil && !templates.isEmpty {
                    Section("Vorlagen") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) { ForEach(templates) { t in Button { apply(t) } label: { Label(t.title, systemImage: MaintenanceCategory.symbol(t.category)).font(.footnote.weight(.semibold)) }.buttonStyle(.bordered) } }
                        }
                    }
                }
                Section("Was") {
                    TextField("z. B. Heizungswartung", text: $title)
                    Picker("Bereich", selection: $category) { ForEach(MaintenanceCategory.all, id: \.0) { Label($0.1, systemImage: $0.2).tag($0.0) } }
                }
                Section("Wann") {
                    Toggle("Wiederkehrend", isOn: $repeats)
                    if repeats { Stepper(interval % 12 == 0 ? (interval == 12 ? "Jährlich" : "Alle \(interval / 12) Jahre") : "Alle \(interval) Monate", value: $interval, in: 1...240) }
                    Toggle("Zuletzt erledigt", isOn: $hasLast)
                    if hasLast { DatePicker("Am", selection: $last, in: ...Date.now, displayedComponents: .date) }
                    Toggle(repeats && hasLast ? "Fälligkeit selbst festlegen" : "Nächste Fälligkeit", isOn: $hasDue)
                    if hasDue { DatePicker("Fällig am", selection: $due, displayedComponents: .date) }
                }
                Section("Garantie & Notizen") {
                    Toggle("Garantie", isOn: $hasWarranty)
                    if hasWarranty { DatePicker("Bis", selection: $warranty, displayedComponents: .date) }
                    TextField("Notiz, z. B. Firma und Telefonnummer", text: $notes, axis: .vertical).lineLimit(2...5)
                }
                if let problem { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
            }
            .navigationTitle(item == nil ? "Neue Wartung" : "Wartung bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Sichern") { Task { await save() } }.disabled(saving || title.trimmingCharacters(in: .whitespaces).isEmpty) }
            }
            .task { load() }
        }
    }
    private func load() {
        if let item {
            title = item.title; category = item.category; notes = item.notes
            repeats = item.interval_months != nil; interval = item.interval_months ?? 12
            if let d = parseDay(item.last_done) { hasLast = true; last = d }
            if let d = parseDay(item.next_due) { hasDue = true; due = d }
            if let d = parseDay(item.warranty_until) { hasWarranty = true; warranty = d }
        } else {
            Task { if let t: MaintenanceTemplates = try? await account.request("maintenance/templates") { templates = t.templates } }
        }
    }
    private func apply(_ t: MaintenanceTemplate) { title = t.title; category = t.category; interval = t.interval_months; repeats = true; notes = t.notes }
    private func save() async {
        saving = true; defer { saving = false }
        var body: [String: Any] = ["title": title.trimmingCharacters(in: .whitespaces), "category": category, "notes": notes,
                                   "interval_months": repeats ? interval : NSNull(), "last_done": hasLast ? isoDay.string(from: last) : NSNull(),
                                   "warranty_until": hasWarranty ? isoDay.string(from: warranty) : NSNull()]
        if hasDue { body["next_due"] = isoDay.string(from: due) }
        else if repeats && hasLast, let next = Calendar.current.date(byAdding: .month, value: interval, to: last) { body["next_due"] = isoDay.string(from: next) }
        else { body["next_due"] = NSNull() }
        do {
            if let item { body["revision"] = item.revision; let _: MaintenanceItem = try await account.request("maintenance/\(item.id)", method: "PATCH", body: body) }
            else { let _: MaintenanceItem = try await account.request("buildings/\(building.id)/maintenance", method: "POST", body: body) }
            await saved(); dismiss()
        } catch { problem = error.localizedDescription }
    }
}
