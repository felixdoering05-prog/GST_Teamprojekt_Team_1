import SwiftUI
import Charts

// Home-Assistant-Import: koppeln, Sensoren auswählen, HA-Bereiche den Räumen zuordnen.
// Die App sieht nie einen Home-Assistant-Zugang. Home Assistant sendet über eine Custom Integration.
struct HALatest: Decodable { let value: Double; let measured_at: String }
struct HALink: Decodable {
    let id: String; let status: String; let mode: String?; let instance_name: String; let ha_version: String; let revision: Int
    let paired_at: String?; let last_inventory_at: String?; let last_push_at: String?; let pairing_expires_at: String?
}
struct HAArea: Decodable, Identifiable { let area_id: String; let name: String; let room_id: String?; var id: String { area_id } }
struct HADevice: Decodable, Identifiable { let device_id: String; let name: String; let manufacturer: String; let model: String; let area_id: String?; var id: String { device_id } }
struct HAEntity: Decodable, Identifiable {
    let entity_id: String; let name: String; let metric: String; let unit: String
    let device_id: String?; let area_id: String?; let selected: Bool; let latest: HALatest?
    var supports_color: Bool? = nil; var capabilities: HALightCaps? = nil; var light: HALightState? = nil
    var id: String { entity_id }
    var isLight: Bool { metric == "light" }
}
struct HALightState: Decodable { let available: Bool; let is_on: Bool?; let brightness: Int?; let rgb: [Int]?; var color_temp_kelvin: Int? = nil; let updated_at: String? }
struct HALightCaps: Decodable { let brightness: Bool; let color: Bool; let temp: Bool; let min_kelvin: Int?; let max_kelvin: Int? }
struct HARoom: Decodable, Identifiable, Hashable { let id: String; let name: String; let room_code: String }
struct HALimits: Decodable { let entities: Int? }
struct HAOverview: Decodable {
    let role: String; let link: HALink?; let areas: [HAArea]; let devices: [HADevice]; let entities: [HAEntity]; let rooms: [HARoom]; let limits: HALimits
    var isOwner: Bool { role == "owner" }
}
struct HAPairing: Decodable { let link_id: String; let code: String; let expires_at: String }
struct HAHistoryPoint: Decodable, Identifiable { let value: Double; let measured_at: String; var id: String { measured_at } }
struct HAHistory: Decodable { let entity_id: String; let metric: String; let unit: String; let truncated: Bool; let points: [HAHistoryPoint] }

enum HAMetric {
    static func title(_ metric: String) -> String { ["light":"Lampen","temperature":"Temperatur","humidity":"Luftfeuchte","co2":"CO₂","power":"Leistung","energy":"Energie"][metric] ?? metric }
    static func symbol(_ metric: String) -> String { ["light":"lightbulb.fill","temperature":"thermometer.medium","humidity":"humidity.fill","co2":"carbon.dioxide.cloud","power":"bolt.fill","energy":"bolt.batteryblock"][metric] ?? "sensor" }
    static let order = ["light","temperature","humidity","co2","power","energy"]
    static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    static func value(_ v: Double, _ unit: String) -> String { v.formatted(.number.precision(.fractionLength(abs(v) >= 100 ? 0 : 1))) + " " + unit }
}

