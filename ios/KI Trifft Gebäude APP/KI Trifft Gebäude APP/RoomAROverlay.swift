import SwiftUI
import ARKit
import SceneKit

// Futuristic AR presentation of SIMULATED room climate: holographic panels float above the centres
// of nearby rooms (placed through the plan calibration) and a HUD shows the current room with ring
// gauges. Everything is labelled "Simulation"; no values are measured or uploaded.

struct RoomARExperience: View {
    @ObservedObject var tracker: ARPositionTracker
    let calibration: PlanCalibration
    let rooms: [LocatorRoom]
    let floors: [(id: Int, name: String, base: Double)]
    let currentFloorID: Int?
    let currentRoom: LocatorRoom?
    let close: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var floor: (id: Int, name: String, base: Double)? { floors.first { $0.id == currentFloorID } }
    private var nearby: [LocatorRoom] {
        guard let floor, let p = tracker.position else { return [] }
        let me = calibration.model(CGPoint(x: Double(p.x), y: Double(p.z)))
        return rooms.filter { $0.storey_id == floor.id }
            .map { ($0, hypot($0.center.x - me.x, $0.center.y - me.y)) }
            .filter { $0.1 < 18 }.sorted { $0.1 < $1.1 }.prefix(14).map(\.0)
    }

    var body: some View {
        ZStack {
            HologramSceneView(session: tracker.session, calibration: calibration, rooms: nearby, floorBase: floor?.base ?? calibration.floorBase, highlight: currentRoom?.id, reduceMotion: reduceMotion)
                .ignoresSafeArea()
            LinearGradient(colors: [.black.opacity(0.45), .clear, .clear, .black.opacity(0.55)], startPoint: .top, endPoint: .bottom).ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("SIMULATION", systemImage: "testtube.2").font(.caption.weight(.heavy)).tracking(1.5)
                            .padding(.horizontal, 10).padding(.vertical, 5).background(Color.orange.opacity(0.85), in: Capsule()).foregroundStyle(.black)
                        Text(currentRoom?.name ?? "Außerhalb eines Raums").font(.system(.title3, design: .rounded, weight: .bold)).foregroundStyle(.white)
                        Text((floor?.name ?? "") + " · " + tracker.trackingNote).font(.caption).foregroundStyle(.white.opacity(0.75))
                    }
                    Spacer()
                    Button(action: close) { Image(systemName: "xmark").font(.headline.weight(.bold)).foregroundStyle(.white).frame(width: 44, height: 44).background(.ultraThinMaterial, in: Circle()) }
                        .accessibilityLabel("AR-Ansicht schließen")
                }.padding(.horizontal, 20).padding(.top, 8)
                Spacer()
                if let room = currentRoom {
                    TimelineView(.periodic(from: .now, by: 2)) { context in
                        let v = RoomClimateSim.values(room: room.id, at: context.date)
                        HStack(spacing: 14) {
                            HUDGauge(value: v.temperature, range: 16...28, text: v.temperature.formatted(.number.precision(.fractionLength(1))), unit: "°C", title: "Temperatur", color: .orange, reduceMotion: reduceMotion)
                            HUDGauge(value: v.co2, range: 400...1500, text: Int(v.co2).formatted(), unit: "ppm", title: "CO₂", color: v.co2 > 1000 ? .red : .mint, reduceMotion: reduceMotion)
                            HUDGauge(value: v.humidity, range: 20...70, text: Int(v.humidity).formatted(), unit: "%", title: "Feuchte", color: .cyan, reduceMotion: reduceMotion)
                        }
                        .padding(16)
                        .background(.ultraThinMaterial.opacity(0.9), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(LinearGradient(colors: [.cyan.opacity(0.8), .purple.opacity(0.5)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1))
                    }
                } else {
                    Text("Geh in einen Raum, um seine Werte zu sehen.").font(.subheadline).foregroundStyle(.white).padding(14).background(.ultraThinMaterial, in: Capsule())
                }
                Text("Simulierte Werte – keine Messung. Kamera wird nur auf dem iPhone ausgewertet.").font(.caption2).foregroundStyle(.white.opacity(0.7)).padding(.top, 10).padding(.bottom, 6)
            }.padding(.horizontal, 16)
        }
        .statusBarHidden()
    }
}

private struct HUDGauge: View {
    let value: Double
    let range: ClosedRange<Double>
    let text: String
    let unit: String
    let title: String
    let color: Color
    let reduceMotion: Bool
    private var fraction: Double { min(1, max(0, (value - range.lowerBound) / (range.upperBound - range.lowerBound))) }
    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.15), lineWidth: 7)
                Circle().trim(from: 0, to: fraction).stroke(AngularGradient(colors: [color.opacity(0.4), color], center: .center), style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90)).shadow(color: color.opacity(0.9), radius: 6)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 1.2), value: fraction)
                VStack(spacing: 0) {
                    Text(text).font(.system(.headline, design: .rounded, weight: .bold)).monospacedDigit().contentTransition(.numericText())
                    Text(unit).font(.caption2.weight(.semibold)).opacity(0.75)
                }.foregroundStyle(.white)
            }.frame(width: 84, height: 84)
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.85))
        }.frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine).accessibilityLabel("\(title) \(text) \(unit), Simulation")
    }
}

