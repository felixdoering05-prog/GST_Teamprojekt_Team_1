import SwiftUI

enum DeviceKind: String, CaseIterable, Codable {
    case light, plug, temperature, contact
    var title: String { switch self { case .light: "Licht"; case .plug: "Steckdose"; case .temperature: "Temperatursensor"; case .contact: "Tür- / Fensterkontakt" } }
    var symbol: String { switch self { case .light: "lightbulb.fill"; case .plug: "powerplug.fill"; case .temperature: "thermometer.medium"; case .contact: "door.left.hand.open" } }
    var switchable: Bool { self == .light || self == .plug }
}
enum DeviceIntegration: String, CaseIterable, Codable {
    case none, homeAssistant = "home-assistant", mqtt, matter
    var title: String { switch self { case .none: "Noch offen"; case .homeAssistant: "Home Assistant"; case .mqtt: "MQTT"; case .matter: "Matter" } }
    var detail: String { switch self {
    case .none: "Zuerst Gerät und Raum erfassen. Die technische Anbindung kann später ergänzt werden."
    case .homeAssistant: "Später verbindet eine serverseitige Schnittstelle die freigegebenen Home-Assistant-Geräte. Zugangsdaten gehören auf den Server, nicht in die App."
    case .mqtt: "Später verarbeitet der Server Messwerte und Schaltbefehle über einen geschützten MQTT-Broker. Themen und Berechtigungen müssen vorher abgestimmt werden."
    case .matter: "Später wird ein geeigneter Matter-Controller oder eine Bridge benötigt. Die App führt aktuell noch keine Kopplung durch."
    } }
}
struct BuildingDevice: Identifiable, Codable {
    let id: Int
    let building_id: Int
    let name: String
    let room: String
    let kind: DeviceKind
    let mode: String
    let integration: DeviceIntegration
    let is_on: Bool
    let revision: Int
    var simulated: Bool { mode == "simulation" }
    var roomLabel: String { room.isEmpty ? "Ohne Raum" : room }
}

struct DevicesHomeView: View {
    @ObservedObject var account: AccountModel
    var body: some View {
        List {
            Section {
                Label("Dein Gebäude wird smart", systemImage: "house.fill").font(.title2.bold()).foregroundStyle(d21Accent)
                Text("Wähle ein Gebäude. Dort kannst du Geräte vorbereiten und Licht oder Steckdosen gefahrlos simulieren.").foregroundStyle(.secondary)
            }
            HomeAssistantLightsSection(account: account)
            Section("Gebäude auswählen") {
                ForEach(account.buildings) { building in
                    NavigationLink { BuildingDevicesView(building: building, account: account) } label: {
                        Label { VStack(alignment: .leading) { Text(building.name); Text(building.is_owner == false ? "Mit dir geteilt" : "Dein Gebäude").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "building.2") }
                    }
                }
                if account.buildings.isEmpty { ContentUnavailableView("Noch kein Gebäude", systemImage: "building.2", description: Text("Lege zuerst unter Gebäude eine Gebäudemappe an oder nimm eine Einladung an.")) }
            }
            Section { Text("Gebäudegeräte bleiben Simulationen oder Vorbereitungen und sind für Gebäudemitglieder sichtbar. Eine separat freigegebene private Home-Assistant-Demo erscheint oben.").font(.footnote).foregroundStyle(.secondary) }
        }
        .navigationTitle("Geräte")
        .refreshable { await account.loadBuildings() }
    }
}