struct HomeAssistantImportView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var overview: HAOverview?
    @State private var pairing: HAPairing?
    @State private var selection: Set<String> = []
    @State private var mapping: [String: String] = [:]
    @State private var loading = false
    @State private var busy = false
    @State private var problem: String?
    @State private var notice: String?
    @State private var confirmDisconnect = false
    @State private var connecting = false
    @State private var syncing = false
    @State private var advanced = false
    @State private var hasLocalAccess = false
    @Environment(\.scenePhase) private var scenePhase

    private var link: HALink? { overview?.link }
    private var active: Bool { link?.status == "active" }
    private var owner: Bool { overview?.isOwner == true }
    private var savedSelection: Set<String> { Set(overview?.entities.filter(\.selected).map(\.entity_id) ?? []) }
    private var savedMapping: [String: String] { Dictionary(uniqueKeysWithValues: (overview?.areas ?? []).compactMap { a in a.room_id.map { (a.area_id, $0) } }) }
    private var limit: Int? { overview?.limits.entities }
    private var appMode: Bool { link?.mode == "app" }

    var body: some View {
        List {
            statusSection
            if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange) } }
            if let notice { Section { Label(notice, systemImage: "checkmark.circle.fill").foregroundStyle(.green) } }
            if active, let overview {
                let lamps = overview.entities.filter { $0.isLight && $0.selected }
                if !lamps.isEmpty && appMode { Section { ForEach(lamps) { lamp in HALampControl(account: account, building: building, lamp: lamp, area: overview.areas.first { $0.area_id == lamp.area_id }, rooms: overview.rooms, canSwitch: owner && hasLocalAccess, changed: { await reload(keepEdits: true) }) } } header: { Text("Lampen steuern") } footer: { Text(owner && hasLocalAccess ? "Geschaltet wird direkt in deinem Home Assistant (im WLAN oder über Home Assistant Cloud). Es gilt dein Limit für Lichtaufträge pro Minute." : "Schalten kann der Besitzer auf dem iPhone, das mit Home Assistant angemeldet ist.") } }
                sensorsSection(overview)
                if !overview.areas.isEmpty { areasSection(overview) }
                if !overview.devices.isEmpty { devicesSection(overview) }
                if owner { Section { Button("Verbindung trennen", role: .destructive) { confirmDisconnect = true }.disabled(busy || syncing) } footer: { Text(appMode ? "Löscht die Geräteübersicht und alle übernommenen Werte auf dem Projektserver und meldet dieses iPhone bei Home Assistant ab." : "Löscht den Brückenschlüssel, die Geräteübersicht und alle übernommenen Werte auf dem Projektserver.") } }
            }
            Section {
                Text("Übernommen werden nur Sensoren für Temperatur, Luftfeuchte, CO₂, Leistung und Energie, Werte nur von ausgewählten Sensoren. Personen, Standorte, Kameras und Anwesenheit bleiben in Home Assistant. Deine Home-Assistant-Anmeldung bleibt auf diesem iPhone; auf dem Projektserver liegt kein Home-Assistant-Zugang. Werte werden 90 Tage gespeichert und sind für Mitglieder dieses Gebäudes sichtbar.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Home Assistant").navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload(); if appMode && hasLocalAccess { await syncNow(quiet: true) } }
        .sheet(isPresented: $connecting, onDismiss: { Task { await reload(); if hasLocalAccess { await syncNow(quiet: true) } } }) { HAConnectSheet(account: account, building: building) }
        .confirmationDialog("Verbindung zu Home Assistant trennen?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
            Button("Trennen und Daten löschen", role: .destructive) { Task { await disconnect() } }
        } message: { Text("Alle übernommenen Werte dieses Gebäudes werden gelöscht. Home Assistant sendet danach nichts mehr.") }
        .task {
            await reload()
            if appMode && hasLocalAccess { await syncNow(quiet: true) }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(link?.status == "pending" ? 5 : 30)) } catch { return }
                if scenePhase == .active && !busy { await reload(keepEdits: true) }
            }
        }
    }

    @ViewBuilder private var statusSection: some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: "house.and.flag.fill").font(.title2).foregroundStyle(.white).frame(width: 48, height: 48)
                    .background(LinearGradient(colors: [Color(red: 0.07, green: 0.6, blue: 0.85), d21Accent], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(active ? "Verbunden" : link?.status == "pending" ? "Wartet auf Home Assistant" : "Nicht verbunden").font(.headline)
                    Text(statusDetail).font(.caption).foregroundStyle(.secondary)
                }
            }.accessibilityElement(children: .combine)
            if overview == nil && loading { HStack { ProgressView(); Text("Wird geladen …").foregroundStyle(.secondary) } }
            if let overview, !active {
                if overview.isOwner {
                    if let pairing { pairingCard(pairing) }
                    else {
                        Text("Übernimm Sensorwerte, Geräte und Bereiche aus deinem Home Assistant. Du meldest dich einfach mit deinem Home-Assistant-Konto an – nichts installieren, nichts kopieren.").font(.subheadline).foregroundStyle(.secondary)
                        Button { connecting = true } label: { Label("Mit Home Assistant verbinden", systemImage: "link") }.buttonStyle(.borderedProminent).tint(d21Accent).disabled(busy)
                        DisclosureGroup("Fortgeschritten: rund um die Uhr übertragen", isExpanded: $advanced) {
                            Text("Die App gleicht Werte ab, wenn du sie öffnest. Für Werte rund um die Uhr kannst du stattdessen die Integration „Nala Solutions“ in Home Assistant installieren und mit einem Code koppeln.").font(.footnote).foregroundStyle(.secondary)
                            Button { Task { await createCode() } } label: { Label(link?.status == "pending" ? "Neuen Kopplungscode erzeugen" : "Kopplungscode erzeugen", systemImage: "link.badge.plus") }.disabled(busy)
                        }.font(.subheadline)
                    }
                } else { Text("Nur der Besitzer des Gebäudes kann Home Assistant verbinden.").font(.subheadline).foregroundStyle(.secondary) }
            }
            if active && appMode && owner {
                if hasLocalAccess {
                    Button { Task { await syncNow(quiet: false) } } label: { HStack { Label(syncing ? "Wird abgeglichen …" : "Jetzt abgleichen", systemImage: "arrow.triangle.2.circlepath"); if syncing { Spacer(); ProgressView() } } }.disabled(syncing || busy)
                    Text("Werte werden abgeglichen, wenn du die App öffnest – im selben WLAN wie Home Assistant oder unterwegs über Home Assistant Cloud. Fehlende Stunden holt die App aus dem Verlauf von Home Assistant nach.").font(.footnote).foregroundStyle(.secondary)
                } else {
                    Button { connecting = true } label: { Label("Auf diesem iPhone bei Home Assistant anmelden", systemImage: "person.badge.key") }
                    Text("Die Home-Assistant-Anmeldung liegt nur auf dem iPhone, mit dem verbunden wurde.").font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }
    private var statusDetail: String {
        guard let link else { return building.name }
        if link.status == "pending" { return "Code in Home Assistant eingeben" }
        if link.mode == "app", let synced = HAMetric.date(link.last_push_at) { return [link.instance_name.isEmpty ? "Home Assistant" : link.instance_name, "abgeglichen " + synced.formatted(.relative(presentation: .named))].joined(separator: " · ") }
        var parts = [link.instance_name.isEmpty ? "Home Assistant" : link.instance_name]
        if !link.ha_version.isEmpty { parts.append(link.ha_version) }
        if let push = HAMetric.date(link.last_push_at) { parts.append("zuletzt " + push.formatted(.relative(presentation: .named))) }
        else { parts.append("noch keine Werte") }
        return parts.joined(separator: " · ")
    }
    private func pairingCard(_ pairing: HAPairing) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("1. Ordner „ki_trifft_gebaeude“ nach custom_components kopieren und Home Assistant neu starten.\n2. Einstellungen → Geräte & Dienste → Integration hinzufügen → „Nala Solutions“.\n3. Diese Angaben eingeben:").font(.footnote)
            LabeledContent("Serveradresse") { Text(account.bridgeAddress ?? "–").font(.footnote.monospaced()).textSelection(.enabled).multilineTextAlignment(.trailing) }
            LabeledContent("Kopplungscode") { Text(pairing.code).font(.title2.monospaced().bold()).textSelection(.enabled) }
            if let expires = HAMetric.date(pairing.expires_at) { Text("Gültig bis \(expires.formatted(date: .omitted, time: .shortened)) Uhr · nur einmal verwendbar").font(.caption).foregroundStyle(.secondary) }
            HStack { ProgressView(); Text("Warte auf Home Assistant …").font(.caption).foregroundStyle(.secondary) }
        }.padding(.vertical, 4)
    }

    private func sensorsSection(_ overview: HAOverview) -> some View {
        let grouped = Dictionary(grouping: overview.entities, by: \.metric)
        let changed = selection != savedSelection
        return Group {
            if overview.entities.isEmpty {
                Section("Sensoren") { Text("Home Assistant hat noch keine passenden Geräte gemeldet. Unterstützt werden Lampen sowie Sensoren für Temperatur, Luftfeuchte, CO₂, Leistung und Energie.").font(.footnote).foregroundStyle(.secondary) }
            }
            ForEach(HAMetric.order.filter { grouped[$0] != nil }, id: \.self) { metric in
                Section(HAMetric.title(metric)) {
                    ForEach(grouped[metric] ?? []) { entity in entityRow(entity, overview: overview) }
                }
            }
            if !overview.entities.isEmpty {
                Section {
                    if owner {
                        Button(busy ? "Wird gespeichert …" : "Auswahl speichern (\(selection.count))") { Task { await saveSelection() } }
                            .disabled(!changed || busy || limit.map { selection.count > $0 } == true)
                    }
                } footer: {
                    Text(owner ? "Ausgewählt: \(selection.count)\(limit.map { " von höchstens \($0)" } ?? ""). Für neu ausgewählte Sensoren liefert Home Assistant einmalig die Stundenwerte der letzten 7 Tage nach." : "Nur der Besitzer kann die Auswahl ändern.")
                }
            }
        }
    }
    private func entityRow(_ entity: HAEntity, overview: HAOverview) -> some View {
        let area = overview.areas.first { $0.area_id == entity.area_id }?.name
        let on = selection.contains(entity.entity_id)
        return HStack(spacing: 12) {
            Image(systemName: HAMetric.symbol(entity.metric)).foregroundStyle(d21Accent).frame(width: 26)
            let label = VStack(alignment: .leading, spacing: 2) {
                Text(entity.name).lineLimit(2)
                Text([area, entity.entity_id].compactMap { $0 }.joined(separator: " · ")).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                if entity.selected, let latest = entity.latest { Text(HAMetric.value(latest.value, entity.unit)).font(.caption.weight(.semibold)).foregroundStyle(d21Accent) }
                if entity.selected, let light = entity.light { Text(HALightText.status(light)).font(.caption.weight(.semibold)).foregroundStyle(light.is_on == true ? d21Accent : .secondary) }
            }
            // Verlauf gibt es nur für bereits übernommene Sensoren.
            if entity.selected && !entity.isLight { NavigationLink { HAEntityHistoryView(account: account, building: building, entity: entity) } label: { label } }
            else { label; Spacer(minLength: 0) }
            if owner {
                Toggle("", isOn: Binding(get: { on }, set: { value in if value { selection.insert(entity.entity_id) } else { selection.remove(entity.entity_id) } }))
                    .labelsHidden().tint(d21Accent).accessibilityLabel("\(entity.name) übernehmen")
            } else if entity.selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(d21Accent).accessibilityLabel("übernommen") }
        }
    }
    private func areasSection(_ overview: HAOverview) -> some View {
        Section {
            if overview.rooms.isEmpty { Text("Dieses Gebäude hat noch keine Räume. Räume entstehen zum Beispiel aus einem IFC-Modell oder einem Raumscan.").font(.footnote).foregroundStyle(.secondary) }
            ForEach(overview.areas) { area in
                if owner && !overview.rooms.isEmpty {
                    Picker(area.name, selection: Binding(get: { mapping[area.area_id] ?? "" }, set: { mapping[area.area_id] = $0.isEmpty ? nil : $0 })) {
                        Text("Kein Raum").tag("")
                        ForEach(overview.rooms) { room in Text(room.room_code.isEmpty || room.room_code == room.name ? room.name : "\(room.name) · \(room.room_code)").tag(room.id) }
                    }
                } else {
                    LabeledContent(area.name, value: overview.rooms.first { $0.id == area.room_id }?.name ?? "Kein Raum")
                }
            }
            if owner && !overview.rooms.isEmpty {
                Button("Zuordnung speichern") { Task { await saveMapping() } }.disabled(mapping == savedMapping || busy)
            }
        } header: { Text("Bereiche → Räume") } footer: { Text("Zugeordnete Temperatur-, Feuchte- und CO₂-Werte erscheinen in Sensorik, Wärmekarte und KI-Auswertung des Raums.") }
    }
    private func devicesSection(_ overview: HAOverview) -> some View {
        Section("Geräte aus Home Assistant") {
            ForEach(overview.devices) { device in
                VStack(alignment: .leading, spacing: 2) {
                    Text(device.name)
                    Text([device.manufacturer, device.model, overview.areas.first { $0.area_id == device.area_id }?.name ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    // Ungespeicherte Änderungen des jeweils anderen Abschnitts bleiben beim Speichern/Neuladen erhalten.
    private func apply(_ value: HAOverview, keepEdits: Bool = false, keepSelection: Bool = false, keepMapping: Bool = false) {
        let dirtySelection = (keepEdits || keepSelection) && overview != nil && selection != savedSelection
        let dirtyMapping = (keepEdits || keepMapping) && overview != nil && mapping != savedMapping
        overview = value
        if !dirtySelection { selection = savedSelection }
        if !dirtyMapping { mapping = savedMapping }
        if value.link?.status != "pending" { pairing = nil }
    }
    private func reload(keepEdits: Bool = false) async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { let value: HAOverview = try await account.request("buildings/\(building.id)/home-assistant"); apply(value, keepEdits: keepEdits); hasLocalAccess = HACredentials.load(building.id, account: account) != nil; problem = nil }
        catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
    private func createCode() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { pairing = try await account.request("buildings/\(building.id)/home-assistant/pairing", method: "POST", body: [:]); problem = nil; notice = nil; await reload() }
        catch { problem = error.localizedDescription }
    }
    private func saveSelection() async {
        guard !busy, let link else { return }; busy = true; defer { busy = false }
        do { let value: HAOverview = try await account.request("buildings/\(building.id)/home-assistant/entities", method: "PUT", body: ["selected": Array(selection).sorted(), "revision": link.revision]); apply(value, keepMapping: true); problem = nil; notice = appMode ? "Auswahl gespeichert." : "Auswahl gespeichert. Home Assistant sendet ab dem nächsten Abgleich (spätestens in einer Minute)."; if appMode && hasLocalAccess { busy = false; await syncNow(quiet: false) } }
        catch { problem = error.localizedDescription }
    }
    private func saveMapping() async {
        guard !busy, let link, let overview else { return }; busy = true; defer { busy = false }
        var body: [String: Any] = [:]
        for area in overview.areas { body[area.area_id] = mapping[area.area_id] ?? NSNull() }
        do { let value: HAOverview = try await account.request("buildings/\(building.id)/home-assistant/areas", method: "PUT", body: ["mapping": body, "revision": link.revision]); apply(value, keepSelection: true); problem = nil; notice = "Raumzuordnung gespeichert." }
        catch { problem = error.localizedDescription }
    }
    private func syncNow(quiet: Bool) async {
        guard !syncing else { return }; syncing = true; defer { syncing = false }
        do { let result = try await HASync.sync(account: account, building: building.id, refreshInventory: !quiet); if !quiet { notice = result.stored == 1 ? "1 neuer Wert übernommen." : "\(result.stored) neue Werte übernommen." }; await reload(keepEdits: true) }
        catch { if !quiet || problem == nil { problem = error.localizedDescription } }
    }
    private func disconnect() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { let _: [String: Bool] = try await account.request("buildings/\(building.id)/home-assistant", method: "DELETE"); await HASync.disconnect(account: account, building: building.id); pairing = nil; notice = "Verbindung getrennt und Daten gelöscht."; await reload() }
        catch { problem = error.localizedDescription }
    }
}

struct HAEntityHistoryView: View {
    @ObservedObject var account: AccountModel
    let building: Building
    let entity: HAEntity
    @State private var hours = 24
    @State private var history: HAHistory?
    @State private var problem: String?
    var body: some View {
        List {
            Section {
                Picker("Zeitraum", selection: $hours) { Text("24 h").tag(24); Text("7 Tage").tag(168); Text("30 Tage").tag(720) }.pickerStyle(.segmented)
                if let history, !history.points.isEmpty {
                    Chart(history.points) { p in
                        if let d = HAMetric.date(p.measured_at) { LineMark(x: .value("Zeit", d), y: .value(HAMetric.title(entity.metric), p.value)).foregroundStyle(d21Accent).interpolationMethod(.monotone) }
                    }.chartYScale(domain: .automatic(includesZero: false)).frame(height: 220).accessibilityLabel("Verlauf \(entity.name)")
                    if let last = history.points.last { LabeledContent("Letzter Wert", value: HAMetric.value(last.value, history.unit)) }
                    let values = history.points.map(\.value)
                    if let lo = values.min(), let hi = values.max() { LabeledContent("Minimum / Maximum", value: "\(HAMetric.value(lo, history.unit)) / \(HAMetric.value(hi, history.unit))") }
                    if history.truncated { Text("Es werden die letzten 1000 Werte gezeigt.").font(.caption).foregroundStyle(.secondary) }
                } else if history != nil { Text("Für diesen Zeitraum liegen noch keine Werte vor.").foregroundStyle(.secondary) }
                else if problem == nil { ProgressView() }
                if let problem { Text(problem).foregroundStyle(.orange) }
            } footer: { Text("Quelle: Home Assistant · \(entity.entity_id)") }
        }
        .navigationTitle(entity.name).navigationBarTitleDisplayMode(.inline)
        .task(id: hours) {
            do { history = try await account.request("buildings/\(building.id)/home-assistant/history?entity_id=\(entity.entity_id)&hours=\(hours)"); problem = nil }
            catch { if !Task.isCancelled { problem = error.localizedDescription } }
        }
    }
}

/// Verbinden in drei Schritten: Home Assistant finden, anmelden, fertig.
struct HAConnectSheet: View {
    @ObservedObject var account: AccountModel
    let building: Building
    @Environment(\.dismiss) private var dismiss
    @StateObject private var discovery = HADiscovery()
    @State private var manual = ""
    @State private var busy = false
    @State private var problem: String?
    @State private var login = HALogin()
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Dein iPhone sucht Home Assistant im WLAN. Danach meldest du dich mit deinem Home-Assistant-Konto an.", systemImage: "wifi").font(.subheadline)
                }
                Section("Gefunden") {
                    if discovery.found.isEmpty {
                        HStack { ProgressView(); Text("Suche im WLAN …").foregroundStyle(.secondary) }
                    }
                    ForEach(discovery.found) { instance in
                        Button { Task { await connect(instance.url) } } label: {
                            HStack { Image(systemName: "house.fill").foregroundStyle(d21Accent); VStack(alignment: .leading) { Text(instance.name).foregroundStyle(.primary); Text(instance.url.absoluteString).font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(.tertiary) }
                        }.disabled(busy)
                    }
                }
                Section {
                    TextField("z. B. homeassistant.local:8123", text: $manual).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    Button("Mit dieser Adresse verbinden") { if let url = HASetup.normalize(manual) { Task { await connect(url) } } else { problem = "Bitte eine Adresse wie homeassistant.local:8123 eingeben." } }.disabled(busy || manual.isEmpty)
                } header: { Text("Nicht gefunden?") } footer: { Text("Die Adresse steht in Home Assistant unter Einstellungen → System → Netzwerk. Unterwegs funktioniert auch deine Home-Assistant-Cloud-Adresse (Nabu Casa).") }
                if busy { Section { HStack { ProgressView(); Text("Verbinde …") } } }
                if let problem { Section { Text(problem).foregroundStyle(.red) } }
                Section { Text("Übernommen werden nur Sensoren für Temperatur, Luftfeuchte, CO₂, Leistung und Energie. Welche, wählst du im nächsten Schritt aus.").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("Home Assistant verbinden").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(busy) } }
            .interactiveDismissDisabled(busy)
            .onAppear { discovery.start() }
            .onDisappear { discovery.stop() }
        }
    }
    private func connect(_ url: URL) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { try await HASync.connect(account: account, building: building, url: url, login: login); dismiss() }
        catch { problem = error.localizedDescription }
    }
}

