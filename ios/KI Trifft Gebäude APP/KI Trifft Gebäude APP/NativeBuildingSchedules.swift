import SwiftUI

struct NativeBuildingSchedules: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var list: NativeScheduleList?
    @State private var problem: String?
    @State private var loading = true
    @State private var creating = false
    @State private var editing: NativeSchedule?
    @State private var removal: NativeSchedule?
    @State private var busy = false
    var body: some View {
        List {
            Section { Label(building.name, systemImage: "building.2"); Text("Gemeinsame Termine und Fristen im Gebäude.").font(.footnote).foregroundStyle(.secondary) }
            if let problem { Section { TeamProblem(message: problem); Button("Neu laden") { Task { await load() } } } }
            if loading { Section { ProgressView() } }
            if let list {
                if list.items.isEmpty { ContentUnavailableView("Noch keine Termine", systemImage: "calendar", description: Text(list.can_edit ? "Lege den ersten Termin für dieses Gebäude an." : "Hier erscheinen freigegebene Gebäudetermine.")) }
                ForEach(list.items) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.title).font(.headline)
                        Label(projectDate(item.starts_at), systemImage: "calendar.badge.clock").font(.subheadline).foregroundStyle(d21Accent)
                        if let end = item.ends_at { Text("Bis \(projectDate(end))").font(.caption).foregroundStyle(.secondary) }
                        if !item.details.isEmpty { Text(item.details).font(.subheadline) }
                        if let author = item.created_by_name { Text("Erstellt von \(author)").font(.caption).foregroundStyle(.secondary) }
                        if list.can_edit {
                            HStack { Button("Bearbeiten", systemImage: "pencil") { editing = item }; Spacer(); Button("Löschen", systemImage: "trash", role: .destructive) { removal = item } }.font(.caption).buttonStyle(.borderless).disabled(busy)
                        }
                    }.padding(.vertical, 6)
                }
            }
        }.navigationTitle("Zeitplanung").navigationBarTitleDisplayMode(.inline)
            .toolbar { if list?.can_edit == true { Button("Termin erstellen", systemImage: "plus") { creating = true }.disabled(busy) } }
            .task { await load() }.refreshable { await load() }
            .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) { NativeScheduleEditor(building: building, item: nil, account: account) }
            .sheet(item: $editing, onDismiss: { Task { await load() } }) { NativeScheduleEditor(building: building, item: $0, account: account) }
            .confirmationDialog("Termin löschen?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) { Button("Termin löschen", role: .destructive) { if let removal { Task { await remove(removal) } } } }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do { list = try await account.request("buildings/\(building.id)/schedules"); problem = nil }
        catch { list = nil; problem = error.localizedDescription }
    }
    private func remove(_ item: NativeSchedule) async {
        guard !busy else { return }; busy = true; defer { busy = false }; removal = nil
        do { let _: LogoutResult = try await account.request("buildings/\(building.id)/schedules/\(item.id)", method: "DELETE"); await load() }
        catch { await load(); problem = error.localizedDescription }
    }
}

struct NativeScheduleEditor: View {
    let building: Building
    let item: NativeSchedule?
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var details: String
    @State private var starts: Date
    @State private var ends: Date
    @State private var hasEnd: Bool
    @State private var problem: String?
    @State private var busy = false
    init(building: Building, item: NativeSchedule?, account: AccountModel) {
        self.building = building; self.item = item; self.account = account
        let start = item.flatMap { nativeTeamDate($0.starts_at) } ?? Date()
        _title = State(initialValue: item?.title ?? ""); _details = State(initialValue: item?.details ?? "")
        _starts = State(initialValue: start); _ends = State(initialValue: item?.ends_at.flatMap(nativeTeamDate) ?? start.addingTimeInterval(3600)); _hasEnd = State(initialValue: item?.ends_at != nil)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Termin") { TextField("Titel", text: $title); TextField("Details", text: $details, axis: .vertical).lineLimit(3...8) }
                Section {
                    DatePicker("Beginn", selection: $starts)
                    Toggle("Ende festlegen", isOn: $hasEnd)
                    if hasEnd { DatePicker("Ende", selection: $ends, in: starts...) }
                } footer: { Text("Die Anzeige verwendet die Zeitzone deines iPhones. Gespeichert wird der genaue Zeitpunkt für alle Teammitglieder.") }
                if let problem { Section { TeamProblem(message: problem) } }
            }.navigationTitle(item == nil ? "Neuer Termin" : "Termin bearbeiten").disabled(busy)
                .onChange(of: starts) { _, start in if ends < start { ends = start.addingTimeInterval(3600) } }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button("Speichern") { Task { await save() } }.disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.count > 120 || details.count > 2000 || (hasEnd && ends < starts)) }
                }
        }.interactiveDismissDisabled(busy)
    }
    private func save() async {
        busy = true; defer { busy = false }
        let formatter = ISO8601DateFormatter()
        let end: Any = hasEnd ? formatter.string(from: ends) : NSNull()
        do {
            let _: NativeSchedule = try await account.request("buildings/\(building.id)/schedules" + (item.map { "/\($0.id)" } ?? ""), method: item == nil ? "POST" : "PATCH", body: ["title": title.trimmingCharacters(in: .whitespacesAndNewlines), "details": details, "starts_at": formatter.string(from: starts), "ends_at": end])
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}
