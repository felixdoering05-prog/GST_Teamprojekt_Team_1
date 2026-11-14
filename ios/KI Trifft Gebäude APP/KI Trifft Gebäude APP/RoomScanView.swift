import SwiftUI
import RoomPlan
import simd
import Combine

// LiDAR room scan with Apple RoomPlan. Rooms are scanned one after another in the same AR session and
// merged with StructureBuilder. The merged structure goes to the project server, which builds the IFC4
// (RoomScanServer); the person checks it before it is added to the building. Without a server connection
// the IFC4 draft is written on the device (RoomScanIFC) and uploaded like any other file.

struct RoomScanView: View {
    let buildingName: String
    /// Server-side IFC generation; nil keeps the scan on the device only.
    var account: AccountModel? = nil
    var buildingID: Int? = nil
    /// Called after the person added the server-generated IFC to the building.
    var serverDocument: (BuildingDocument) -> Void = { _ in }
    /// Receives the on-device IFC file data and a file name (fallback); returns when the file has been handed over.
    let completion: (Data, String) async -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var scanner = RoomScanController()
    @State private var storeyName = "Erdgeschoss"
    @State private var saving = false
    @State private var serverJob: RoomScanJob?
    @State private var serverStatus: String?
    @State private var serverProblem: String?

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

