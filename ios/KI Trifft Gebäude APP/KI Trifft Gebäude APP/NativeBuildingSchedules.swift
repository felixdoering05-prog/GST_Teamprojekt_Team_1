import SwiftUI
import UserNotifications

// Kalender wie im Web (#239, #242, #244, #269): Monatsansicht, Termine, Aufgaben und
// wiederkehrende Wartungen mit Erinnerungstagen, optional mit Raum oder Sensor.
// Mehrere Gebäude (Gebäudeauswahl) werden zu einem Kalender zusammengeführt.

/// Ein Kalendereintrag an einem bestimmten Tag (wiederkehrende Einträge erscheinen mehrfach).
private struct ScheduleOccurrence: Identifiable {
    let item: NativeSchedule
    let building: Building
    let date: Date
    var id: String { "\(building.id)-\(item.id)-\(date.timeIntervalSince1970)" }
}

private enum ScheduleKind {
    static let all: [(key: String, symbol: String)] = [("appointment", "calendar"), ("task", "checklist"), ("maintenance", "wrench.and.screwdriver")]
    static func label(_ key: String?) -> String {
        switch key { case "task": tr("Aufgabe"); case "maintenance": tr("Wartung"); default: tr("Termin") }
    }
    static func symbol(_ key: String?) -> String { all.first { $0.key == key }?.symbol ?? "calendar" }
}

/// Gebäudekalender. Mit einem Gebäude wie bisher, mit mehreren als gemeinsamer Kalender.
struct NativeBuildingSchedules: View {
    let buildings: [Building]
    @ObservedObject var account: AccountModel
    @State private var lists: [Int: NativeScheduleList] = [:]
    @State private var problem: String?
    @State private var loading = true
    @State private var month = Calendar.current.dateInterval(of: .month, for: .now)!.start
    @State private var day = Calendar.current.startOfDay(for: .now)
    @State private var creating = false
    @State private var editing: (NativeSchedule, Building)?
    @State private var removal: (NativeSchedule, Building)?
    @State private var busy = false
    private let calendar = Calendar.current

    init(building: Building, account: AccountModel) { self.buildings = [building]; self.account = account }
    init(buildings: [Building], account: AccountModel) { self.buildings = buildings; self.account = account }

    private var editable: [Building] { buildings.filter { lists[$0.id]?.can_edit == true } }

    /// Alle Vorkommen im angezeigten Monat (Wiederholungen nach `interval_days`).
    private func occurrences(in interval: DateInterval) -> [ScheduleOccurrence] {
        var result: [ScheduleOccurrence] = []
        for building in buildings {
            for item in lists[building.id]?.items ?? [] {
                guard let start = nativeTeamDate(item.starts_at) else { continue }
                guard let step = item.interval_days, step > 0 else {
                    if interval.contains(start) { result.append(.init(item: item, building: building, date: start)) }
                    continue
                }
                var date = start
                if date < interval.start {
                    let days = calendar.dateComponents([.day], from: date, to: interval.start).day ?? 0
                    date = calendar.date(byAdding: .day, value: (days / step) * step, to: date) ?? date
                }
                var guardCount = 0
                while date < interval.end && guardCount < 400 {
                    if date >= interval.start { result.append(.init(item: item, building: building, date: date)) }
                    date = calendar.date(byAdding: .day, value: step, to: date) ?? interval.end
                    guardCount += 1
                }
            }
        }
        return result.sorted { $0.date < $1.date }
    }
    private var monthInterval: DateInterval { calendar.dateInterval(of: .month, for: month)! }

