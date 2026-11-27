import SwiftUI

// WLAN-Präsenz mit RuView (#270, #271), experimentell und nur nach Opt-in.
// ESP32-Knoten schätzen über WLAN-Signale Anwesenheit, Bewegung, Personenzahl
// und Atemfrequenz. Die App zeigt nur die aggregierten Werte vom Server.
// Brücken und Schlüssel werden weiterhin im Web eingerichtet.

struct RuViewNode: Decodable, Identifiable {
    let bridge_id: Int
    let node_id: Int
    let room_id: String?
    let room: String?
    let presence: Bool
    let motion: Double
    let persons: Int
    let breathing_bpm: Double?
    let rssi: Int?
    let updated_at: String
    let stale: Bool
    var id: String { "\(bridge_id)-\(node_id)" }
}
struct RuViewOccupancy: Decodable, Identifiable {
    let room_id: String?
    let room: String
    let nodes: Int
    let presence: Bool
    let persons: Int
    let stale: Bool
    var id: String { room_id ?? "label:" + room }
}
struct RuViewState: Decodable {
    let enabled: Bool
    let nodes: [RuViewNode]
    var rooms: [NativeScheduleOption]? = nil
    var occupancy: [RuViewOccupancy]? = nil
}

/// Schalter im Profil: gilt für eigene Gebäude, standardmäßig aus.
struct RuViewSettingSection: View {
    @ObservedObject var account: AccountModel
    @State private var saving = false
    @State private var problem: String?
    var body: some View {
        Section {
            Toggle(isOn: Binding(get: { account.ruviewEnabled }, set: { value in
                Task { saving = true; defer { saving = false }; do { try await account.saveRuview(value); problem = nil } catch { problem = error.localizedDescription } }
            })) { Label("WLAN-Präsenz (RuView)", systemImage: "wifi") }.disabled(saving)
            if let problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
        } header: { Text("Experimentell") } footer: {
            Text("ESP32-Knoten schätzen über WLAN, ob jemand im Raum ist. Gilt für deine eigenen Gebäude. Gespeichert werden nur zusammengefasste Werte, sie werden nach 24 Stunden gelöscht. Schätzung, kein Medizinprodukt.")
        }
    }
}

struct RuViewPresenceView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @State private var state: RuViewState?
    @State private var problem: String?
    @State private var assigning: RuViewNode?

    var body: some View {
        List {
            if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            if let state {
                if !state.enabled {
                    Section {
                        Label("WLAN-Präsenz ist für dieses Gebäude aus.", systemImage: "wifi.slash").font(.headline)
                        Text("Die Eigentümerin oder der Eigentümer schaltet sie im Profil unter „WLAN-Präsenz (RuView)“ ein. Die Brücke für die ESP32-Knoten wird im Web unter Sensorik eingerichtet.").font(.footnote).foregroundStyle(.secondary)
                    }
                } else if state.nodes.isEmpty {
                    Section {
                        Text("Noch keine Knoten gemeldet. Richte im Web unter Sensorik → WLAN-Präsenz eine Brücke ein und starte sie im Heimnetz.").foregroundStyle(.secondary)
                    }
                } else {
                    if let occupancy = state.occupancy, !occupancy.isEmpty {
                        Section("Personen je Raum") {
                            ForEach(occupancy) { room in
                                HStack {
                                    Label(room.room, systemImage: room.presence ? "person.fill" : "person")
                                    Spacer()
                                    Text(room.stale ? tr("veraltet") : room.presence ? tr("≈ \(room.persons) Personen") : tr("leer"))
                                        .foregroundStyle(room.stale ? .orange : room.presence ? d21Accent : .secondary)
                                }
                            }
                        }
                    }
                    Section("Knoten") { ForEach(state.nodes) { node in nodeRow(node) } }
                }
                Section { Text("Schätzung aus WLAN-Signalen, kein Medizinprodukt. Werte älter als 60 Sekunden gelten als veraltet.").font(.footnote).foregroundStyle(.secondary) }
            } else if problem == nil {
                Section { ProgressView("WLAN-Präsenz wird geladen …") }
            }
        }
        .refreshable { await load() }
        .task {
            // Die Brücke meldet alle 10 Sekunden; so lange die Ansicht offen ist, mitlesen.
            while !Task.isCancelled { await load(); try? await Task.sleep(for: .seconds(10)) }
        }
        .confirmationDialog("Raum für Knoten \(assigning?.node_id ?? 0)", isPresented: Binding(get: { assigning != nil }, set: { if !$0 { assigning = nil } }), titleVisibility: .visible, presenting: assigning) { node in
            ForEach(state?.rooms ?? []) { room in Button(room.name) { Task { await assign(node, roomID: room.id) } } }
            Button("Keine Zuordnung", role: .destructive) { Task { await assign(node, roomID: nil) } }
        }
    }

    private func nodeRow(_ node: RuViewNode) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: node.stale ? "wifi.exclamationmark" : node.presence ? "figure.stand" : "wifi").foregroundStyle(node.stale ? .orange : d21Accent)
                Text(node.room ?? tr("Knoten \(node.node_id)")).font(.headline)
                Spacer()
                if node.stale { Text("veraltet").font(.caption.weight(.semibold)).foregroundStyle(.orange) }
            }
            LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 4) {
                Label(node.presence ? tr("≈ \(node.persons) Personen") : tr("niemand"), systemImage: "person.2").lineLimit(1)
                Label(node.motion > 0.5 ? tr("Bewegung") : tr("ruhig"), systemImage: "figure.walk.motion").lineLimit(1)
                if let bpm = node.breathing_bpm { Label("\(Int(bpm.rounded())) /min", systemImage: "lungs").lineLimit(1) }
                if let rssi = node.rssi { Label("\(rssi) dBm", systemImage: "antenna.radiowaves.left.and.right").lineLimit(1) }
            }.font(.caption).foregroundStyle(.secondary)
            HStack {
                Text(tr("Knoten \(node.node_id)")).font(.caption2).foregroundStyle(.tertiary)
                Spacer()
                if !(state?.rooms ?? []).isEmpty { Button(node.room_id == nil ? "Raum zuordnen" : "Raum ändern") { assigning = node }.font(.caption).buttonStyle(.borderless) }
            }
        }.padding(.vertical, 4)
    }

    private func load() async {
        do { state = try await account.request("buildings/\(building.id)/ruview"); problem = nil }
        catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
    private func assign(_ node: RuViewNode, roomID: String?) async {
        assigning = nil
        do {
            let _: RuViewNode = try await account.request("buildings/\(building.id)/ruview/\(node.bridge_id)/nodes/\(node.node_id)", method: "PUT", body: ["room_id": roomID ?? NSNull()])
            await load()
        } catch { problem = error.localizedDescription }
    }
}
