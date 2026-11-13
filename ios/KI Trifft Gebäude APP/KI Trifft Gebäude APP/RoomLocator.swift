import SwiftUI
import ARKit
import SceneKit
import Combine

// Indoor positioning prototype: ARKit world tracking (LiDAR-assisted where available) mapped onto the
// IfcSpace footprints of a chosen IFC model with a two-point calibration. Camera frames and positions
// are processed on the device only; nothing is uploaded.

struct LocatorRoom: Decodable, Identifiable {
    let id: Int
    let name: String
    let storey: String
    let storey_id: Int
    let min_y: Double
    let max_y: Double
    let tris: [Double]

    func contains(_ p: CGPoint) -> Bool {
        var i = 0
        while i + 5 < tris.count {
            if Self.inside(p, CGPoint(x: tris[i], y: tris[i + 1]), CGPoint(x: tris[i + 2], y: tris[i + 3]), CGPoint(x: tris[i + 4], y: tris[i + 5])) { return true }
            i += 6
        }
        return false
    }
    var center: CGPoint {
        var x = 0.0, y = 0.0, n = 0.0, i = 0
        while i + 1 < tris.count { x += tris[i]; y += tris[i + 1]; n += 1; i += 2 }
        return n > 0 ? CGPoint(x: x / n, y: y / n) : .zero
    }
    var shortName: String { name.count > 22 ? String(name.prefix(21)) + "…" : name }
    private static func inside(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint, _ c: CGPoint) -> Bool {
        func s(_ p1: CGPoint, _ p2: CGPoint, _ p3: CGPoint) -> CGFloat { (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y) }
        let d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a)
        let neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0
        return !(neg && pos)
    }
}

struct LocatorWall: Decodable { let min_y: Double; let max_y: Double; let tris: [Double] }
struct LocatorDoor: Decodable { let x: Double; let z: Double; let w: Double; let min_y: Double; let max_y: Double
    var point: CGPoint { CGPoint(x: x, y: z) }
}

struct LocatorModel: Decodable {
    struct Storey: Decodable { let id: Int; let name: String }
    let rooms: [LocatorRoom]
    let walls: [LocatorWall]
    let doors: [LocatorDoor]
    let storeys: [Storey]
    let truncated: Bool
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        rooms = try c.decode([LocatorRoom].self, forKey: .rooms)
        walls = try c.decodeIfPresent([LocatorWall].self, forKey: .walls) ?? []
        doors = try c.decodeIfPresent([LocatorDoor].self, forKey: .doors) ?? []
        storeys = try c.decode([Storey].self, forKey: .storeys)
        truncated = try c.decode(Bool.self, forKey: .truncated)
    }
    private enum CodingKeys: String, CodingKey { case rooms, walls, doors, storeys, truncated }

    /// Storeys that actually contain rooms, ordered by floor height.
    var floors: [(id: Int, name: String, base: Double)] {
        Dictionary(grouping: rooms, by: \.storey_id)
            .map { (id: $0.key, name: $0.value.first?.storey.isEmpty == false ? $0.value.first!.storey : "Ohne Geschoss", base: $0.value.map(\.min_y).min() ?? 0) }
            .sorted { $0.base < $1.base }
    }
}

/// Runs ARKit and publishes the device position (metres, AR world) and heading.
@MainActor final class ARPositionTracker: NSObject, ObservableObject, ARSessionDelegate {
    let session = ARSession()
    @Published var position: SIMD3<Float>?
    @Published var heading: Float = 0
    @Published var trackingNote = "Kamera wird gestartet …"
    @Published var lidar = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    private var lastPublish = Date.distantPast