enum HALightText {
    static func status(_ light: HALightState) -> String {
        guard light.available, let on = light.is_on else { return "Nicht erreichbar" }
        guard on else { return "Aus" }
        return light.brightness.map { "An · \(Int((Double($0) / 255 * 100).rounded())) %" } ?? "An"
    }
}

/// Eine übernommene Lampe in der Liste: Zustand, Raum, Schalter und Weg zur großen Steuerung.
struct HALampControl: View {
    @ObservedObject var account: AccountModel
    let building: Building
    let lamp: HAEntity
    let area: HAArea?
    let rooms: [HARoom]
    let canSwitch: Bool
    let changed: () async -> Void
    @State private var busy = false
    @State private var problem: String?
    private var room: String { area?.room_id.flatMap { id in rooms.first { $0.id == id }?.name } ?? area?.name ?? "Ohne Raum" }
    private var on: Bool { lamp.light?.is_on == true }
    private var available: Bool { lamp.light?.available ?? true }
    var body: some View {
        HStack(spacing: 12) {
            let row = HStack(spacing: 12) {
                Image(systemName: on ? "lightbulb.fill" : "lightbulb").font(.title3).foregroundStyle(on ? HALampLook.tint(lamp.light) : .secondary).frame(width: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(lamp.name).foregroundStyle(.primary)
                    Text(room + " · " + (lamp.light.map(HALightText.status) ?? "Zustand folgt beim nächsten Abgleich")).font(.caption).foregroundStyle(.secondary)
                    if let problem { Text(problem).font(.caption).foregroundStyle(.orange) }
                }
                Spacer(minLength: 0)
            }
            if canSwitch && available { NavigationLink { HALampDetailView(account: account, building: building, lamp: lamp, room: room, changed: changed) } label: { row } }
            else { row }
            if busy { ProgressView() }
            else if canSwitch {
                Toggle("", isOn: Binding(get: { on }, set: { value in Task { await send(on: value) } })).labelsHidden().tint(d21Accent).disabled(!available).accessibilityLabel("\(lamp.name) schalten")
            }
        }
    }
    private func send(on: Bool) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { try await HASync.switchLight(account: account, building: building.id, entity: lamp.entity_id, on: on); problem = nil; await changed() }
        catch { problem = error.localizedDescription }
    }
}