    var body: some View {
        let monthly = occurrences(in: monthInterval)
        let busyDays = Set(monthly.map { calendar.startOfDay(for: $0.date) })
        let today = monthly.filter { calendar.isDate($0.date, inSameDayAs: day) }
        List {
            Section {
                if buildings.count == 1, let building = buildings.first { Label(building.name, systemImage: "building.2") }
                else { Label(tr("\(buildings.count) Gebäude in der Auswahl"), systemImage: "building.2") }
                monthGrid(busyDays: busyDays)
            } footer: { Text("Gemeinsame Termine und Fristen im Gebäude.") }
            if let problem { Section { TeamProblem(message: problem); Button("Neu laden") { Task { await load() } } } }
            if loading && lists.isEmpty { Section { ProgressView() } }
            Section(day.formatted(date: .complete, time: .omitted)) {
                if today.isEmpty {
                    Text(editable.isEmpty ? "Hier erscheinen freigegebene Gebäudetermine." : "An diesem Tag ist nichts eingetragen.").foregroundStyle(.secondary)
                }
                ForEach(today) { row($0) }
            }
            let upcoming = occurrences(in: DateInterval(start: calendar.startOfDay(for: .now), duration: 60 * 86400)).prefix(8)
            if !upcoming.isEmpty {
                Section("Demnächst") { ForEach(Array(upcoming)) { row($0, showDate: true) } }
            }
        }
        .navigationTitle("Kalender").navigationBarTitleDisplayMode(.inline)
        .toolbar { if !editable.isEmpty { Button("Eintrag anlegen", systemImage: "plus") { creating = true }.disabled(busy) } }
        .task { await load() }.refreshable { await load() }
        .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) {
            NativeScheduleEditor(buildings: editable, item: nil, lists: lists, day: day, account: account)
        }
        .sheet(isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } }), onDismiss: { Task { await load() } }) {
            if let editing { NativeScheduleEditor(buildings: [editing.1], item: editing.0, lists: lists, day: day, account: account) }
        }
        .confirmationDialog("Eintrag löschen?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) {
            Button("Eintrag löschen", role: .destructive) { if let removal { Task { await remove(removal.0, building: removal.1) } } }
        } message: { if removal?.0.interval_days != nil { Text("Alle Wiederholungen dieses Eintrags werden entfernt.") } }
    }

    private func monthGrid(busyDays: Set<Date>) -> some View {
        let start = monthInterval.start
        let firstWeekday = (calendar.component(.weekday, from: start) + 5) % 7 // Montag = 0
        let days = calendar.range(of: .day, in: .month, for: start)!.count
        let cells: [Date?] = Array(repeating: nil, count: firstWeekday) + (0..<days).map { calendar.date(byAdding: .day, value: $0, to: start) }
        let symbols = { var s = calendar.veryShortWeekdaySymbols; s.append(s.removeFirst()); return s }()
        return VStack(spacing: 10) {
            HStack {
                Button { month = calendar.date(byAdding: .month, value: -1, to: month)! } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Vorheriger Monat")
                Spacer()
                Text(start.formatted(.dateTime.month(.wide).year())).font(.headline)
                Spacer()
                Button { month = calendar.date(byAdding: .month, value: 1, to: month)! } label: { Image(systemName: "chevron.right") }.accessibilityLabel("Nächster Monat")
            }.buttonStyle(.borderless)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
                ForEach(symbols.indices, id: \.self) { Text(symbols[$0]).font(.caption2.weight(.semibold)).foregroundStyle(.secondary) }
                ForEach(cells.indices, id: \.self) { index in
                    if let date = cells[index] {
                        let selected = calendar.isDate(date, inSameDayAs: day)
                        let isToday = calendar.isDateInToday(date)
                        Button { day = date } label: {
                            VStack(spacing: 2) {
                                Text("\(calendar.component(.day, from: date))").font(.callout.weight(selected || isToday ? .bold : .regular)).monospacedDigit()
                                Circle().fill(busyDays.contains(date) ? (selected ? Color.white : d21Accent) : .clear).frame(width: 5, height: 5)
                            }
                            .frame(maxWidth: .infinity, minHeight: 38)
                            .foregroundStyle(selected ? Color.white : isToday ? d21Accent : .primary)
                            .background(selected ? d21Accent : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                        }.buttonStyle(.borderless)
                        .accessibilityLabel(date.formatted(date: .complete, time: .omitted) + (busyDays.contains(date) ? ", " + tr("mit Einträgen") : ""))
                    } else { Color.clear.frame(minHeight: 38) }
                }
            }
        }.padding(.vertical, 6)
    }

    private func row(_ occurrence: ScheduleOccurrence, showDate: Bool = false) -> some View {
        let item = occurrence.item
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Image(systemName: ScheduleKind.symbol(item.kind)).foregroundStyle(item.priority == "high" ? .red : d21Accent)
                Text(item.title).font(.headline)
                Spacer()
                Text(ScheduleKind.label(item.kind)).font(.caption).foregroundStyle(.secondary)
            }
            Label(showDate ? occurrence.date.formatted(date: .abbreviated, time: .shortened) : occurrence.date.formatted(date: .omitted, time: .shortened), systemImage: "clock").font(.subheadline).foregroundStyle(d21Accent)
            if buildings.count > 1 { Label(occurrence.building.name, systemImage: "building.2").font(.caption).foregroundStyle(.secondary) }
            if let step = item.interval_days { Label(intervalText(step), systemImage: "repeat").font(.caption).foregroundStyle(.secondary) }
            if let reminder = item.reminder_days { Label(tr("Erinnerung \(reminder) Tage vorher"), systemImage: "bell").font(.caption).foregroundStyle(.secondary) }
            if let room = item.room_name { Label(room, systemImage: "door.left.hand.open").font(.caption).foregroundStyle(.secondary) }
            if let sensor = item.sensor_name { Label(sensor, systemImage: "sensor").font(.caption).foregroundStyle(.secondary) }
            if !item.details.isEmpty { Text(item.details).font(.subheadline) }
            if let author = item.created_by_name { Text("Erstellt von \(author)").font(.caption).foregroundStyle(.secondary) }
            if lists[occurrence.building.id]?.can_edit == true {
                HStack {
                    Button("Bearbeiten", systemImage: "pencil") { editing = (item, occurrence.building) }
                    Spacer()
                    Button("Löschen", systemImage: "trash", role: .destructive) { removal = (item, occurrence.building) }
                }.font(.caption).buttonStyle(.borderless).disabled(busy)
            }
        }.padding(.vertical, 6)
    }
    private func intervalText(_ days: Int) -> String {
        switch days {
        case 7: tr("Wöchentlich")
        case 30, 31: tr("Monatlich")
        case 90, 91, 92: tr("Vierteljährlich")
        case 182, 183: tr("Halbjährlich")
        case 365: tr("Jährlich")
        default: tr("Alle \(days) Tage")
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        var next: [Int: NativeScheduleList] = [:], failures: [String] = []
        for building in buildings {
            do { next[building.id] = try await account.request("buildings/\(building.id)/schedules") }
            catch {
                // Gebäude ohne Kalenderrecht fehlen im gemeinsamen Kalender einfach.
                if (error as? APIError)?.status != 403 || buildings.count == 1 { failures.append(error.localizedDescription) }
            }
        }
        lists = next
        problem = failures.first
        await ScheduleReminders.schedule(lists: next, buildings: buildings)
    }
    private func remove(_ item: NativeSchedule, building: Building) async {
        guard !busy else { return }; busy = true; defer { busy = false }; removal = nil
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/schedules/\(item.id)", method: "DELETE"); await load() }
        catch { await load(); problem = error.localizedDescription }
    }
}