    func start() {
        guard ARWorldTrackingConfiguration.isSupported else { trackingNote = "Dieses Gerät unterstützt keine AR-Ortung."; return }
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        if lidar { configuration.sceneReconstruction = .mesh }
        session.delegate = self
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }
    func stop() { session.pause(); position = nil }

    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let transform = frame.camera.transform
        let state = frame.camera.trackingState
        let p = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        // Camera looks along -Z; project onto the floor plane for the heading.
        let forward = SIMD2<Float>(-transform.columns.2.x, -transform.columns.2.z)
        Task { @MainActor in
            guard Date().timeIntervalSince(self.lastPublish) > 0.08 else { return }
            self.lastPublish = Date()
            self.position = p
            if simd_length(forward) > 0.1 { self.heading = atan2(forward.y, forward.x) }
            switch state {
            case .normal: self.trackingNote = self.lidar ? "LiDAR-Ortung aktiv" : "Kamera-Ortung aktiv"
            case .notAvailable: self.trackingNote = "Ortung nicht verfügbar"
            case .limited(let reason):
                switch reason {
                case .excessiveMotion: self.trackingNote = "Langsamer bewegen"
                case .insufficientFeatures: self.trackingNote = "Mehr Umgebung zeigen (Wände, Möbel)"
                case .initializing: self.trackingNote = "Ortung startet – Handy langsam schwenken"
                case .relocalizing: self.trackingNote = "Ortung wird wiederhergestellt"
                @unknown default: self.trackingNote = "Ortung eingeschränkt"
                }
            }
        }
    }
}

/// Rotation + translation from AR floor coordinates (x, z) to model plan coordinates (x, z).
struct PlanCalibration {
    let arA: CGPoint, modelA: CGPoint, arB: CGPoint, modelB: CGPoint
    let arFloorY: Double
    let floorBase: Double
    var angle: Double { atan2(Double(modelB.y - modelA.y), Double(modelB.x - modelA.x)) - atan2(Double(arB.y - arA.y), Double(arB.x - arA.x)) }
    /// Distance ratio between model and real world; ~1 for a correctly scaled model in metres.
    var scaleCheck: Double { Double(hypot(modelB.x - modelA.x, modelB.y - modelA.y) / max(hypot(arB.x - arA.x, arB.y - arA.y), 0.01)) }
    func model(_ ar: CGPoint) -> CGPoint {
        let c = cos(angle), s = sin(angle)
        // Fit through the midpoint of both pairs so a slightly off tap is spread over both ends.
        let arM = CGPoint(x: (arA.x + arB.x) / 2, y: (arA.y + arB.y) / 2), mM = CGPoint(x: (modelA.x + modelB.x) / 2, y: (modelA.y + modelB.y) / 2)
        let dx = Double(ar.x - arM.x), dy = Double(ar.y - arM.y)
        return CGPoint(x: Double(mM.x) + c * dx - s * dy, y: Double(mM.y) + s * dx + c * dy)
    }
    func modelHeading(_ arHeading: Float) -> Double { Double(arHeading) + angle }
}

