import SwiftUI
import UserNotifications

// Automationen in normaler Sprache: „Wenn die Luftfeuchte im Bad über 60 % steigt“ → Mitteilung.
struct AutomationRule: Decodable, Identifiable { let id: Int; let text: String; let description: String; let enabled: Bool; let triggered: Bool; let last_fired_at: String? }
struct AutomationList: Decodable { let rules: [AutomationRule]; let limit: Int; let examples: [String] }
struct AutomationPreview: Decodable { let description: String }

/// Zeigt neue Automations-Treffer als iPhone-Mitteilung (wenn erlaubt). Merkt sich die zuletzt gemeldete Nummer.
enum AutomationAlerts {
    private static let key = "automation.lastNotice"
    static func deliver(_ notices: [ProjectNotice]) {
        let defaults = UserDefaults.standard, last = defaults.integer(forKey: key)
        let fresh = notices.filter { $0.kind == "automation" && $0.read_at == nil && $0.id > last }
        guard let newest = notices.filter({ $0.kind == "automation" }).map(\.id).max() else { return }
        defaults.set(max(last, newest), forKey: key)
        guard last > 0 else { return } // erster Abruf: alte Meldungen nicht nachträglich als Mitteilung zeigen
        for notice in fresh.prefix(3) {
            let content = UNMutableNotificationContent(); content.title = "Nala"; content.body = notice.title; content.sound = .default
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "automation-\(notice.id)", content: content, trigger: nil))
        }
    }
}

struct BuildingAutomationsView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var list: AutomationList?
    @State private var text = ""
    @State private var preview: String?
    @State private var problem: String?
    @State private var saving = false
    @FocusState private var focused: Bool
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        NalaAvatar(size: 30)
                        Text("Sag mir, wann ich dir Bescheid geben soll.").font(.subheadline.weight(.semibold))
                    }
                    TextField("Wenn die Luftfeuchte im Bad über 60 % steigt …", text: $text, axis: .vertical)
                        .lineLimit(1...3).focused($focused).submitLabel(.done)
                        .padding(12).background(Color(uiColor: .tertiarySystemFill), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .onChange(of: text) { _, _ in preview = nil }
                    if let preview { Label(preview, systemImage: "checkmark.seal.fill").font(.footnote).foregroundStyle(d21Accent) }
                    HStack {
                        Button("Prüfen") { Task { await check() } }.buttonStyle(.bordered).disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                        Spacer()
                        Button { Task { await save() } } label: { if saving { ProgressView() } else { Text("Regel anlegen").bold() } }
                            .buttonStyle(.borderedProminent).disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                    }
                    if let examples = list?.examples, text.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) { ForEach(examples, id: \.self) { e in Button(e) { text = e; Task { await check() } }.font(.caption.weight(.semibold)).buttonStyle(.bordered) } }
                        }
                    }
                }.padding(.vertical, 6)
            } footer: { Text("Nala prüft neue Messwerte von Home Assistant und ESP32-Sensoren. Du bekommst eine Meldung, wenn der Wert die Grenze überschreitet, und erst wieder, nachdem er zurück im Normalbereich war.") }
            if let rules = list?.rules, !rules.isEmpty {
                Section("Deine Regeln") {
                    ForEach(rules) { rule in
                        HStack(spacing: 12) {
                            Image(systemName: rule.triggered ? "bell.badge.fill" : "bell").foregroundStyle(rule.triggered ? .orange : .secondary).frame(width: 28)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(rule.description).font(.subheadline.weight(.semibold))
                                Text(rule.triggered ? "Grenze gerade überschritten" : "„\(rule.text)“").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer(minLength: 0)
                            Toggle("", isOn: Binding(get: { rule.enabled }, set: { value in Task { await toggle(rule, value) } })).labelsHidden()
                        }
                        .swipeActions { Button("Löschen", role: .destructive) { Task { await delete(rule) } } }
                    }
                }
            }
            if let problem { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
        }
        .navigationTitle("Automationen")
        .refreshable { await load() }
        .task(id: building.id) { await load(); _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) }
    }
    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func load() async { do { list = try await account.request("buildings/\(building.id)/automations"); problem = nil } catch { problem = error.localizedDescription } }
    private func check() async {
        do { let p: AutomationPreview = try await account.request("buildings/\(building.id)/automations/parse", method: "POST", body: ["text": trimmed]); preview = "Verstanden: " + p.description; problem = nil }
        catch { preview = nil; problem = error.localizedDescription }
    }
    private func save() async {
        saving = true; defer { saving = false }
        do { let _: AutomationRule = try await account.request("buildings/\(building.id)/automations", method: "POST", body: ["text": trimmed]); text = ""; preview = nil; focused = false; await load() }
        catch { problem = error.localizedDescription }
    }
    private func toggle(_ rule: AutomationRule, _ on: Bool) async {
        struct OK: Decodable { let ok: Bool }
        do { let _: OK = try await account.request("automations/\(rule.id)", method: "PATCH", body: ["enabled": on]); await load() } catch { problem = error.localizedDescription }
    }
    private func delete(_ rule: AutomationRule) async {
        struct OK: Decodable { let ok: Bool }
        do { let _: OK = try await account.request("automations/\(rule.id)", method: "DELETE"); await load() } catch { problem = error.localizedDescription }
    }
}
