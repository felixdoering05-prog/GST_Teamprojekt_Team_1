import SwiftUI
import UserNotifications

// Wartung und Lebenszyklus: wiederkehrende Prüfungen je Gebäude mit Fälligkeit, Garantie und Erinnerung auf dem iPhone.
struct MaintenanceItem: Decodable, Identifiable, Equatable {
    let id: Int; let title: String; let category: String; let interval_months: Int?
    let last_done: String?; let next_due: String?; let warranty_until: String?; let notes: String
    let revision: Int; let status: String; let can_edit: Bool
    let asset_id: Int?; let priority: String?; let work_status: String?
}
struct MaintenanceList: Decodable { struct Summary: Decodable { let overdue: Int; let soon: Int; let total: Int }; let items: [MaintenanceItem]; let summary: Summary; let can_edit: Bool? }
private struct MaintenanceEvent: Decodable, Identifiable {
    var id: Int { revision }
    let revision: Int; let action: String; let performed_on: String?; let created_at: String; let actor: String?
}
struct MaintenanceTemplate: Decodable, Identifiable { var id: String { title }; let title: String; let category: String; let interval_months: Int; let notes: String }
private struct MaintenanceTemplates: Decodable { let templates: [MaintenanceTemplate] }

struct TechnicalAsset: Decodable, Identifiable {
    let id: Int
    let name: String
    let system: String
    let location: String
    let status: String
    let planned_maintenance: String?
    let next_maintenance: String?
    let data_quality: Int?
    let notes: String
    let revision: Int
}
struct TechnicalAssetList: Decodable { let items: [TechnicalAsset]; let can_edit: Bool }

private enum TechnicalStatus {
    static let labels = [("in_betrieb", "In Betrieb"), ("wartung", "Wartung"), ("stoerung", "Störung")]
    static func label(_ value: String) -> String { labels.first { $0.0 == value }?.1 ?? value }
}