struct RoomLocatorView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    @StateObject private var tracker = ARPositionTracker()
    @State private var models: [BuildingDocument] = []
    @State private var selectedModel: Int?
    @State private var modelURL: URL?
    @State private var plan: LocatorModel?
    @State private var loading = false
    @State private var problem: String?
    @State private var floorID: Int?
    @State private var pointA: (ar: CGPoint, model: CGPoint, y: Double)?
    @State private var calibration: PlanCalibration?
    @State private var lamps: [ConnectedLamp] = []
    @State private var devices: [BuildingDevice] = []
    @State private var running = false
    @State private var snapNote: String?
    @Environment(\.scenePhase) private var scenePhase

    private var floors: [(id: Int, name: String, base: Double)] { plan?.floors ?? [] }
    private var arPoint: CGPoint? { tracker.position.map { CGPoint(x: Double($0.x), y: Double($0.z)) } }
    private var currentFloor: (id: Int, name: String, base: Double)? {
        guard let calibration, let y = tracker.position?.y else { return floors.first { $0.id == floorID } }
        let height = calibration.floorBase + Double(y) - calibration.arFloorY
        return floors.last { $0.base <= height + 0.8 } ?? floors.first
    }
    private var modelPoint: CGPoint? { calibration.flatMap { c in arPoint.map { c.model($0) } } }
    private var currentRoom: LocatorRoom? {
        guard let p = modelPoint, let floor = currentFloor else { return nil }
        return plan?.rooms.first { $0.storey_id == floor.id && $0.contains(p) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if running { cameraCard }
                if plan == nil { setupCard } else { planCard; if calibration != nil { roomCard } }
                if let problem { Label(problem, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.orange).padding(14).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 18) }
                Label("Kamera und LiDAR werden nur auf dem iPhone ausgewertet. Es werden keine Bilder oder Positionen gespeichert oder hochgeladen.", systemImage: "lock.shield").font(.caption).foregroundStyle(.secondary)
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Wo bin ich?").navigationBarTitleDisplayMode(.inline)
        .overlay { if let modelURL, plan == nil { IFCWebView(modelURL: modelURL, onRooms: receive).frame(width: 2, height: 2).opacity(0.01).allowsHitTesting(false) } }
        .task { await loadModels() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { tracker.stop(); running = false } }
        .onDisappear { tracker.stop(); if let modelURL { try? FileManager.default.removeItem(at: modelURL.deletingLastPathComponent()) } }
    }

    // MARK: Setup

    private var setupCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Image(systemName: "location.viewfinder").font(.title2.weight(.semibold)).foregroundStyle(.white).frame(width: 52, height: 52).background(d21Accent.gradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Raum per LiDAR erkennen").font(.headline)
                    Text(tracker.lidar ? "LiDAR verfügbar" : "Ohne LiDAR – Kamera-Ortung, etwas ungenauer").font(.caption).foregroundStyle(.secondary)
                }
            }
            if models.isEmpty && !loading { Text("Für dieses Gebäude ist noch kein IFC-Modell hinterlegt.").font(.subheadline).foregroundStyle(.secondary) }
            if !models.isEmpty {
                Picker("IFC-Modell", selection: $selectedModel) { ForEach(models) { Text($0.name).tag(Optional($0.id)) } }.pickerStyle(.menu).tint(d21Accent)
                Button { Task { await prepare() } } label: {
                    Label(loading ? "Räume werden gelesen …" : "Modell laden", systemImage: loading ? "hourglass" : "cube.transparent").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).tint(d21Accent).disabled(loading || selectedModel == nil)
            }
            if loading { ProgressView().frame(maxWidth: .infinity) }
        }.padding(16).d21Card(cornerRadius: 22)
    }

    private func loadModels() async {
        do {
            let docs = try await account.documents(buildingID: building.id)
            models = docs.filter { $0.mime_type == "application/x-step" || $0.name.lowercased().hasSuffix(".ifc") }
            selectedModel = building.model_document_id.flatMap { id in models.contains { $0.id == id } ? id : nil } ?? models.first?.id
            lamps = (try? await account.request("buildings/\(building.id)/lamps")) ?? []
            devices = (try? await account.request("buildings/\(building.id)/devices")) ?? []
        } catch { problem = error.localizedDescription }
    }

    private func prepare() async {
        guard let id = selectedModel, let document = models.first(where: { $0.id == id }) else { return }
        loading = true; problem = nil; plan = nil
        do { modelURL = try await account.previewDocument(document).url }
        catch { loading = false; problem = error.localizedDescription }
    }

    private func receive(_ data: Data) {
        loading = false
        do {
            let value = try JSONDecoder().decode(LocatorModel.self, from: data)
            guard !value.rooms.isEmpty else { problem = "Im Modell wurden keine Räume (IfcSpace) mit Grundriss gefunden. Beim Revit-Export bitte Räume einschließen."; return }
            plan = value; floorID = value.floors.first(where: { $0.base >= -0.5 })?.id ?? value.floors.first?.id
            if let modelURL { try? FileManager.default.removeItem(at: modelURL.deletingLastPathComponent()) }
            modelURL = nil
            tracker.start(); running = true
        } catch { problem = "Die Räume konnten nicht gelesen werden." }
    }

    // MARK: Camera + plan

    private var cameraCard: some View {
        ZStack(alignment: .bottomLeading) {
            ARCameraPreview(session: tracker.session).frame(height: 150).clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            Label(tracker.trackingNote, systemImage: tracker.lidar ? "sensor.tag.radiowaves.forward" : "camera").font(.caption.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 6).background(.ultraThinMaterial, in: Capsule()).padding(10)
        }
    }

    private var planCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(calibration == nil ? "Einmal ausrichten" : (currentFloor?.name ?? "Grundriss")).font(.headline)
                Spacer()
                if calibration == nil {
                    Picker("Geschoss", selection: $floorID) { ForEach(floors, id: \.id) { Text($0.name).tag(Optional($0.id)) } }.pickerStyle(.menu).tint(d21Accent)
                } else {
                    Button("Neu ausrichten", systemImage: "scope") { calibration = nil; pointA = nil; snapNote = nil }.font(.caption.weight(.semibold))
                }
            }
            if calibration == nil {
                Text(pointA == nil
                     ? "1. Stell dich an eine eindeutige Stelle, z. B. in eine Türöffnung, und tippe genau diese Stelle im Grundriss an."
                     : "2. Geh 4–8 Meter geradeaus zu einer zweiten eindeutigen Stelle und tippe sie an.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            FloorPlanView(rooms: floorRooms, walls: floorWalls, doors: floorDoors, highlight: currentRoom?.id, you: modelPoint, heading: youHeading, markers: markers, tap: planTap)
                .frame(height: 420)
            Text(calibration == nil ? "Mit zwei Fingern zoomen und verschieben. Ein Tipp nahe einer Tür (orange) rastet in der Türmitte ein." : "Mit zwei Fingern zoomen und verschieben.")
                .font(.caption2).foregroundStyle(.secondary)
            if let snapNote { Label(snapNote, systemImage: "scope").font(.caption.weight(.semibold)).foregroundStyle(d21Accent) }
            if let calibration, abs(calibration.scaleCheck - 1) > 0.25 {
                Label("Die gelaufene Strecke passt nicht zum Abstand im Plan (Faktor \(calibration.scaleCheck.formatted(.number.precision(.fractionLength(2))))). Bitte neu ausrichten und die Punkte genauer antippen.", systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange)
            }
        }.padding(16).d21Card(cornerRadius: 22)
    }

    private var floorRooms: [LocatorRoom] {
        let id: Int? = currentFloor?.id ?? floorID
        return (plan?.rooms ?? []).filter { $0.storey_id == id }
    }
    private var floorBase: Double { (currentFloor ?? floors.first { $0.id == floorID })?.base ?? 0 }
    private var floorWalls: [LocatorWall] { let y = floorBase + 0.3; return (plan?.walls ?? []).filter { $0.min_y <= y && $0.max_y >= y } }
    private var floorDoors: [LocatorDoor] { let y = floorBase + 0.3; return (plan?.doors ?? []).filter { $0.min_y <= y && $0.max_y >= y } }
    private var youHeading: Double? {
        guard let calibration else { return nil }
        return calibration.modelHeading(tracker.heading)
    }
    private var markers: [CGPoint] {
        guard let a = pointA else { return [] }
        return [a.model]
    }
    private var planTap: ((CGPoint) -> Void)? {
        guard calibration == nil else { return nil }
        return { point in calibrate(point) }
    }

    private func calibrate(_ tapped: CGPoint) {
        var model = tapped
        if let door = floorDoors.min(by: { hypot($0.x - tapped.x, $0.z - tapped.y) < hypot($1.x - tapped.x, $1.z - tapped.y) }), hypot(door.x - tapped.x, door.z - tapped.y) < 1.2 {
            model = door.point; snapNote = "In der Türmitte eingerastet"
        } else { snapNote = nil }
        guard let ar = arPoint, let y = tracker.position?.y, let floor = floors.first(where: { $0.id == floorID }) else { problem = "Die Ortung läuft noch nicht. Handy kurz langsam schwenken."; return }
        problem = nil
        if let a = pointA {
            guard hypot(ar.x - a.ar.x, ar.y - a.ar.y) > 2 else { problem = "Bitte mindestens 2 Meter vom ersten Punkt entfernt antippen."; return }
            calibration = PlanCalibration(arA: a.ar, modelA: a.model, arB: ar, modelB: model, arFloorY: a.y, floorBase: floor.base)
            pointA = nil
        } else { pointA = (ar, model, Double(y)) }
    }

    // MARK: Room data

    private var roomCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: currentRoom == nil ? "questionmark.circle" : "door.left.hand.open").font(.title3.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 44, height: 44).background((currentRoom == nil ? Color.gray : d21Accent).gradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(currentRoom?.name ?? "Außerhalb eines Raums").font(.headline)
                    Text(currentFloor?.name ?? "").font(.caption).foregroundStyle(.secondary)
                }
            }
            if let room = currentRoom {
                let roomLamps = lamps.filter { $0.location?.space_id == room.id }
                let roomDevices = devices.filter { $0.space_id == room.id }
                if roomLamps.isEmpty && roomDevices.isEmpty {
                    Text("Diesem Raum sind noch keine Geräte zugeordnet. Unter Geräte → „Gebäude & Raum“ kannst du Lampen diesem IFC-Raum zuordnen.").font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(roomLamps) { lamp in ConnectedLampCard(lamp: lamp, account: account, assign: {}, changed: { lamps = (try? await account.request("buildings/\(building.id)/lamps")) ?? lamps }) }
                ForEach(roomDevices) { device in Label(device.name + " · " + device.kind.title, systemImage: device.kind.symbol).font(.subheadline) }
                SimulatedRoomValues(room: room)
            }
        }.padding(16).d21Card(cornerRadius: 22)
    }
}

