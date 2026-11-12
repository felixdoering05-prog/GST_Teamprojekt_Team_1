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
    let document_id: Int?
    let space_id: Int?
    let rgb: [Int]?
    let brightness: Int?
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
            Section("Gebäude auswählen") {
                ForEach(account.buildings) { building in
                    NavigationLink { BuildingDevicesView(building: building, account: account) } label: {
                        Label { VStack(alignment: .leading) { Text(building.name); Text(building.is_owner == false ? "Mit dir geteilt" : "Dein Gebäude").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "building.2") }
                    }
                }
                if account.buildings.isEmpty { ContentUnavailableView("Noch kein Gebäude", systemImage: "building.2", description: Text("Lege zuerst unter Gebäude eine Gebäudemappe an oder nimm eine Einladung an.")) }
            }
            Section { Text("Gebäudegeräte bleiben Simulationen oder Vorbereitungen und sind für Gebäudemitglieder sichtbar. Freigegebene echte Geräte kannst du in einer Gebäudemappe verbinden und zuordnen.").font(.footnote).foregroundStyle(.secondary) }
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
    @State private var lamps: [ConnectedLamp] = []
    @State private var selectedLamp: ConnectedLamp?
    @State private var selectedDevice: BuildingDevice?
    @State private var connecting = false
    @State private var room = "Alle Räume"
    @Environment(\.scenePhase) private var scenePhase
    private var rooms: [String] { Array(Set(devices.map(\.roomLabel) + lamps.map {$0.location?.room.isEmpty == false ? $0.location!.room : "Ohne Raum"})).sorted() }
    private var visible: [BuildingDevice] { devices.filter { room == "Alle Räume" || $0.roomLabel == room } }
    private var shownLamps: [ConnectedLamp] { lamps.filter { room == "Alle Räume" || ($0.location?.room.isEmpty == false ? $0.location!.room : "Ohne Raum") == room } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if let problem {
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.icloud").foregroundStyle(.orange)
                        Text(problem).font(.footnote); Spacer(minLength: 0)
                        Button("Neu laden") { Task { await reload() } }.font(.footnote.weight(.semibold)).disabled(loading || busy)
                    }.padding(14).d21Card(cornerRadius: 18)
                }
                if rooms.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(["Alle Räume"] + rooms, id: \.self) { name in
                                Button { room = name } label: {
                                    Text(name).font(.subheadline.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 8)
                                        .foregroundStyle(room == name ? .white : .primary)
                                        .background(room == name ? AnyShapeStyle(d21Accent) : AnyShapeStyle(Color(uiColor: .secondarySystemGroupedBackground)), in: Capsule())
                                }.buttonStyle(.plain).accessibilityAddTraits(room == name ? .isSelected : [])
                            }
                        }
                    }
                }
                if loading && !loaded { HStack(spacing: 12) { ProgressView(); Text("Geräte werden geladen …").foregroundStyle(.secondary) }.padding(18).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 20) }
                if !shownLamps.isEmpty {
                    Text("Licht").font(.title3.bold())
                    VStack(spacing: 12) { ForEach(shownLamps) { lamp in ConnectedLampCard(lamp: lamp, account: account, assign: { selectedLamp = lamp }, changed: { await reload() }) } }
                }
                if !visible.isEmpty {
                    Text("Vorgemerkte Geräte").font(.title3.bold())
                    VStack(spacing: 10) { ForEach(visible) { device in deviceRow(device) } }
                }
                if loaded && devices.isEmpty && lamps.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "lightbulb.2.fill").font(.system(size: 40)).foregroundStyle(d21Accent.gradient)
                        Text("Dein erstes Gerät").font(.title3.bold())
                        Text("Verbinde ein vorhandenes Gerät und ordne es deinem Gebäude und einem Raum zu.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button { connecting = true } label: { Label("Gerät verbinden", systemImage: "link") }.buttonStyle(.borderedProminent).tint(d21Accent)
                    }.padding(24).frame(maxWidth: .infinity).d21Card(cornerRadius: 24)
                }
                NavigationLink { IFCLibraryView(model: account, smartHome: true, buildingID: building.id) } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "cube.transparent").font(.body.weight(.semibold)).foregroundStyle(.indigo).frame(width: 40, height: 40).background(Color.indigo.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Raumlicht im 3D-Modell").font(.subheadline.weight(.semibold))
                            Text("Lampen einem IFC-Raum zuordnen und dort in der bestätigten Farbe sehen").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                    }.padding(14).d21Card(cornerRadius: 20)
                }.buttonStyle(BuildingTileButtonStyle()).foregroundStyle(.primary)
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Geräte").navigationBarTitleDisplayMode(.inline)
        .refreshable { if !busy { await reload() } }
        .sheet(isPresented: $adding, onDismiss: { Task { await reload() } }) { AddDeviceView(building: building, account: account) }
        .sheet(isPresented:$connecting,onDismiss:{Task{await reload()}}) { AvailableLampPicker(account:account,building:building,saved:{connecting=false}) }
        .sheet(item:$selectedLamp,onDismiss:{Task{await reload()}}) { lamp in NavigationStack { EquipmentAssignmentView(account:account,building:building,lamp:lamp,saved:{selectedLamp=nil}) } }
        .sheet(item:$selectedDevice,onDismiss:{Task{await reload()}}) { device in NavigationStack { EquipmentAssignmentView(account:account,building:building,device:device,saved:{selectedDevice=nil}) } }
        .task {
            await reload()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                if scenePhase == .active && !busy && !adding { await reload() }
            }
        }
    }
    private func deviceRow(_ device: BuildingDevice) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                Image(systemName: device.kind.symbol).font(.title3.weight(.semibold)).foregroundStyle(device.simulated && device.is_on ? .white : d21Accent)
                    .frame(width: 46, height: 46).background(device.simulated && device.is_on ? AnyShapeStyle(d21Accent) : AnyShapeStyle(d21Accent.opacity(0.12)), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(device.name).font(.headline)
                    Text(device.roomLabel + " · " + device.kind.title).font(.caption).foregroundStyle(.secondary)
                    Text(device.simulated ? "Simulation" : "Vorgemerkt · " + device.integration.title).font(.caption2.weight(.semibold)).foregroundStyle(device.simulated ? .orange : .secondary)
                }
                Spacer(minLength: 0)
                if device.simulated && device.kind.switchable {
                    Toggle("", isOn: Binding(get: { device.is_on }, set: { value in Task { await toggle(device, on: value) } })).labelsHidden().tint(d21Accent).disabled(busy || loading)
                        .accessibilityLabel(device.name + ", Simulation")
                }
                Menu { Button("Gebäude & Raum", systemImage: "building.2.crop.circle") { selectedDevice = device } } label: { Image(systemName: "ellipsis").foregroundStyle(.secondary).frame(width: 32, height: 32).contentShape(Rectangle()) }.disabled(busy)
            }
            if device.simulated && device.kind == .light { SimulatedLampColor(account: account, device: device, changed: { await reload() }) }
            else if !(device.simulated && device.kind.switchable) { Text(device.simulated ? "Keine echten Messwerte · Sensordarstellung vorbereitet" : "Noch nicht verbunden · kein Live-Status").font(.footnote).foregroundStyle(.secondary) }
        }.padding(16).d21Card(cornerRadius: 20)
    }
    private var header: some View {
        let on = lamps.filter { $0.available && $0.is_on == true }.count
        return VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(building.name).font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.75))
                    Text(lamps.count == 1 ? "1 Lampe" : "\(lamps.count) Lampen").font(.system(.title, design: .rounded, weight: .bold))
                }
                Spacer()
                Image(systemName: on > 0 ? "lightbulb.2.fill" : "lightbulb.2").font(.system(size: 34)).foregroundStyle(on > 0 ? Color.yellow : .white.opacity(0.6)).accessibilityHidden(true)
            }
            HStack {
                Label(on == 1 ? "1 an" : "\(on) an", systemImage: "power").font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 7).background(.white.opacity(0.16), in: Capsule())
                Spacer()
                Button { connecting = true } label: { Label("Verbinden", systemImage: "link").font(.subheadline.weight(.semibold)).padding(.horizontal, 14).frame(minHeight: 38).background(.white, in: Capsule()).foregroundStyle(Color(red: 0.07, green: 0.18, blue: 0.31)) }
                    .buttonStyle(BuildingTileButtonStyle()).disabled(busy).accessibilityLabel("Vorhandenes Gerät verbinden")
            }
        }
        .foregroundStyle(.white).padding(20)
        .background(LinearGradient(colors: [Color(red: 0.12, green: 0.12, blue: 0.30), Color(red: 0.05, green: 0.36, blue: 0.42)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
    private func reload() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { let items: [BuildingDevice] = try await account.request("buildings/\(building.id)/devices"); let real:[ConnectedLamp]=try await account.request("buildings/\(building.id)/lamps"); lamps=real; guard !Task.isCancelled else { return }; devices = items.filter { !$0.simulated }; loaded = true; problem = nil; if room != "Alle Räume" && !rooms.contains(room) { room = "Alle Räume" } }
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