struct BuildingTechnicalAssetsView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var list: TechnicalAssetList?
    @State private var problem: String?
    @State private var search = ""
    @State private var filter = ""
    @State private var adding = false

    var body: some View {
        List {
            if let list {
                Section {
                    Picker("Status", selection: $filter) {
                        Text("Alle Status").tag("")
                        ForEach(TechnicalStatus.labels, id: \.0) { Text($0.1).tag($0.0) }
                    }
                }
                let rows = list.items.filter { row in
                    (filter.isEmpty || row.status == filter) && (search.isEmpty || [row.name, row.system, row.location].joined(separator: " ").localizedCaseInsensitiveContains(search))
                }
                Section("Anlagen") {
                    if rows.isEmpty { Text("Keine Anlagen in dieser Auswahl.").foregroundStyle(.secondary) }
                    ForEach(rows) { asset in
                        NavigationLink {
                            TechnicalAssetDetail(building: building, account: account, initial: asset, canEdit: list.can_edit, saved: load)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(asset.name).font(.headline)
                                Text("\(asset.system) · \(asset.location) · \(TechnicalStatus.label(asset.status))").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } else if problem == nil { ProgressView("Anlagen werden geladen …") }
            if let problem { Text(problem).foregroundStyle(.orange) }
        }
        .navigationTitle("Technische Anlagen").searchable(text: $search, prompt: "Anlagen suchen")
        .refreshable { await load() }.task(id: building.id) { await load() }
        .toolbar {
            if list?.can_edit == true {
                ToolbarItem(placement: .topBarTrailing) { Button("Anlage anlegen", systemImage: "plus") { adding = true } }
            }
        }
        .sheet(isPresented: $adding) { TechnicalAssetEditor(building: building, account: account, asset: nil) { _ in await load() } }
    }

    private func load() async {
        do { list = try await account.request("buildings/\(building.id)/assets"); problem = nil }
        catch { problem = error.localizedDescription }
    }
}

private struct TechnicalAssetDetail: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let canEdit: Bool
    let saved: () async -> Void
    @State private var asset: TechnicalAsset
    @State private var editing = false

    init(building: Building, account: AccountModel, initial: TechnicalAsset, canEdit: Bool, saved: @escaping () async -> Void) {
        self.building = building
        self.account = account
        self.canEdit = canEdit
        self.saved = saved
        _asset = State(initialValue: initial)
    }

    var body: some View {
        List {
            Section("Anlagendaten") {
                LabeledContent("Gebäude", value: building.name)
                LabeledContent("System", value: asset.system)
                LabeledContent("Standort", value: asset.location)
                LabeledContent("Status", value: TechnicalStatus.label(asset.status))
                LabeledContent("Nächste Wartung", value: showDay(asset.next_maintenance ?? asset.planned_maintenance))
                if let quality = asset.data_quality { LabeledContent("Datenqualität", value: "\(quality) %") }
                if !asset.notes.isEmpty { Text(asset.notes) }
            }
            Section {
                NavigationLink("Zugehörige Wartungen") {
                    BuildingMaintenanceView(building: building, account: account, selectedAssetID: asset.id)
                }
            }
        }
        .navigationTitle(asset.name)
        .toolbar { if canEdit { ToolbarItem(placement: .topBarTrailing) { Button("Bearbeiten") { editing = true } } } }
        .sheet(isPresented: $editing) {
            TechnicalAssetEditor(building: building, account: account, asset: asset) { row in
                asset = row
                await saved()
            }
        }
    }
}

private struct TechnicalAssetEditor: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let asset: TechnicalAsset?
    let saved: (TechnicalAsset) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var system = ""
    @State private var location = ""
    @State private var status = "in_betrieb"
    @State private var quality = ""
    @State private var notes = ""
    @State private var planned = Date()
    @State private var hasDate = false
    @State private var saving = false
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Anlagenname", text: $name)
                TextField("System", text: $system)
                TextField("Standort", text: $location)
                Picker("Anlagenstatus", selection: $status) { ForEach(TechnicalStatus.labels, id: \.0) { Text($0.1).tag($0.0) } }
                Toggle("Vorgesehene Wartung", isOn: $hasDate)
                if hasDate { DatePicker("Termin", selection: $planned, displayedComponents: .date) }
                TextField("Datenqualität in %", text: $quality).keyboardType(.numberPad)
                TextField("Notizen", text: $notes, axis: .vertical)
                if let problem { Text(problem).foregroundStyle(.orange) }
            }
            .navigationTitle(asset == nil ? "Anlage anlegen" : "Anlage bearbeiten")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button("Speichern") { Task { await save() } }.disabled(saving || [name, system, location].contains(where: { $0.trimmingCharacters(in: .whitespaces).isEmpty })) }
            }
            .onAppear {
                guard let asset else { return }
                name = asset.name; system = asset.system; location = asset.location; status = asset.status; notes = asset.notes
                quality = asset.data_quality.map(String.init) ?? ""
                if let value = parseDay(asset.planned_maintenance) { planned = value; hasDate = true }
            }
        }
    }

    private func save() async {
        saving = true; defer { saving = false }
        if !quality.isEmpty && Int(quality) == nil { problem = "Datenqualität als ganze Zahl eingeben."; return }
        var body: [String: Any] = ["name": name, "system": system, "location": location, "status": status, "notes": notes,
                                   "planned_maintenance": hasDate ? isoDay.string(from: planned) : NSNull(),
                                   "data_quality": Int(quality) as Any? ?? NSNull()]
        if let asset { body["revision"] = asset.revision }
        do {
            let suffix = asset.map { "/\($0.id)" } ?? ""
            let row: TechnicalAsset = try await account.request("buildings/\(building.id)/assets\(suffix)", method: asset == nil ? "POST" : "PATCH", body: body)
            await saved(row)
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}

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
    var selectedAssetID: Int? = nil
    @State private var list: MaintenanceList?
    @State private var assets: [TechnicalAsset] = []
    @State private var selectedHistory: MaintenanceItem?
    @State private var problem: String?
    @State private var editing: MaintenanceItem?
    @State private var adding = false
    @State private var busy: Int?
    @State private var reminders = MaintenanceReminders.enabled
    private var canEdit: Bool { list?.can_edit ?? (list != nil && building.is_owner != false) }
    var body: some View {
        List {
            if let list {
                let scoped = list.items.filter { selectedAssetID == nil || $0.asset_id == selectedAssetID }
                let active = scoped.filter { $0.work_status != "completed" }
                let summary = MaintenanceList.Summary(overdue: active.filter { $0.status == "ueberfaellig" }.count,
                    soon: active.filter { $0.status == "bald" }.count, total: scoped.count)
                Section { header(summary) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                group("Überfällig", active.filter { $0.status == "ueberfaellig" }, tint: .red)
                group("In den nächsten 4 Wochen", active.filter { $0.status == "bald" }, tint: .orange)
                group("Geplant", active.filter { $0.status == "ok" }, tint: .green)
                group("Ohne Termin", active.filter { $0.status == "ohne_termin" }, tint: .gray)
                group("Erledigt", scoped.filter { $0.work_status == "completed" }, tint: .green)
                if scoped.isEmpty {
                    ContentUnavailableView { Label("Noch kein Wartungsplan", systemImage: "wrench.and.screwdriver") } description: {
                        Text("Lege Heizungswartung, Rauchmelder, Dachrinne & Co. an. Nala erinnert dich, wenn etwas fällig wird.")
                    } actions: { if canEdit { Button("Ersten Eintrag anlegen") { adding = true }.buttonStyle(.borderedProminent) } }
                }
            } else if problem == nil { ProgressView().frame(maxWidth: .infinity) }
            if let problem { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
        }
        .navigationTitle("Wartungen")
        .toolbar {
            if canEdit { ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Wartung hinzufügen") } }
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await toggleReminders() } } label: { Image(systemName: reminders ? "bell.badge.fill" : "bell.slash") }
                    .accessibilityLabel(reminders ? "Erinnerungen aus" : "Erinnerungen an")
            }
        }
        .refreshable { await load() }
        .task(id: building.id) { await load() }
        .sheet(isPresented: $adding) { MaintenanceEditor(account: account, building: building, item: nil, assets: assets, assetSelection: selectedAssetID) { await load() } }
        .sheet(item: $editing) { item in MaintenanceEditor(account: account, building: building, item: item, assets: assets) { await load() } }
        .sheet(item: $selectedHistory) { item in
            NavigationStack {
                MaintenanceHistoryView(building: building, item: item, account: account)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { selectedHistory = nil } } }
            }
        }
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
            else { Menu {
                Button("Wartungshistorie") { selectedHistory = item }
                if canEdit && item.can_edit { Button("Bearbeiten") { editing = item } }
                if canEdit && (item.work_status == nil || item.work_status == "planned") { Button("Starten") { Task { await change(item, action: "start") } } }
                if canEdit && item.work_status != "completed" { Button("Erledigen") { Task { await change(item, action: "done") } } }
            } label: { Image(systemName: "ellipsis.circle").font(.title3) }.buttonStyle(.borderless) }
        }
        .contentShape(Rectangle())
        .onTapGesture { selectedHistory = item }
        .swipeActions(edge: .trailing) {
            if canEdit && item.can_edit { Button("Löschen", role: .destructive) { Task { await delete(item) } } }
            if canEdit && item.work_status != "completed" { Button("Erledigt") { Task { await change(item, action: "done") } }.tint(.green) }
        }
    }
    private func detail(_ item: MaintenanceItem) -> String {
        var parts: [String] = []
        if let asset = assets.first(where: { $0.id == item.asset_id }) { parts.append(asset.name) }
        if item.work_status == "in_progress" { parts.append("In Bearbeitung") }
        if item.work_status == "completed" { parts.append("Erledigt") }
        if item.next_due != nil { parts.append("Fällig \(showDay(item.next_due))") }
        if let m = item.interval_months { parts.append(m % 12 == 0 ? (m == 12 ? "jährlich" : "alle \(m / 12) Jahre") : "alle \(m) Monate") }
        if item.last_done != nil { parts.append("zuletzt \(showDay(item.last_done))") }
        if let w = item.warranty_until { parts.append((parseDay(w) ?? .distantPast) < .now ? "Garantie abgelaufen" : "Garantie bis \(showDay(w))") }
        return parts.joined(separator: " · ")
    }
    private func load() async {
        do {
            let value: MaintenanceList = try await account.request("buildings/\(building.id)/maintenance")
            let catalog: TechnicalAssetList? = try? await account.request("buildings/\(building.id)/assets")
            list = value; assets = catalog?.items ?? []; problem = nil
            await MaintenanceReminders.schedule(value.items, building: building)
        }
        catch { problem = error.localizedDescription }
    }
    private func change(_ item: MaintenanceItem, action: String) async {
        busy = item.id; defer { busy = nil }
        do { let _: MaintenanceItem = try await account.request("maintenance/\(item.id)/\(action)", method: "POST", body: ["revision": item.revision]); await load() }
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

private struct MaintenanceHistoryView: View {
    let building: Building
    let item: MaintenanceItem
    let account: AccountModel
    @State private var events: [MaintenanceEvent]?
    @State private var problem: String?
    var body: some View {
        List {
            Section { LabeledContent("Aufgabe", value: item.title); LabeledContent("Fällig", value: showDay(item.next_due)) }
            if let events {
                ForEach(events) { row in
                    VStack(alignment: .leading) {
                        Text(row.action == "started" ? "Gestartet" : "Erledigt").font(.headline)
                        Text(showDay(row.performed_on ?? String(row.created_at.prefix(10))) + (row.actor.map { " · " + $0 } ?? "")).font(.caption)
                    }
                }
                if events.isEmpty { Text(item.last_done.map { "Letzte Erledigung " + showDay($0) } ?? "Noch keine Einträge.") }
            } else if let problem { Text(problem).foregroundStyle(.orange) }
            else { ProgressView("Historie wird geladen …") }
        }
        .navigationTitle("Wartungshistorie")
        .task {
            do { events = try await account.request("buildings/\(building.id)/maintenance/\(item.id)/history") }
            catch { problem = error.localizedDescription }
        }
    }
}

struct MaintenanceEditor: View {
    @ObservedObject var account: AccountModel
    let building: Building
    let item: MaintenanceItem?
    var assets: [TechnicalAsset] = []
    var assetSelection: Int? = nil
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
    @State private var assetID: Int?
    @State private var priority = "normal"
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
                    if !assets.isEmpty { Picker("Anlage", selection: $assetID) {
                        Text("Ohne Anlage").tag(nil as Int?)
                        ForEach(assets) { Text($0.name).tag(Optional($0.id)) }
                    } }
                    Picker("Priorität", selection: $priority) { Text("Niedrig").tag("low"); Text("Mittel").tag("normal"); Text("Hoch").tag("high") }
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
        assetID = item?.asset_id ?? assetSelection
        priority = item?.priority ?? "normal"
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
        if !assets.isEmpty { body["asset_id"] = assetID as Any? ?? NSNull() }
        body["priority"] = priority
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