    private var storey: String {
        let s = storeyName.trimmingCharacters(in: .whitespacesAndNewlines); return s.isEmpty ? "Erdgeschoss" : s
    }
    private var name: String {
        let n = buildingName.trimmingCharacters(in: .whitespacesAndNewlines); return n.isEmpty ? "Gebäude" : n
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
                Text("Langsam an den Wänden entlang schwenken, Türen, Fenster und Möbel einmal ganz ins Bild nehmen. Abstand 1–3 m. Bei Innenwänden beide Seiten scannen – dann misst der Server die Wandstärke.").font(.caption).foregroundStyle(.white).shadow(radius: 3)
            } else if scanner.processing {
                ProgressView("Raum wird ausgewertet …").padding(14).background(.regularMaterial, in: Capsule())
            } else if let job = serverJob, job.status == "ready" {
                review(job)
            } else if let status = serverStatus {
                ProgressView(status).padding(14).background(.regularMaterial, in: Capsule())
            } else if !scanner.rooms.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Label(scanner.rooms.count == 1 ? "1 Raum gescannt" : "\(scanner.rooms.count) Räume gescannt", systemImage: "square.split.bottomrightquarter").font(.headline)
                    Text(scanner.summary).font(.caption).foregroundStyle(.secondary)
                    if let serverProblem {
                        Label(serverProblem, systemImage: "server.rack").font(.caption).foregroundStyle(.orange)
                    }
                    TextField("Geschoss, z. B. Erdgeschoss", text: $storeyName).textFieldStyle(.roundedBorder)
                    HStack {
                        Button { serverProblem = nil; scanner.startRoom() } label: { Label("Nächster Raum", systemImage: "plus") }.buttonStyle(.bordered).disabled(saving)
                        Spacer()
                        Button { Task { await create() } } label: { Label(saving ? "IFC wird erstellt …" : "IFC erstellen", systemImage: "cube.transparent") }
                            .buttonStyle(.borderedProminent).tint(d21Accent).disabled(saving)
                    }
                    if serverProblem != nil && account != nil {
                        Button { Task { await saveOnDevice() } } label: { Label("Stattdessen auf dem iPhone erstellen", systemImage: "iphone") }.font(.caption).disabled(saving)
                    }
                    Text(account != nil && buildingID != nil
                         ? "Der Projektserver erzeugt aus dem Scan ein IFC: Räume mit Namen und Fläche, Wände mit Stärke, Türen und Fenster als Öffnungen, Möbel. Ohne Verbindung entsteht der Entwurf auf dem iPhone."
                         : "Entwurf aus dem Scan: Wände (Innenseite wie gescannt), Türen und Fenster als Öffnungen, Räume und Möbel als einfache Körper. Maße bitte prüfen.").font(.caption2).foregroundStyle(.secondary)
                }.padding(16).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
        }.padding(16)
    }

    /// Result check before the IFC becomes a document of the building.
    @ViewBuilder private func review(_ job: RoomScanJob) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("IFC-Entwurf vom Server", systemImage: "checkmark.seal").font(.headline)
            if let c = job.summary?.counts {
                Text("\(c.rooms) Räume · \(c.walls) Wände\((c.shared_walls ?? 0) > 0 ? " (\(c.shared_walls!) Innenwände gemessen)" : "") · \(c.doors) Türen · \(c.windows) Fenster · \(c.objects) Möbel/Objekte").font(.caption).foregroundStyle(.secondary)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(job.summary?.rooms ?? []) { room in
                        HStack {
                            Text(room.name).font(.subheadline.weight(.semibold))
                            if room.type != room.name && !room.name.hasPrefix(room.type) { Text(room.type).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Text(String(format: "%.1f m²", room.area_m2)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                    ForEach(job.warnings ?? [], id: \.self) { Label($0, systemImage: "info.circle").font(.caption2).foregroundStyle(.secondary) }
                }
            }.frame(maxHeight: 180)
            HStack {
                Button(role: .destructive) { Task { await reject(job) } } label: { Label("Verwerfen", systemImage: "trash") }.buttonStyle(.bordered).disabled(saving)
                Spacer()
                Button { Task { await approve(job) } } label: { Label(saving ? "Wird hinzugefügt …" : "Zum Gebäude hinzufügen", systemImage: "plus.circle.fill") }
                    .buttonStyle(.borderedProminent).tint(d21Accent).disabled(saving)
            }
        }.padding(16).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func create() async {
        guard let account, let buildingID else { await saveOnDevice(); return }
        saving = true; serverProblem = nil
        defer { saving = false; serverStatus = nil }
        do {
            let scan = try await scanner.merged()
            serverStatus = "Scan wird an den Projektserver gesendet …"
            var job = try await account.submitRoomScan(buildingID: buildingID, payload: try scan.serverPayload(buildingName: name, storey: storey), requestID: UUID())
            serverStatus = "Server erstellt das IFC-Modell …"
            let deadline = Date().addingTimeInterval(180)
            while job.pending {
                guard Date() < deadline else { throw APIError(status: 0, message: "Der Server braucht gerade zu lange.") }
                try await Task.sleep(for: .seconds(2))
                job = try await account.roomScan(buildingID: buildingID, id: job.id)
            }
            if job.status == "ready" { serverJob = job }
            else { serverProblem = (job.warnings?.first ?? "Der Server konnte kein IFC erzeugen.") + " Du kannst den Entwurf auf dem iPhone erstellen." }
        } catch is CancellationError {
        } catch where RoomScanServerError.unreachable(error) {
            // Fallback: the on-device writer needs no connection to the project server.
            saving = false; serverStatus = nil
            await saveOnDevice(note: "Projektserver nicht erreichbar – das IFC wurde auf dem iPhone erstellt.")
        } catch {
            serverProblem = error.localizedDescription
        }
    }

    private func approve(_ job: RoomScanJob) async {
        guard let account, let buildingID else { return }
        saving = true; defer { saving = false }
        do {
            let result = try await account.approveRoomScan(buildingID: buildingID, id: job.id)
            serverDocument(result.document ?? BuildingDocument(id: result.document_id, name: "Raumscan \(storey).ifc", mime_type: "application/x-step", size: 0, building_id: buildingID))
            dismiss()
        } catch { scanner.problem = error.localizedDescription }
    }

    private func reject(_ job: RoomScanJob) async {
        guard let account, let buildingID else { return }
        saving = true; defer { saving = false }
        try? await account.rejectRoomScan(buildingID: buildingID, id: job.id)
        serverJob = nil
    }

    private func saveOnDevice(note: String? = nil) async {
        saving = true; defer { saving = false }
        do {
            let scan = try await scanner.merged()
            let text = RoomScanIFC.make(scan, buildingName: name, storeyName: storey)
            let safe = name.replacingOccurrences(of: "/", with: "-").prefix(60)
            await completion(Data(text.utf8), "Raumscan \(safe).ifc")
            if let note { scanner.problem = note; try? await Task.sleep(for: .seconds(2)) }
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
        let objects = rooms.reduce(0) { $0 + $1.objects.count }
        return "\(walls) Wände · \(doors) Türen · \(windows) Fenster · \(objects) Möbel/Objekte"
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
        let walls: [CapturedRoom.Surface], doors: [CapturedRoom.Surface], windows: [CapturedRoom.Surface], openings: [CapturedRoom.Surface], floors: [CapturedRoom.Surface], sections: [CapturedRoom.Section], objects: [CapturedRoom.Object]
        do {
            // StructureBuilder also for a single room: it straightens walls and aligns furniture.
            let structure = try await StructureBuilder(options: [.beautifyObjects]).capturedStructure(from: rooms)
            walls = structure.walls; doors = structure.doors; windows = structure.windows; openings = structure.openings; floors = structure.floors; sections = structure.sections; objects = structure.objects
        } catch where rooms.count == 1 {
            let room = rooms[0]
            walls = room.walls; doors = room.doors; windows = room.windows; openings = room.openings; floors = room.floors; sections = room.sections; objects = room.objects
        }
        result.walls = walls.map(box); result.doors = doors.map(box); result.windows = windows.map(box); result.openings = openings.map(box)
        result.objects = objects.map { ScannedBuilding.Object(box: .init(transform: $0.transform, width: $0.dimensions.x, height: $0.dimensions.y, depth: $0.dimensions.z), category: String(describing: $0.category)) }
        for (index, floor) in floors.enumerated() {
            var corners = floor.polygonCorners.map { c -> SIMD3<Float> in let w = floor.transform * SIMD4(c.x, c.y, c.z, 1); return SIMD3(w.x, w.y, w.z) }
            if corners.count < 3 {
                // Fallback: rectangle from the floor surface dimensions.
                let hx = floor.dimensions.x / 2, hy = floor.dimensions.y / 2
                corners = [SIMD3(-hx, -hy, 0), SIMD3(hx, -hy, 0), SIMD3(hx, hy, 0), SIMD3(-hx, hy, 0)].map { c in let w = floor.transform * SIMD4(c.x, c.y, c.z, 1); return SIMD3(w.x, w.y, w.z) }
            }
            let section = sections.first { Self.inside(SIMD2($0.center.x, $0.center.z), corners.map { SIMD2($0.x, $0.z) }) }
            let name = section.map { Self.label($0.label) } ?? "Raum \(index + 1)"
            result.floors.append(.init(corners: corners, name: name, label: section.map { String(describing: $0.label) }))
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
