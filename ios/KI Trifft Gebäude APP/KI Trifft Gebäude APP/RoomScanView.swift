import SwiftUI
import RoomPlan
import simd
import Combine

// LiDAR room scan with Apple RoomPlan. Rooms are scanned one after another in the same AR session,
// merged with StructureBuilder and written as an IFC4 draft (RoomScanIFC). Scanning happens on the
// device; only the resulting IFC file is uploaded when the person adds it to the building.

struct RoomScanView: View {
    let buildingName: String
    /// Receives the IFC file data and a file name; returns when the file has been handed over.
    let completion: (Data, String) async -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var scanner = RoomScanController()
    @State private var storeyName = "Erdgeschoss"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                RoomCaptureContainer(controller: scanner).ignoresSafeArea()
                controls
            }
            .navigationTitle(scanner.title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { scanner.cancel(); dismiss() }.disabled(saving) } }
            .onDisappear { scanner.cancel() }
            .interactiveDismissDisabled(scanner.rooms.count > 0 || scanner.scanning)
        }
    }

    @ViewBuilder private var controls: some View {
        VStack(spacing: 12) {
            if let problem = scanner.problem {
                Label(problem, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.orange)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            if scanner.scanning {
                Button { scanner.finishRoom() } label: { Label("Raum fertig", systemImage: "checkmark.circle.fill").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).tint(d21Accent).controlSize(.large)
                Text("Langsam an den Wänden entlang schwenken, Türen und Fenster einmal ins Bild nehmen.").font(.caption).foregroundStyle(.white).shadow(radius: 3)
            } else if scanner.processing {
                ProgressView("Raum wird ausgewertet …").padding(14).background(.regularMaterial, in: Capsule())
            } else if !scanner.rooms.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Label(scanner.rooms.count == 1 ? "1 Raum gescannt" : "\(scanner.rooms.count) Räume gescannt", systemImage: "square.split.bottomrightquarter").font(.headline)
                    Text(scanner.summary).font(.caption).foregroundStyle(.secondary)
                    TextField("Geschoss, z. B. Erdgeschoss", text: $storeyName).textFieldStyle(.roundedBorder)
                    HStack {
                        Button { scanner.startRoom() } label: { Label("Nächster Raum", systemImage: "plus") }.buttonStyle(.bordered).disabled(saving)
                        Spacer()
                        Button { Task { await save() } } label: { Label(saving ? "IFC wird erstellt …" : "IFC erstellen", systemImage: "cube.transparent") }
                            .buttonStyle(.borderedProminent).tint(d21Accent).disabled(saving)
                    }
                    Text("Vorläufiger Entwurf aus dem Scan: Wände, Türen, Fenster und Räume als einfache Körper. Maße bitte prüfen.").font(.caption2).foregroundStyle(.secondary)
                }.padding(16).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
        }.padding(16)
    }

    private func save() async {
        saving = true; defer { saving = false }
        do {
            let scan = try await scanner.merged()
            let name = buildingName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Gebäude" : buildingName
            let text = RoomScanIFC.make(scan, buildingName: name, storeyName: storeyName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Erdgeschoss" : storeyName)
            let safe = name.replacingOccurrences(of: "/", with: "-").prefix(60)
            await completion(Data(text.utf8), "Raumscan \(safe).ifc")
            dismiss()
        } catch { scanner.problem = error.localizedDescription }
    }
}

@MainActor final class RoomScanController: ObservableObject {
    @Published var rooms: [CapturedRoom] = []
    @Published var scanning = false
    @Published var processing = false
    @Published var problem: String?
    weak var view: RoomCaptureView?

    var title: String { scanning ? "Raum \(rooms.count + 1) scannen" : rooms.isEmpty ? "Räume scannen" : "Scan prüfen" }
    var summary: String {
        let walls = rooms.reduce(0) { $0 + $1.walls.count }, doors = rooms.reduce(0) { $0 + $1.doors.count }, windows = rooms.reduce(0) { $0 + $1.windows.count }
        return "\(walls) Wände · \(doors) Türen · \(windows) Fenster"
    }

    func startRoom() {
        guard RoomCaptureSession.isSupported else { problem = "Dieses iPhone hat keinen LiDAR-Sensor. Der Raumscan braucht ein Pro-Modell."; return }
        guard let view, !scanning else { return }
        problem = nil; scanning = true
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }
    func finishRoom() {
        guard scanning else { return }
        scanning = false; processing = true
        // Keep the AR session alive so the next room shares the same coordinate system.
        view?.captureSession.stop(pauseARSession: false)
    }
    func cancel() { if scanning || processing { view?.captureSession.stop() }; scanning = false; processing = false }
    func received(_ room: CapturedRoom?, error: Error?) {
        processing = false
        if let room { rooms.append(room) } else { problem = "Der Raum konnte nicht ausgewertet werden" + (error.map { ": " + $0.localizedDescription } ?? ".") + " Bitte erneut scannen." }
    }