struct BuildingDevicesView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var devices: [BuildingDevice] = []
    @State private var loaded = false
    @State private var loading = false
    @State private var busy = false
    @State private var problem: String?
    @State private var adding = false
    @State private var room = "Alle Räume"
    @Environment(\.scenePhase) private var scenePhase
    private var rooms: [String] { Array(Set(devices.map(\.roomLabel))).sorted() }
    private var visible: [BuildingDevice] { devices.filter { room == "Alle Räume" || $0.roomLabel == room } }
    var body: some View {
        List {
            Section {
                Label(building.name, systemImage: "house.fill").font(.headline)
                Text("\(devices.filter(\.simulated).count) Simulationen · \(devices.filter { !$0.simulated }.count) vorgemerkt").font(.subheadline).foregroundStyle(.secondary)
                Button("Gerät Schritt für Schritt hinzufügen", systemImage: "plus.circle.fill") { adding = true }.disabled(busy)
            }
            if let problem { Section { Label(problem, systemImage: "exclamationmark.icloud").foregroundStyle(.orange); Button("Erneut laden") { Task { await reload() } }.disabled(loading || busy) } }
            if loading && !loaded { Section { ProgressView("Geräte werden geladen …") } }
            if loaded && devices.isEmpty {
                Section {
                    ContentUnavailableView("Dein erstes Gerät", systemImage: "lightbulb", description: Text("Beginne zum Beispiel mit einem simulierten Licht. Typ wählen, Raum zuordnen und ausprobieren."))
                }
            }
            if !rooms.isEmpty {
                Section { Picker("Raum", selection: $room) { Text("Alle Räume").tag("Alle Räume"); ForEach(rooms, id: \.self) { Text($0).tag($0) } } }
            }
            ForEach(rooms.filter { name in visible.contains { $0.roomLabel == name } }, id: \.self) { name in
                Section(name) { ForEach(visible.filter { $0.roomLabel == name }) { device in deviceRow(device) } }
            }
            Section("Im Modell ausprobieren") {
                NavigationLink { IFCLibraryView(model: account, smartHome: true, buildingID: building.id) } label: { Label("Raumlicht im 3D-Modell simulieren", systemImage: "cube.transparent") }
                Text("Die Raumlichtsimulation im IFC-Modell ist separat. Neue Geräte werden noch nicht automatisch mit IFC-Bauteilen verknüpft.").font(.footnote).foregroundStyle(.secondary)
            }
            Section("Echte Geräte vorbereiten") {
                ForEach(DeviceIntegration.allCases.filter { $0 != .none }, id: \.self) { item in
                    DisclosureGroup(item.title + " · geplant") { Text(item.detail).font(.footnote).foregroundStyle(.secondary) }
                }
                Text("Keine automatische Suche im Netzwerk, keine Kopplung und keine echten Schaltbefehle. Für den nächsten Schritt brauchen wir das konkrete Gerät und die gewünschte Bridge.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Geräte").navigationBarTitleDisplayMode(.inline)
        .refreshable { if !busy { await reload() } }
        .sheet(isPresented: $adding, onDismiss: { Task { await reload() } }) { AddDeviceView(building: building, account: account) }
        .task {
            await reload()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                if scenePhase == .active && !busy && !adding { await reload() }
            }
        }
    }
    private func deviceRow(_ device: BuildingDevice) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(device.name, systemImage: device.kind.symbol).font(.headline).foregroundStyle(device.simulated && device.is_on ? d21Accent : .primary)
            Text(device.kind.title + " · " + (device.simulated ? "Simulation" : "Vorgemerkt · " + device.integration.title)).font(.caption).foregroundStyle(.secondary)
            if device.simulated && device.kind.switchable {
                Toggle(device.is_on ? "Simulation: Ein" : "Simulation: Aus", isOn: Binding(get: { device.is_on }, set: { value in Task { await toggle(device, on: value) } })).tint(d21Accent).disabled(busy || loading)
                    .accessibilityLabel(device.name + ", Simulation")
            } else { Text(device.simulated ? "Keine echten Messwerte · Sensordarstellung vorbereitet" : "Noch nicht verbunden · kein Live-Status").font(.footnote).foregroundStyle(.secondary) }
        }.padding(.vertical, 5)
    }
    private func reload() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { let items: [BuildingDevice] = try await account.request("buildings/\(building.id)/devices"); guard !Task.isCancelled else { return }; devices = items; loaded = true; problem = nil; if room != "Alle Räume" && !rooms.contains(room) { room = "Alle Räume" } }
        catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
    private func toggle(_ device: BuildingDevice, on: Bool) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            let item: BuildingDevice = try await account.request("buildings/\(building.id)/devices/\(device.id)", method: "PATCH", body: ["is_on":on,"revision":device.revision])
            if let index = devices.firstIndex(where: { $0.id == item.id }) { devices[index] = item }; problem = nil
        } catch { let message = error.localizedDescription; await reload(); problem = message }
    }
}

