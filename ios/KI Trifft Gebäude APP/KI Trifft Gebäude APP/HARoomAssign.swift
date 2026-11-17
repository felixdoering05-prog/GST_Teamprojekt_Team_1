import SwiftUI

// Raumzuordnung für Home Assistant: Raum suchen, neu anlegen oder im Gebäudeplan (aus dem IFC-Modell) antippen.

struct HARoomTarget: Identifiable {
    enum Kind { case area, device, entity }
    let kind: Kind
    let key: String
    let title: String
    let current: String?          // eigener Raum (nicht geerbt)
    let inherited: String?        // Raum von Bereich/Gerät
    let inheritedFrom: String?    // z. B. „Bereich Wohnzimmer“
    let suggestion: String?
    var id: String { "\(kind)-\(key)" }
}

/// Auswahl eines Raums: Suche, Vorschlag, „wie Bereich“, neu anlegen, im Plan antippen.
struct HARoomChooser: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let target: HARoomTarget
    let rooms: [HARoom]
    let onPick: (String?) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var newName = ""
    @State private var askName = false
    @State private var busy = false
    @State private var problem: String?
    private func label(_ r: HARoom) -> String { r.room_code.isEmpty || r.room_code == r.name ? r.name : "\(r.name) · \(r.room_code)" }
    private var filtered: [HARoom] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? rooms : rooms.filter { $0.name.lowercased().contains(q) || $0.room_code.lowercased().contains(q) }
    }
    var body: some View {
        NavigationStack {
            List {
                if let problem { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                Section {
                    NavigationLink { HAPlanRoomPicker(building: building, account: account) { name, storey in Task { await pickPlanRoom(name: name, storey: storey) } } } label: {
                        Label("Im Gebäudeplan antippen", systemImage: "hand.tap")
                    }
                    Button { newName = search; askName = true } label: { Label("Neuen Raum anlegen", systemImage: "plus.square.on.square") }
                    if target.kind != .area, let inherited = target.inherited {
                        Button { Task { await choose(nil) } } label: {
                            Label("Wie \(target.inheritedFrom ?? "Bereich"): \(rooms.first { $0.id == inherited }.map(label) ?? "Raum")", systemImage: "arrow.uturn.backward")
                        }
                    } else if target.current != nil {
                        Button(role: .destructive) { Task { await choose(nil) } } label: { Label("Keinem Raum zuordnen", systemImage: "xmark.circle") }
                    }
                }
                if let s = target.suggestion, let room = rooms.first(where: { $0.id == s }), search.isEmpty {
                    Section("Vorschlag") {
                        Button { Task { await choose(room.id) } } label: { Label(label(room), systemImage: "sparkles").foregroundStyle(d21Accent) }
                    }
                }
                Section(rooms.isEmpty ? "Noch keine Räume" : "Räume") {
                    if rooms.isEmpty { Text("Lege einen Raum an oder tippe ihn im Gebäudeplan an.").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(filtered) { room in
                        Button { Task { await choose(room.id) } } label: {
                            HStack { Text(label(room)).foregroundStyle(.primary); Spacer(); if room.id == (target.current ?? target.inherited) { Image(systemName: "checkmark").foregroundStyle(d21Accent) } }
                        }
                    }
                }
            }
            .searchable(text: $search, prompt: "Raum oder Raumnummer")
            .disabled(busy)
            .navigationTitle(target.title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } }
            .alert("Neuer Raum", isPresented: $askName) {
                TextField("Name, z. B. Wohnzimmer", text: $newName)
                Button("Anlegen") { Task { await create(name: newName, code: "") } }
                Button("Abbrechen", role: .cancel) {}
            }
        }
    }
    private struct Created: Decodable { let id: String; let name: String; let room_code: String; let created: Bool }
    @MainActor private func create(name: String, code: String) async {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return }
        busy = true; defer { busy = false }
        do {
            let room: Created = try await account.request("buildings/\(building.id)/home-assistant/rooms", method: "POST", body: ["name": n, "room_code": code])
            await onPick(room.id); dismiss()
        } catch { problem = error.localizedDescription }
    }
    /// Raum aus dem Plan: vorhandenen Raum gleichen Namens nehmen, sonst anlegen (Geschoss als Raumnummer).
    @MainActor private func pickPlanRoom(name: String, storey: String) async {
        let norm = { (s: String) in s.lowercased().trimmingCharacters(in: .whitespaces) }
        if let hit = rooms.first(where: { norm($0.name) == norm(name) && ($0.room_code.isEmpty || norm($0.room_code) == norm(storey) || norm($0.room_code) == norm(name)) }) ?? (rooms.filter { norm($0.name) == norm(name) }.count == 1 ? rooms.first { norm($0.name) == norm(name) } : nil) {
            await choose(hit.id)
        } else {
            await create(name: name, code: storey)
        }
    }
    @MainActor private func choose(_ id: String?) async {
        busy = true; defer { busy = false }
        await onPick(id); dismiss()
    }
}