enum HALampLook {
    static func color(kelvin: Int) -> Color {
        // Näherung Schwarzkörper 2000–6500 K für die Vorschau.
        let t = min(max(Double(kelvin - 2000) / 4500, 0), 1)
        return Color(red: 1, green: 0.62 + 0.33 * t, blue: 0.28 + 0.72 * t)
    }
    static func tint(_ light: HALightState?) -> Color {
        if let k = light?.color_temp_kelvin { return color(kelvin: k) }
        if let rgb = light?.rgb { return lightColor(rgb) }
        return Color(red: 1, green: 0.84, blue: 0.55)
    }
}

struct HALampScene: Identifiable {
    let id: String; let symbol: String; let brightness: Int; let kelvin: Int; let rgb: [Int]
    static let all = [
        HALampScene(id: "Hell", symbol: "sun.max.fill", brightness: 255, kelvin: 5000, rgb: [255, 245, 230]),
        HALampScene(id: "Lesen", symbol: "book.fill", brightness: 220, kelvin: 4000, rgb: [255, 232, 200]),
        HALampScene(id: "Gemütlich", symbol: "sofa.fill", brightness: 110, kelvin: 2700, rgb: [255, 190, 120]),
        HALampScene(id: "Abend", symbol: "moon.stars.fill", brightness: 40, kelvin: 2200, rgb: [255, 150, 70])
    ]
}