struct AddDeviceView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var step = 1
    @State private var kind: DeviceKind = .light
    @State private var name = ""
    @State private var room = ""
    @State private var simulation = true
    @State private var integration: DeviceIntegration = .homeAssistant
    @State private var saving = false
    @State private var saved = false
    @State private var problem: String?
    @State private var requestKey = UUID()
    @State private var submittedBody: [String:Any]?
    private var cleanName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Schritt \(step) von 3").font(.caption.bold()).foregroundStyle(d21Accent)
                    ProgressView(value: Double(step), total: 3).tint(d21Accent)
                    Text(building.name).font(.footnote).foregroundStyle(.secondary)
                }
                if step == 1 {
                    Section("Was möchtest du hinzufügen?") {
                        ForEach(DeviceKind.allCases, id: \.self) { option in
                            Button { kind = option } label: { HStack { Label(option.title, systemImage: option.symbol); Spacer(); if kind == option { Image(systemName: "checkmark.circle.fill") } } }.foregroundStyle(kind == option ? d21Accent : .primary)
                        }
                    }
                    Section { Text("Du brauchst noch kein echtes Gerät. Beginne mit einer Simulation oder merke die spätere Anbindung vor.").foregroundStyle(.secondary) }
                } else if step == 2 {
                    Section("Name und Raum") {
                        TextField("Zum Beispiel Deckenlicht", text: $name).textInputAutocapitalization(.sentences)
                        TextField("Raum, zum Beispiel Besprechung", text: $room)
                        Text("Der Raumname ist zunächst eine freie Zuordnung, keine automatisch erkannte IFC-Verknüpfung.").font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("Wie möchtest du starten?") {
                        Toggle("Als Simulation ausprobieren", isOn: $simulation).tint(d21Accent)
                        if simulation { Text(kind.switchable ? "Ein und Aus ändern nur den simulierten Zustand auf dem Projektserver." : "Der Sensor wird als Simulation angelegt. Es werden keine Messwerte erfunden.").font(.footnote).foregroundStyle(.secondary) }
                        else { Picker("Spätere Anbindung", selection: $integration) { ForEach(DeviceIntegration.allCases, id: \.self) { Text($0.title).tag($0) } }; Text(integration.detail).font(.footnote).foregroundStyle(.secondary) }
                    }
                } else {
                    Section("Alles richtig?") {
                        LabeledContent("Gerät", value: cleanName)
                        LabeledContent("Typ", value: kind.title)
                        LabeledContent("Raum", value: room.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Ohne Raum" : room)
                        LabeledContent("Betriebsart", value: simulation ? "Simulation" : "Vorgemerkt")
                        if !simulation { LabeledContent("Anbindung", value: integration.title) }
                    }
                    Section { Label("Für Mitglieder dieses Gebäudes sichtbar", systemImage: "person.2"); Text("Das Gerät wird auf dem Projektserver gespeichert. Es wird kein echtes Gerät gekoppelt oder geschaltet.").font(.footnote).foregroundStyle(.secondary) }
                    if saved { Section { Label("Gerät gespeichert", systemImage: "checkmark.circle.fill").foregroundStyle(.green); Button("Fertig") { dismiss() } } }
                }
                if let problem { Section { Text(problem).foregroundStyle(.red); if submittedBody != nil { Text("Mit Erneut speichern wiederholst du dieselbe Anlage ohne Duplikat. Die Angaben bleiben bis zur Bestätigung gesperrt.").font(.footnote) } } }
                if !saved { Section { Button(saving ? "Wird gespeichert …" : step == 3 ? (submittedBody == nil ? "Gerät speichern" : "Erneut speichern") : "Weiter") {
                    if step < 3 { withAnimation { step += 1 } } else { Task { await save() } }
                }.disabled(saving || step == 2 && (cleanName.isEmpty || cleanName.count > 100 || room.count > 100)) } }
            }
            .navigationTitle(saved ? "Geschafft" : "Gerät hinzufügen").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(step > 1 && submittedBody == nil ? "Zurück" : "Schließen") { if step > 1 && submittedBody == nil { step -= 1 } else { dismiss() } }.disabled(saving) }
            }
            .interactiveDismissDisabled(saving)
        }
    }
    private func save() async {
        guard !saving && !saved else { return }; saving = true; defer { saving = false }
        if submittedBody == nil { submittedBody = ["name":cleanName,"room":room.trimmingCharacters(in: .whitespacesAndNewlines),"kind":kind.rawValue,"mode":simulation ? "simulation" : "planned","integration":simulation ? "none" : integration.rawValue,"request_key":requestKey.uuidString.lowercased()] }
        do { let _: BuildingDevice = try await account.request("buildings/\(building.id)/devices", method: "POST", body: submittedBody); saved = true; problem = nil }
        catch { problem = error.localizedDescription }
    }
}