/// Grundriss aus dem IFC-Modell des Gebäudes: Raum antippen und übernehmen.
struct HAPlanRoomPicker: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let onPick: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var models: [BuildingDocument] = []
    @State private var selectedModel: Int?
    @State private var modelURL: URL?
    @State private var plan: LocatorModel?
    @State private var floorID: Int?
    @State private var picked: LocatorRoom?
    @State private var loading = false
    @State private var problem: String?
    private var floors: [(id: Int, name: String, base: Double)] { plan?.floors ?? [] }
    private var base: Double { floors.first { $0.id == floorID }?.base ?? 0 }
    var body: some View {
        List {
            if let problem { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
            if plan == nil {
                Section {
                    if models.isEmpty && !loading { Text("Für dieses Gebäude ist noch kein IFC-Modell hinterlegt. Erstelle eines aus einem Grundriss oder lade ein IFC hoch.").foregroundStyle(.secondary) }
                    if models.count > 1 { Picker("Modell", selection: $selectedModel) { ForEach(models) { Text($0.name).tag(Optional($0.id)) } } }
                    if loading { ProgressView("Räume werden aus dem Modell gelesen …") }
                }
            } else if let plan {
                Section {
                    if floors.count > 1 { Picker("Geschoss", selection: $floorID) { ForEach(floors, id: \.id) { Text($0.name).tag(Optional($0.id)) } }.pickerStyle(.segmented) }
                    FloorPlanView(rooms: plan.rooms.filter { $0.storey_id == floorID }, walls: plan.walls.filter { $0.min_y <= base + 0.3 && $0.max_y >= base + 0.3 },
                                  doors: plan.doors.filter { $0.min_y <= base + 0.3 && $0.max_y >= base + 0.3 }, highlight: picked?.id, you: nil, heading: nil, markers: [],
                                  tap: { p in picked = plan.rooms.first { $0.storey_id == floorID && $0.contains(p) } })
                        .frame(height: 380)
                    Text("Raum antippen. Mit zwei Fingern zoomen und verschieben.").font(.caption).foregroundStyle(.secondary)
                }
                if let picked {
                    Section {
                        Button { onPick(picked.name, floors.first { $0.id == picked.storey_id }?.name ?? ""); dismiss() } label: {
                            Label("„\(picked.name)“ übernehmen", systemImage: "checkmark.circle.fill").frame(maxWidth: .infinity)
                        }.buttonStyle(.borderedProminent).tint(d21Accent)
                    }
                }
            }
        }
        .navigationTitle("Raum im Plan").navigationBarTitleDisplayMode(.inline)
        .overlay { if let modelURL, plan == nil { IFCWebView(modelURL: modelURL, onRooms: receive).frame(width: 2, height: 2).opacity(0.01).allowsHitTesting(false) } }
        .task {
            do {
                let docs = try await account.documents(buildingID: building.id)
                models = docs.filter { $0.mime_type == "application/x-step" || $0.name.lowercased().hasSuffix(".ifc") }
                selectedModel = building.model_document_id.flatMap { id in models.contains { $0.id == id } ? id : nil } ?? models.first?.id
                await load()
            } catch { problem = error.localizedDescription }
        }
        .onChange(of: selectedModel) { _, _ in Task { await load() } }
        .onDisappear { if let modelURL { try? FileManager.default.removeItem(at: modelURL.deletingLastPathComponent()) } }
    }
    @MainActor private func load() async {
        guard let id = selectedModel, let doc = models.first(where: { $0.id == id }) else { return }
        loading = true; problem = nil; plan = nil; picked = nil
        do { modelURL = try await account.previewDocument(doc).url } catch { loading = false; problem = error.localizedDescription }
    }
    private func receive(_ data: Data) {
        loading = false
        guard let value = try? JSONDecoder().decode(LocatorModel.self, from: data), !value.rooms.isEmpty else { problem = "Im Modell wurden keine Räume gefunden."; return }
        plan = value; floorID = value.floors.first(where: { $0.base >= -0.5 })?.id ?? value.floors.first?.id
        if let modelURL { try? FileManager.default.removeItem(at: modelURL.deletingLastPathComponent()) }
        modelURL = nil
    }
}