/// The holographic room panel rendered into a texture for SceneKit.
private struct HologramCard: View {
    let name: String
    let values: RoomClimateSim.Values
    let highlighted: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(name).font(.system(size: 26, weight: .bold, design: .rounded)).lineLimit(1)
                Spacer(minLength: 8)
                Text("SIM").font(.system(size: 15, weight: .heavy)).padding(.horizontal, 8).padding(.vertical, 3).background(Color.orange, in: Capsule()).foregroundStyle(.black)
            }
            HStack(spacing: 18) {
                metric("thermometer.medium", values.temperature.formatted(.number.precision(.fractionLength(1))) + "°", .orange)
                metric("aqi.medium", Int(values.co2).formatted(), values.co2 > 1000 ? .red : .mint)
                metric("humidity.fill", Int(values.humidity).formatted() + "%", .cyan)
            }
        }
        .foregroundStyle(.white)
        .padding(20)
        .frame(width: 420, height: 170, alignment: .leading)
        .background(LinearGradient(colors: [Color(red: 0.02, green: 0.15, blue: 0.25).opacity(0.82), Color(red: 0.12, green: 0.05, blue: 0.30).opacity(0.82)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(highlighted ? Color.yellow : Color.cyan.opacity(0.9), lineWidth: highlighted ? 4 : 2.5))
    }
    private func metric(_ symbol: String, _ text: String, _ color: Color) -> some View {
        HStack(spacing: 6) { Image(systemName: symbol).foregroundStyle(color); Text(text).font(.system(size: 28, weight: .bold, design: .rounded)).monospacedDigit() }
    }
}

private struct HologramSceneView: UIViewRepresentable {
    let session: ARSession
    let calibration: PlanCalibration
    let rooms: [LocatorRoom]
    let floorBase: Double
    let highlight: Int?
    let reduceMotion: Bool

    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = session
        view.scene = SCNScene()
        view.automaticallyUpdatesLighting = false
        view.rendersContinuously = true
        context.coordinator.root = view.scene.rootNode
        context.coordinator.start()
        return view
    }
    func updateUIView(_ uiView: ARSCNView, context: Context) {
        context.coordinator.update(rooms: rooms, calibration: calibration, floorBase: floorBase, highlight: highlight, reduceMotion: reduceMotion)
    }
    static func dismantleUIView(_ uiView: ARSCNView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor final class Coordinator {
        var root: SCNNode?
        private var nodes: [Int: (node: SCNNode, panel: SCNPlane, room: LocatorRoom)] = [:]
        private var highlight: Int?
        private var timer: Timer?

        func start() {
            weak let owner = self
            timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in Task { @MainActor in owner?.refreshTextures() } }
        }
        func stop() { timer?.invalidate(); timer = nil; nodes.values.forEach { $0.node.removeFromParentNode() }; nodes = [:] }

        func update(rooms: [LocatorRoom], calibration: PlanCalibration, floorBase: Double, highlight: Int?, reduceMotion: Bool) {
            guard let root else { return }
            let changedHighlight = highlight != self.highlight
            self.highlight = highlight
            let wanted = Set(rooms.map(\.id))
            for (id, entry) in nodes where !wanted.contains(id) { entry.node.removeFromParentNode(); nodes[id] = nil }
            // Panels sit ~1.75 m above the floor of the room's storey (calibration was taken at hand height ~1.3 m).
            let floorY = calibration.arFloorY - 1.3 + (floorBase - calibration.floorBase)
            for room in rooms {
                let p = calibration.ar(room.center)
                let position = SCNVector3(Float(p.x), Float(floorY + 1.75), Float(p.y))
                if let entry = nodes[room.id] {
                    let o = entry.node.position
                    if abs(o.x - position.x) > 0.15 || abs(o.z - position.z) > 0.15 || abs(o.y - position.y) > 0.3 { entry.node.position = position }
                    continue
                }
                let panel = SCNPlane(width: 0.84, height: 0.34)
                let material = SCNMaterial()
                material.lightingModel = .constant; material.isDoubleSided = true; material.writesToDepthBuffer = false
                material.diffuse.contents = texture(room, highlighted: room.id == highlight)
                panel.materials = [material]
                let node = SCNNode(geometry: panel)
                node.position = position
                node.constraints = [SCNBillboardConstraint()]
                // Light beam from the floor to the panel.
                let beam = SCNCylinder(radius: 0.012, height: 1.6)
                let beamMaterial = SCNMaterial(); beamMaterial.lightingModel = .constant
                beamMaterial.diffuse.contents = UIColor.cyan.withAlphaComponent(0.55); beamMaterial.emission.contents = UIColor.cyan
                beam.materials = [beamMaterial]
                let beamNode = SCNNode(geometry: beam); beamNode.position = SCNVector3(0, -0.97, 0)
                node.addChildNode(beamNode)
                if !reduceMotion {
                    let float = SCNAction.sequence([.moveBy(x: 0, y: 0.04, z: 0, duration: 1.6), .moveBy(x: 0, y: -0.04, z: 0, duration: 1.6)])
                    float.timingMode = .easeInEaseOut
                    node.runAction(.repeatForever(float))
                }
                node.opacity = 0
                node.runAction(.fadeIn(duration: reduceMotion ? 0 : 0.4))
                root.addChildNode(node)
                nodes[room.id] = (node, panel, room)
            }
            if changedHighlight { refreshTextures() }
        }

        func refreshTextures() {
            for entry in nodes.values { entry.panel.firstMaterial?.diffuse.contents = texture(entry.room, highlighted: entry.room.id == highlight) }
        }

        private func texture(_ room: LocatorRoom, highlighted: Bool) -> UIImage? {
            let renderer = ImageRenderer(content: HologramCard(name: room.shortName, values: RoomClimateSim.values(room: room.id), highlighted: highlighted))
            renderer.scale = 2
            return renderer.uiImage
        }
    }
}