/// Clearly labelled simulated room climate, deterministic per room (no measurement).
private struct SimulatedRoomValues: View {
    let room: LocatorRoom
    private func value(_ salt: Int, _ low: Double, _ high: Double) -> Double {
        var h = UInt64(truncatingIfNeeded: room.id &* 2_654_435_761 &+ salt &* 40_503)
        h ^= h >> 13; h = h &* 0x5bd1e995; h ^= h >> 15
        return low + Double(h % 1000) / 1000 * (high - low)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Simulation · keine Messwerte", systemImage: "testtube.2").font(.caption.weight(.bold)).foregroundStyle(.orange)
            HStack(spacing: 10) {
                tile("thermometer.medium", value(1, 20.5, 23.5).formatted(.number.precision(.fractionLength(1))) + " °C", "Temperatur")
                tile("aqi.medium", Int(value(2, 450, 1100)).formatted() + " ppm", "CO₂")
                tile("humidity", Int(value(3, 38, 56)).formatted() + " %", "Feuchte")
            }
        }
    }
    private func tile(_ symbol: String, _ text: String, _ title: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: symbol).foregroundStyle(d21Accent)
            Text(text).font(.subheadline.weight(.bold)).monospacedDigit()
            Text(title).font(.caption2).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color(uiColor: .tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Top-down floor plan of one storey (model x/z) with walls, doors, live position and calibration taps.
/// Pinch to zoom and drag to pan; taps are mapped back through the current zoom.
private struct FloorPlanView: View {
    let rooms: [LocatorRoom]
    let walls: [LocatorWall]
    let doors: [LocatorDoor]
    let highlight: Int?
    let you: CGPoint?
    let heading: Double?
    let markers: [CGPoint]
    let tap: ((CGPoint) -> Void)?
    @State private var zoom: CGFloat = 1
    @State private var pan: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1
    @GestureState private var drag: CGSize = .zero

    private var bounds: CGRect {
        var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
        func add(_ t: [Double]) { var i = 0; while i + 1 < t.count { minX = min(minX, t[i]); maxX = max(maxX, t[i]); minY = min(minY, t[i + 1]); maxY = max(maxY, t[i + 1]); i += 2 } }
        rooms.forEach { add($0.tris) }; walls.forEach { add($0.tris) }
        guard minX.isFinite else { return CGRect(x: 0, y: 0, width: 10, height: 10) }
        return CGRect(x: minX - 1, y: minY - 1, width: maxX - minX + 2, height: maxY - minY + 2)
    }

    private func path(_ t: [Double], _ map: (CGPoint) -> CGPoint) -> Path {
        var path = Path(); var i = 0
        while i + 5 < t.count {
            path.move(to: map(CGPoint(x: t[i], y: t[i + 1])))
            path.addLine(to: map(CGPoint(x: t[i + 2], y: t[i + 3])))
            path.addLine(to: map(CGPoint(x: t[i + 4], y: t[i + 5])))
            path.closeSubpath(); i += 6
        }
        return path
    }

    var body: some View {
        GeometryReader { geo in
            let b = bounds, fit = min(geo.size.width / b.width, geo.size.height / b.height)
            let z = max(1, min(zoom * pinch, 12)), scale = fit * z
            let ox = (geo.size.width - b.width * fit) / 2 * z + pan.width + drag.width - (z - 1) * geo.size.width / 2
            let oy = (geo.size.height - b.height * fit) / 2 * z + pan.height + drag.height - (z - 1) * geo.size.height / 2
            let toView = { (p: CGPoint) in CGPoint(x: ox + (p.x - b.minX) * scale, y: oy + (p.y - b.minY) * scale) }
            let toModel = { (v: CGPoint) in CGPoint(x: (v.x - ox) / scale + b.minX, y: (v.y - oy) / scale + b.minY) }
            ZStack {
                Canvas { context, _ in
                    for room in rooms {
                        let p = path(room.tris, toView), active = room.id == highlight
                        context.fill(p, with: .color(active ? d21Accent.opacity(0.42) : d21Accent.opacity(0.13)))
                    }
                    for wall in walls { context.fill(path(wall.tris, toView), with: .color(Color.primary.opacity(0.78))) }
                    let doorSize = max(5, min(12, scale * 0.45))
                    for door in doors {
                        let p = toView(door.point)
                        context.fill(Path(ellipseIn: CGRect(x: p.x - doorSize / 2, y: p.y - doorSize / 2, width: doorSize, height: doorSize)), with: .color(.orange.opacity(0.9)))
                    }
                    if scale > 7 {
                        for room in rooms { context.draw(Text(room.shortName).font(.system(size: min(13, max(8, scale * 0.35)), weight: room.id == highlight ? .bold : .regular)).foregroundStyle(.secondary), at: toView(room.center)) }
                    }
                    for marker in markers {
                        let p = toView(marker)
                        context.fill(Path(ellipseIn: CGRect(x: p.x - 9, y: p.y - 9, width: 18, height: 18)), with: .color(d21Accent))
                        context.draw(Text("A").font(.caption.bold()).foregroundStyle(.white), at: p)
                    }
                }
                if let you {
                    let p = toView(you)
                    ZStack {
                        Circle().fill(Color.blue.opacity(0.18)).frame(width: 36, height: 36)
                        if let heading { Image(systemName: "location.north.fill").font(.system(size: 17, weight: .bold)).foregroundStyle(.blue).rotationEffect(.radians(heading + .pi / 2)) }
                        else { Circle().fill(.blue).frame(width: 12, height: 12) }
                    }.position(p).animation(.easeOut(duration: 0.15), value: p)
                }
            }
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { value in tap?(toModel(value.location)) }, including: tap == nil ? .none : .all)
            .simultaneousGesture(MagnifyGesture().updating($pinch) { value, state, _ in state = value.magnification }.onEnded { value in zoom = max(1, min(zoom * value.magnification, 12)); if zoom == 1 { pan = .zero } })
            .simultaneousGesture(DragGesture(minimumDistance: 12).updating($drag) { value, state, _ in if z > 1 { state = value.translation } }.onEnded { value in if z > 1 { pan.width += value.translation.width; pan.height += value.translation.height } })
            .overlay(alignment: .topTrailing) {
                if z > 1.01 {
                    Button { withAnimation(.easeOut(duration: 0.2)) { zoom = 1; pan = .zero } } label: { Image(systemName: "arrow.down.right.and.arrow.up.left").font(.caption.weight(.bold)).padding(8).background(.regularMaterial, in: Circle()) }
                        .buttonStyle(.plain).padding(8).accessibilityLabel("Zoom zurücksetzen")
                }
            }
            .accessibilityLabel(highlight.flatMap { id in rooms.first { $0.id == id }?.name }.map { "Grundriss, du bist in \($0)" } ?? "Grundriss")
        }
        .background(Color(uiColor: .tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct ARCameraPreview: UIViewRepresentable {
    let session: ARSession
    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = session
        view.automaticallyUpdatesLighting = false
        view.scene = SCNScene()
        return view
    }
    func updateUIView(_ uiView: ARSCNView, context: Context) {}
}