/// Große Steuerung wie im Kontrollzentrum: Helligkeit, Szenen, Farbtemperatur, Farbe.
/// Nur was die Lampe laut Home Assistant kann. Während des Ziehens wird höchstens alle 3 s gesendet
/// (passt zum Limit von 20 Lichtaufträgen pro Minute), der letzte Wert immer beim Loslassen.
struct HALampDetailView: View {
    @ObservedObject var account: AccountModel
    let building: Building
    let lamp: HAEntity
    let room: String
    let changed: () async -> Void
    @State private var on = false
    @State private var level: Double = 1
    @State private var kelvin: Double = 3000
    @State private var color: Color = .white
    @State private var mode = "temp"
    @State private var lastSent = Date.distantPast
    @State private var pending: Task<Void, Never>?
    @State private var sending = false
    @State private var problem: String?
    @State private var ready = false
    private var caps: HALightCaps { lamp.capabilities ?? HALightCaps(brightness: true, color: lamp.supports_color == true, temp: false, min_kelvin: nil, max_kelvin: nil) }
    private var minK: Double { Double(caps.min_kelvin ?? 2000) }
    private var maxK: Double { Double(caps.max_kelvin ?? 6500) }
    private var preview: Color { mode == "color" ? color : caps.temp ? HALampLook.color(kelvin: Int(kelvin)) : Color(red: 1, green: 0.84, blue: 0.55) }
    static let swatches: [[Int]] = [[255, 59, 48], [255, 149, 0], [255, 204, 0], [52, 199, 89], [48, 176, 199], [0, 122, 255], [88, 86, 214], [175, 82, 222], [255, 45, 85], [255, 255, 255]]

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                VStack(spacing: 6) {
                    Text(room).font(.subheadline).foregroundStyle(.secondary)
                    Text(on ? (caps.brightness ? "\(Int((level * 100).rounded())) %" : "An") : "Aus").font(.system(size: 44, weight: .bold, design: .rounded)).contentTransition(.numericText())
                }
                HStack(alignment: .bottom, spacing: 24) {
                    if caps.brightness { brightnessSlider } else { powerButton }
                }
                if let problem { Label(problem, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.orange) }
                if caps.brightness || caps.temp || caps.color { scenes }
                if caps.temp && caps.color {
                    Picker("Art", selection: $mode) { Text("Weißton").tag("temp"); Text("Farbe").tag("color") }.pickerStyle(.segmented)
                }
                if caps.temp && (mode == "temp" || !caps.color) { temperature }
                if caps.color && (mode == "color" || !caps.temp) { colors }
                Text("Geschaltet wird direkt in deinem Home Assistant. Beim Ziehen sendet die App höchstens alle 3 Sekunden, damit dein Limit für Lichtaufträge reicht.").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(lamp.name).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { if sending { ProgressView() } } }
        .onAppear {
            on = lamp.light?.is_on == true
            level = Double(lamp.light?.brightness ?? 255) / 255
            kelvin = Double(lamp.light?.color_temp_kelvin ?? Int((minK + maxK) / 2)).clamped(minK, maxK)
            if let rgb = lamp.light?.rgb { color = lightColor(rgb); mode = caps.color ? "color" : "temp" } else { mode = caps.temp ? "temp" : "color" }
            Task { try? await Task.sleep(for: .milliseconds(300)); ready = true }
        }
        .onDisappear { pending?.cancel() }
    }

    // Großer Regler wie im Kontrollzentrum; Tippen ohne Ziehen schaltet um.
    private var brightnessSlider: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 34, style: .continuous).fill(Color(uiColor: .tertiarySystemFill))
                Rectangle().fill(LinearGradient(colors: [preview.opacity(0.75), preview], startPoint: .bottom, endPoint: .top))
                    .frame(height: on ? max(geo.size.height * level, 18) : 0)
                Image(systemName: on ? "lightbulb.max.fill" : "lightbulb").font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(on && level > 0.18 ? Color.black.opacity(0.55) : Color.secondary).padding(.bottom, 22)
            }
            .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { g in
                    let value = min(max(1 - g.location.y / geo.size.height, 0.01), 1)
                    if abs(g.translation.height) < 4 && abs(g.translation.width) < 4 { return }
                    withAnimation(.interactiveSpring) { level = value; on = true }
                    schedule(final: false)
                }
                .onEnded { g in
                    if abs(g.translation.height) < 4 && abs(g.translation.width) < 4 { on.toggle(); send(final: true); return }
                    schedule(final: true)
                })
        }
        .frame(width: 130, height: 320)
        .shadow(color: on ? preview.opacity(0.45) : .clear, radius: 24, y: 8)
        .accessibilityElement().accessibilityLabel("Helligkeit").accessibilityValue(on ? "\(Int(level * 100)) Prozent" : "Aus")
        .accessibilityAdjustableAction { direction in
            level = min(max(level + (direction == .increment ? 0.1 : -0.1), 0.01), 1); on = true; schedule(final: true)
        }
    }
    private var powerButton: some View {
        Button { on.toggle(); send(final: true) } label: {
            Image(systemName: "power").font(.system(size: 44, weight: .semibold)).foregroundStyle(on ? .black.opacity(0.6) : .secondary)
                .frame(width: 150, height: 150).background(on ? AnyShapeStyle(preview) : AnyShapeStyle(Color(uiColor: .tertiarySystemFill)), in: Circle())
        }.buttonStyle(.plain).accessibilityLabel(on ? "Ausschalten" : "Einschalten")
    }
    private var scenes: some View {
        HStack(spacing: 10) {
            ForEach(HALampScene.all) { scene in
                Button { apply(scene) } label: {
                    VStack(spacing: 6) { Image(systemName: scene.symbol).font(.title3); Text(scene.id).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8) }
                        .frame(maxWidth: .infinity, minHeight: 66)
                        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }.buttonStyle(.plain).foregroundStyle(d21Accent)
            }
        }
    }
    private var temperature: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text("Weißton").font(.headline); Spacer(); Text("\(Int(kelvin)) K").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary) }
            ZStack {
                Capsule().fill(LinearGradient(colors: [HALampLook.color(kelvin: Int(minK)), HALampLook.color(kelvin: Int((minK + maxK) / 2)), HALampLook.color(kelvin: Int(maxK))], startPoint: .leading, endPoint: .trailing)).frame(height: 34)
                Slider(value: $kelvin, in: minK...maxK) { editing in if !editing && ready { schedule(final: true) } }.tint(.clear).padding(.horizontal, 4)
            }
            HStack { Text("Warm").font(.caption); Spacer(); Text("Kalt").font(.caption) }.foregroundStyle(.secondary)
        }.padding(16).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onChange(of: kelvin) { _, _ in guard ready else { return }; mode = "temp"; schedule(final: false) }
    }
    private var colors: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Farbe").font(.headline)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), spacing: 12) {
                ForEach(Self.swatches, id: \.self) { rgb in
                    Button { color = lightColor(rgb); mode = "color"; on = true; send(final: true) } label: {
                        Circle().fill(lightColor(rgb)).frame(height: 44)
                            .overlay(Circle().stroke(Color.primary.opacity(lightRGB(color) == rgb && mode == "color" ? 0.8 : 0.12), lineWidth: lightRGB(color) == rgb && mode == "color" ? 3 : 1))
                    }.buttonStyle(.plain).accessibilityLabel("Farbe \(rgb.map(String.init).joined(separator: ", "))")
                }
            }
            ColorPicker("Eigene Farbe", selection: $color, supportsOpacity: false)
                .onChange(of: color) { _, _ in if ready && mode == "color" { schedule(final: false) } }
        }.padding(16).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func apply(_ scene: HALampScene) {
        on = true
        if caps.brightness { level = Double(scene.brightness) / 255 }
        if caps.temp { kelvin = Double(scene.kelvin).clamped(minK, maxK); mode = "temp" }
        else if caps.color { color = lightColor(scene.rgb); mode = "color" }
        send(final: true)
    }
    /// Drosselung: höchstens alle 3 s während des Ziehens, der Endwert wird immer gesendet.
    private func schedule(final: Bool, temperatureChange: Bool = false) {
        pending?.cancel()
        let wait = final ? 0 : max(0, 3 - Date().timeIntervalSince(lastSent))
        if !final && wait > 0 { pending = Task { try? await Task.sleep(for: .seconds(wait)); if !Task.isCancelled { send(final: false) } }; return }
        send(final: final)
    }
    private func send(final: Bool) {
        lastSent = Date()
        let isOn = on, brightness = caps.brightness && isOn ? max(1, Int((level * 255).rounded())) : nil
        let rgb = isOn && caps.color && mode == "color" ? lightRGB(color) : nil
        let k = isOn && caps.temp && (mode == "temp" || !caps.color) ? Int(kelvin.rounded()) : nil
        Task {
            sending = true; defer { sending = false }
            do { try await HASync.switchLight(account: account, building: building.id, entity: lamp.entity_id, on: isOn, brightness: brightness, rgb: rgb, kelvin: k); problem = nil; if final { await changed() } }
            catch { problem = error.localizedDescription }
        }
    }
}

private extension Double { func clamped(_ lo: Double, _ hi: Double) -> Double { Swift.min(Swift.max(self, lo), hi) } }