/// Lokale Erinnerungen um 9 Uhr, `reminder_days` vor dem nächsten Termin.
/// Nutzt dieselbe Freigabe wie die Wartungserinnerungen; ohne Freigabe passiert nichts.
enum ScheduleReminders {
    static func schedule(lists: [Int: NativeScheduleList], buildings: [Building]) async {
        guard MaintenanceReminders.enabled else { return }
        let center = UNUserNotificationCenter.current(), calendar = Calendar.current, now = Date()
        for building in buildings {
            guard let list = lists[building.id] else { continue }
            let prefix = "sched-\(building.id)-"
            let old = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
            center.removePendingNotificationRequests(withIdentifiers: old)
            for item in list.items.prefix(40) {
                guard let reminder = item.reminder_days, var date = nativeTeamDate(item.starts_at) else { continue }
                if let step = item.interval_days, step > 0 {
                    while date < now { date = calendar.date(byAdding: .day, value: step, to: date) ?? now.addingTimeInterval(1) }
                }
                guard date > now, let fire = calendar.date(byAdding: .day, value: -reminder, to: calendar.startOfDay(for: date)), fire > now else { continue }
                let content = UNMutableNotificationContent()
                content.title = tr("Bald fällig: \(item.title)")
                content.body = "\(building.name) · \(date.formatted(date: .abbreviated, time: .shortened))"
                content.sound = .default
                var parts = calendar.dateComponents([.year, .month, .day], from: fire); parts.hour = 9
                try? await center.add(UNNotificationRequest(identifier: prefix + String(item.id), content: content, trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)))
            }
        }
    }
}