    /// Combines all rooms (StructureBuilder) and converts them to the platform-independent scan model.
    func merged() async throws -> ScannedBuilding {
        guard !rooms.isEmpty else { throw APIError(status: 0, message: "Bitte zuerst einen Raum scannen.") }
        var result = ScannedBuilding()
        func box(_ s: CapturedRoom.Surface) -> ScannedBuilding.Box { .init(transform: s.transform, width: s.dimensions.x, height: s.dimensions.y, depth: s.dimensions.z) }
        let walls: [CapturedRoom.Surface], doors: [CapturedRoom.Surface], windows: [CapturedRoom.Surface], floors: [CapturedRoom.Surface], sections: [CapturedRoom.Section]
        if rooms.count > 1 {
            let structure = try await StructureBuilder(options: [.beautifyObjects]).capturedStructure(from: rooms)
            walls = structure.walls; doors = structure.doors; windows = structure.windows; floors = structure.floors; sections = structure.sections
        } else {
            let room = rooms[0]
            walls = room.walls; doors = room.doors; windows = room.windows; floors = room.floors; sections = room.sections
        }
        result.walls = walls.map(box); result.doors = doors.map(box); result.windows = windows.map(box)
        for (index, floor) in floors.enumerated() {
            var corners = floor.polygonCorners.map { c -> SIMD3<Float> in let w = floor.transform * SIMD4(c.x, c.y, c.z, 1); return SIMD3(w.x, w.y, w.z) }
            if corners.count < 3 {
                // Fallback: rectangle from the floor surface dimensions.
                let hx = floor.dimensions.x / 2, hy = floor.dimensions.y / 2
                corners = [SIMD3(-hx, -hy, 0), SIMD3(hx, -hy, 0), SIMD3(hx, hy, 0), SIMD3(-hx, hy, 0)].map { c in let w = floor.transform * SIMD4(c.x, c.y, c.z, 1); return SIMD3(w.x, w.y, w.z) }
            }
            let name = sections.first { Self.inside(SIMD2($0.center.x, $0.center.z), corners.map { SIMD2($0.x, $0.z) }) }.map { Self.label($0.label) } ?? "Raum \(index + 1)"
            result.floors.append(.init(corners: corners, name: name))
        }
        // Unique names when several rooms share a label.
        var seen: [String: Int] = [:]
        for i in result.floors.indices { let n = result.floors[i].name; seen[n, default: 0] += 1; if seen[n]! > 1 { result.floors[i].name = "\(n) \(seen[n]!)" } }
        return result
    }

    private static func inside(_ p: SIMD2<Float>, _ poly: [SIMD2<Float>]) -> Bool {
        var c = false, j = poly.count - 1
        for i in poly.indices { if (poly[i].y > p.y) != (poly[j].y > p.y), p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x { c.toggle() }; j = i }
        return c
    }
    private static func label(_ label: CapturedRoom.Section.Label) -> String {
        switch label {
        case .bathroom: "Bad"
        case .bedroom: "Schlafzimmer"
        case .diningRoom: "Esszimmer"
        case .kitchen: "Küche"
        case .livingRoom: "Wohnzimmer"
        default: "Raum"
        }
    }
}

private struct RoomCaptureContainer: UIViewRepresentable {
    let controller: RoomScanController
    func makeCoordinator() -> RoomCaptureDelegate { RoomCaptureDelegate(controller: controller) }
    func makeUIView(context: Context) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero)
        view.delegate = context.coordinator
        controller.view = view
        // Start once the capture view exists (onAppear can run before makeUIView).
        Task { @MainActor in controller.startRoom() }
        return view
    }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}

}

/// Top-level with a fixed Objective-C name because RoomCaptureViewDelegate requires NSCoding.
@objc(D21RoomCaptureDelegate) final class RoomCaptureDelegate: NSObject, RoomCaptureViewDelegate {
    let controller: RoomScanController
    init(controller: RoomScanController) { self.controller = controller; super.init() }
    required init?(coder: NSCoder) { nil }
    func encode(with coder: NSCoder) {}
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        Task { @MainActor in controller.received(processedResult, error: error) }
    }
}