struct NativeScheduleEditor: View {
    let buildings: [Building]
    let item: NativeSchedule?
    let lists: [Int: NativeScheduleList]
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var buildingID: Int
    @State private var kind: String
    @State private var priority: String
    @State private var title: String
    @State private var details: String
    @State private var starts: Date
    @State private var ends: Date
    @State private var hasEnd: Bool
    @State private var repeats: Bool
    @State private var interval: Int
    @State private var remind: Bool
    @State private var reminder: Int
    @State private var roomID: String?
    @State private var sensorID: String?
    @State private var problem: String?
    @State private var busy = false
    init(buildings: [Building], item: NativeSchedule?, lists: [Int: NativeScheduleList], day: Date, account: AccountModel) {
        self.buildings = buildings; self.item = item; self.lists = lists; self.account = account
        let morning = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: day) ?? day
        let start = item.flatMap { nativeTeamDate($0.starts_at) } ?? morning
        _buildingID = State(initialValue: item?.building_id ?? buildings.first?.id ?? 0)
        _kind = State(initialValue: item?.kind ?? "appointment"); _priority = State(initialValue: item?.priority ?? "normal")
        _title = State(initialValue: item?.title ?? ""); _details = State(initialValue: item?.details ?? "")
        _starts = State(initialValue: start); _ends = State(initialValue: item?.ends_at.flatMap(nativeTeamDate) ?? start.addingTimeInterval(3600)); _hasEnd = State(initialValue: item?.ends_at != nil)
        _repeats = State(initialValue: item?.interval_days != nil); _interval = State(initialValue: item?.interval_days ?? 365)
        _remind = State(initialValue: item?.reminder_days != nil); _reminder = State(initialValue: item?.reminder_days ?? 7)
        _roomID = State(initialValue: item?.room_id); _sensorID = State(initialValue: item?.sensor_id)
    }
    private var list: NativeScheduleList? { lists[buildingID] }
    var body: some View {
        NavigationStack {
            Form {
                if buildings.count > 1 && item == nil {
                    Picker("Gebäude", selection: $buildingID) { ForEach(buildings) { Text($0.name).tag($0.id) } }
                        .onChange(of: buildingID) { _, _ in roomID = nil; sensorID = nil }
                }
                Section("Eintrag") {
                    Picker("Art", selection: $kind) {
                        Text("Termin").tag("appointment"); Text("Aufgabe").tag("task"); Text("Wartung").tag("maintenance")
                    }.pickerStyle(.segmented)
                    TextField(kind == "maintenance" ? "z. B. Heizungswartung" : "Titel", text: $title)
                    TextField("Details", text: $details, axis: .vertical).lineLimit(3...8)
                    Picker("Priorität", selection: $priority) { Text("Niedrig").tag("low"); Text("Normal").tag("normal"); Text("Hoch").tag("high") }
                }
                Section {
                    DatePicker("Beginn", selection: $starts)
                    Toggle("Ende festlegen", isOn: $hasEnd)
                    if hasEnd { DatePicker("Ende", selection: $ends, in: starts...) }
                } footer: { Text("Die Anzeige verwendet die Zeitzone deines iPhones. Gespeichert wird der genaue Zeitpunkt für alle Teammitglieder.") }
                Section {
                    Toggle("Wiederkehrend", isOn: $repeats)
                    if repeats {
                        Picker("Intervall", selection: $interval) {
                            Text("Wöchentlich").tag(7); Text("Monatlich").tag(30); Text("Vierteljährlich").tag(91); Text("Halbjährlich").tag(182); Text("Jährlich").tag(365)
                            if ![7, 30, 91, 182, 365].contains(interval) { Text("Alle \(interval) Tage").tag(interval) }
                        }
                    }
                    Toggle("Erinnerung", isOn: $remind)
                    if remind { Stepper("\(reminder) Tage vorher", value: $reminder, in: 0...60) }
                } header: { Text("Wiederholung & Erinnerung") } footer: {
                    if remind && !MaintenanceReminders.enabled { Text("Erinnerungen erscheinen auf diesem iPhone, sobald unter Wartung die Erinnerungen eingeschaltet sind.") }
                }
                if let list, !(list.rooms ?? []).isEmpty || !(list.sensors ?? []).isEmpty {
                    Section("Bezug (optional)") {
                        if let rooms = list.rooms, !rooms.isEmpty {
                            Picker("Raum", selection: $roomID) { Text("Kein Raum").tag(String?.none); ForEach(rooms) { Text($0.name).tag(Optional($0.id)) } }
                        }
                        if let sensors = list.sensors, !sensors.isEmpty {
                            Picker("Sensor", selection: $sensorID) { Text("Kein Sensor").tag(String?.none); ForEach(sensors) { Text($0.name).tag(Optional($0.id)) } }
                        }
                    }
                }
                if let problem { Section { TeamProblem(message: problem) } }
            }.navigationTitle(item == nil ? "Neuer Eintrag" : "Eintrag bearbeiten").disabled(busy)
                .onChange(of: starts) { _, start in if ends < start { ends = start.addingTimeInterval(3600) } }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button("Speichern") { Task { await save() } }.disabled(busy || buildingID == 0 || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.count > 120 || details.count > 2000 || (hasEnd && ends < starts)) }
                }
        }.interactiveDismissDisabled(busy)
    }
    private func save() async {
        busy = true; defer { busy = false }
        let formatter = ISO8601DateFormatter()
        let body: [String: Any] = [
            "title": title.trimmingCharacters(in: .whitespacesAndNewlines), "details": details,
            "starts_at": formatter.string(from: starts), "ends_at": hasEnd ? formatter.string(from: ends) : NSNull(),
            "kind": kind, "priority": priority,
            "interval_days": repeats ? interval : NSNull(), "reminder_days": remind ? reminder : NSNull(),
            "room_ids": roomID.map { [$0] } ?? [], "sensor_id": sensorID ?? NSNull(),
        ]
        do {
            struct Saved: Decodable { let id: Int }
            let _: Saved = try await account.request("buildings/\(buildingID)/schedules" + (item.map { "/\($0.id)" } ?? ""), method: item == nil ? "POST" : "PATCH", body: body)
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}
