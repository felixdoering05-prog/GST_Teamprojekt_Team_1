import SwiftUI
import UIKit
import Combine

// MARK: - Model (mm, y up, same as the server's plan geometry)

struct PlanEditorReply: Decodable { let levels: [PlanEditorLevel] }
struct PlanEditorScale: Decodable { let method: String?; let estimated: Bool }
struct PlanEditorImage: Decodable { let name: String; let size_px: [Double]; let mm_per_px: Double; let origin_px: [Double]; let image_scale: Double }
struct PlanEditorWall: Decodable, Identifiable, Equatable { var id: String; var a: CGPoint; var b: CGPoint; var thickness: Double
    enum CodingKeys: String, CodingKey { case id, a, b, thickness }
    init(id: String, a: CGPoint, b: CGPoint, thickness: Double) { self.id = id; self.a = a; self.b = b; self.thickness = thickness }
    init(from d: Decoder) throws { let c = try d.container(keyedBy: CodingKeys.self); id = try c.decode(String.self, forKey: .id); a = try c.decode([Double].self, forKey: .a).point; b = try c.decode([Double].self, forKey: .b).point; thickness = try c.decode(Double.self, forKey: .thickness) }
}
struct PlanEditorOpening: Decodable, Identifiable, Equatable { var id: String; var kind: String; var wall: String; var at: CGPoint; var width: Double
    enum CodingKeys: String, CodingKey { case id, kind, wall, at, width }
    init(id: String, kind: String, wall: String, at: CGPoint, width: Double) { self.id = id; self.kind = kind; self.wall = wall; self.at = at; self.width = width }
    init(from d: Decoder) throws { let c = try d.container(keyedBy: CodingKeys.self); id = try c.decode(String.self, forKey: .id); kind = try c.decode(String.self, forKey: .kind); wall = try c.decode(String.self, forKey: .wall); at = try c.decode([Double].self, forKey: .at).point; width = try c.decode(Double.self, forKey: .width) }
}
struct PlanEditorRoom: Decodable, Identifiable, Equatable { var id: String; var name: String; var area_m2: Double; var point: CGPoint; var polygon: [CGPoint]
    enum CodingKeys: String, CodingKey { case id, name, area_m2, point, polygon }
    init(from d: Decoder) throws { let c = try d.container(keyedBy: CodingKeys.self); id = try c.decode(String.self, forKey: .id); name = try c.decode(String.self, forKey: .name); area_m2 = try c.decode(Double.self, forKey: .area_m2); point = try c.decode([Double].self, forKey: .point).point; polygon = try c.decode([[Double]].self, forKey: .polygon).map(\.point) }
}
struct PlanEditorLevel: Decodable { let index: Int; let name: String; let source: String; let width: Double; let depth: Double; let scale: PlanEditorScale
    var walls: [PlanEditorWall]; var openings: [PlanEditorOpening]; var rooms: [PlanEditorRoom]; let image: PlanEditorImage? }
struct PlanEditorReference: Equatable { var a: CGPoint; var b: CGPoint; var mm: Double }
private extension Array where Element == Double { var point: CGPoint { CGPoint(x: count > 0 ? self[0] : 0, y: count > 1 ? self[1] : 0) } }
private extension CGPoint {
    static func - (l: CGPoint, r: CGPoint) -> CGPoint { CGPoint(x: l.x - r.x, y: l.y - r.y) }
    static func + (l: CGPoint, r: CGPoint) -> CGPoint { CGPoint(x: l.x + r.x, y: l.y + r.y) }
    var length: Double { (x * x + y * y).squareRoot() }
    var json: [Double] { [(x * 10).rounded() / 10, (y * 10).rounded() / 10] }
}

/// Pure geometry helpers, kept free of UI so they are easy to reason about.
enum PlanGeometry {
    static func project(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> (t: Double, point: CGPoint, distance: Double) {
        let d = b - a, len2 = max(d.x * d.x + d.y * d.y, 1e-9)
        let t = min(max(((p.x - a.x) * d.x + (p.y - a.y) * d.y) / len2, 0), 1)
        let q = CGPoint(x: a.x + d.x * t, y: a.y + d.y * t)
        return (t, q, (p - q).length)
    }
    /// Right angles: a new or moved wall end snaps to horizontal/vertical, and to nearby wall ends and lines (25 cm).
    static func snap(_ p: CGPoint, from start: CGPoint?, walls: [PlanEditorWall], excluding: String? = nil, tolerance: Double = 250) -> CGPoint {
        var q = p
        var horizontal = false
        if let s = start { horizontal = abs(q.x - s.x) > abs(q.y - s.y); if horizontal { q.y = s.y } else { q.x = s.x } }
        let ends = walls.filter { $0.id != excluding }.flatMap { [$0.a, $0.b] }
        if let e = ends.min(by: { ($0 - q).length < ($1 - q).length }), (e - q).length < tolerance {
            if start == nil { return e }
            if horizontal { q.x = e.x } else { q.y = e.y }
            return q
        }
        // Align with the line of a perpendicular wall nearby, so rooms close neatly.
        for w in walls where w.id != excluding {
            if start == nil || horizontal, abs(w.a.x - w.b.x) < 1, abs(q.x - w.a.x) < tolerance { q.x = w.a.x }
            if start == nil || !horizontal, abs(w.a.y - w.b.y) < 1, abs(q.y - w.a.y) < tolerance { q.y = w.a.y }
        }
        return q
    }
}

// MARK: - Editor state with undo

@MainActor final class PlanEditorModel: ObservableObject {
    @Published var levels: [PlanEditorLevel] = []
    @Published var levelIndex = 0
    @Published var references: [Int: PlanEditorReference] = [:]
    @Published var images: [Int: UIImage] = [:]
    @Published var selection: String?
    @Published var changed = false
    private var history: [([PlanEditorLevel], [Int: PlanEditorReference])] = []
    private var counter = 0
    var canUndo: Bool { !history.isEmpty }
    var historyLastLevels: PlanEditorLevel? { history.last.map { $0.0[levelIndex] } }
    func dropLastCheckpoint() { _ = history.popLast(); changed = !history.isEmpty }
    var level: PlanEditorLevel { levels[levelIndex] }

    func checkpoint() { history.append((levels, references)); if history.count > 40 { history.removeFirst() }; changed = true }
    func undo() { guard let last = history.popLast() else { return }; levels = last.0; references = last.1; selection = nil; changed = !history.isEmpty }
    func newID(_ prefix: String) -> String { counter += 1; return "\(prefix)\(counter)" }
    func update(_ change: (inout PlanEditorLevel) -> Void) { change(&levels[levelIndex]) }

    func deleteSelection() {
        guard let id = selection else { return }
        checkpoint()
        update { l in
            l.walls.removeAll { $0.id == id }
            l.openings.removeAll { $0.id == id || $0.wall == id }
        }
        selection = nil
    }
    func moveWall(_ id: String, from original: PlanEditorLevel, by delta: CGPoint) {
        guard let w = original.walls.first(where: { $0.id == id }) else { return }
        // Horizontal walls move up/down, vertical walls left/right: the plan stays right-angled.
        let horizontal = abs(w.a.y - w.b.y) < abs(w.a.x - w.b.x)
        let d = horizontal ? CGPoint(x: 0, y: delta.y) : CGPoint(x: delta.x, y: 0)
        update { l in
            guard let i = l.walls.firstIndex(where: { $0.id == id }) else { return }
            l.walls[i].a = w.a + d; l.walls[i].b = w.b + d
            for k in l.openings.indices where l.openings[k].wall == id { if let o = original.openings.first(where: { $0.id == l.openings[k].id }) { l.openings[k].at = o.at + d } }
            // Walls that ended on the moved wall follow with their end.
            for k in l.walls.indices where l.walls[k].id != id {
                let o = original.walls[k]
                if PlanGeometry.project(o.a, w.a, w.b).distance < 1 { l.walls[k].a = o.a + d }
                if PlanGeometry.project(o.b, w.a, w.b).distance < 1 { l.walls[k].b = o.b + d }
            }
        }
    }
    /// The recognition bridged a wall across an open passage (e.g. a corridor): cut the wall at this opening.
    func openWall(at openingID: String) {
        guard let o = level.openings.first(where: { $0.id == openingID }), let w = level.walls.first(where: { $0.id == o.wall }) else { return }
        let d = w.b - w.a, len = max(d.length, 1), u = CGPoint(x: d.x / len, y: d.y / len)
        let p1 = CGPoint(x: o.at.x - u.x * o.width / 2, y: o.at.y - u.y * o.width / 2), p2 = CGPoint(x: o.at.x + u.x * o.width / 2, y: o.at.y + u.y * o.width / 2)
        checkpoint()
        let first = PlanEditorWall(id: newID("n"), a: w.a, b: p1, thickness: w.thickness), second = PlanEditorWall(id: newID("n"), a: p2, b: w.b, thickness: w.thickness)
        update { l in
            l.walls.removeAll { $0.id == w.id }
            for piece in [first, second] where (piece.b - piece.a).length >= 100 { l.walls.append(piece) }
            l.openings.removeAll { $0.id == openingID }
            for k in l.openings.indices where l.openings[k].wall == w.id {
                l.openings[k].wall = PlanGeometry.project(l.openings[k].at, w.a, p1).distance < 1 ? first.id : second.id
            }
        }
        selection = nil
    }
    func toggleThickness() {
        guard let id = selection else { return }
        checkpoint()
        update { l in if let i = l.walls.firstIndex(where: { $0.id == id }) { l.walls[i].thickness = l.walls[i].thickness >= 200 ? 115 : 300 } }
    }
    func addWall(_ a: CGPoint, _ b: CGPoint) {
        guard (b - a).length >= 300 else { return }
        checkpoint()
        let outer = level.walls.map(\.thickness).max() ?? 300
        let id = newID("n")
        update { $0.walls.append(PlanEditorWall(id: id, a: a, b: b, thickness: min(outer, 115))) }
        selection = id
    }
    func addOpening(_ kind: String, at p: CGPoint) -> Bool {
        let hits = level.walls.map { ($0, PlanGeometry.project(p, $0.a, $0.b)) }.filter { $0.1.distance <= max($0.0.thickness, 400) }
        guard let (wall, hit) = hits.min(by: { $0.1.distance < $1.1.distance }) else { return false }
        let width: Double = kind == "door" ? 885 : 1260
        guard (wall.b - wall.a).length >= width + 100 else { return false }
        checkpoint()
        let id = newID("o")
        update { $0.openings.append(PlanEditorOpening(id: id, kind: kind, wall: wall.id, at: hit.point, width: width)) }
        selection = id
        return true
    }
    func rename(_ roomID: String, _ name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        checkpoint()
        update { l in if let i = l.rooms.firstIndex(where: { $0.id == roomID }) { l.rooms[i].name = String(clean.prefix(60)) } }
    }
    func body() -> [String: Any] {
        ["levels": levels.enumerated().map { i, l -> [String: Any] in
            var out: [String: Any] = [
                "walls": l.walls.map { ["id": $0.id, "a": $0.a.json, "b": $0.b.json, "thickness": $0.thickness] },
                "openings": l.openings.filter { o in l.walls.contains { $0.id == o.wall } }.map { ["id": $0.id, "kind": $0.kind, "wall": $0.wall, "at": $0.at.json, "width": $0.width] },
                // Only real names travel: generic "Raum 3" labels are renumbered by the server after wall edits.
                "rooms": l.rooms.filter { $0.name.range(of: #"^Raum \d+$"#, options: .regularExpression) == nil }.map { ["point": $0.point.json, "name": $0.name] }]
            if let r = references[i] { out["reference"] = ["a": r.a.json, "b": r.b.json, "mm": r.mm] }
            return out
        }]
    }
}

// MARK: - View

struct PlanEditorView: View {
    let building: Building
    let jobID: String
    @ObservedObject var account: AccountModel
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model = PlanEditorModel()
    enum Tool: String, CaseIterable, Identifiable { case move = "Ändern", wall = "Wand", door = "Tür", window = "Fenster", measure = "Strecke"; var id: String { rawValue } }
    @State private var tool: Tool = .move
    @State private var loading = true
    @State private var problem: String?
    @State private var saving = false
    @State private var zoom: CGFloat = 1
    @State private var zoomBase: CGFloat = 1
    @State private var pan: CGSize = .zero
    @State private var panBase: CGSize = .zero
    @State private var dragStart: CGPoint?
    @State private var dragCurrent: CGPoint?
    @State private var dragOriginal: PlanEditorLevel?
    @State private var measureA: CGPoint?
    @State private var measurePending: (CGPoint, CGPoint)?
    @State private var measureText = ""
    @State private var renameRoom: PlanEditorRoom?
    @State private var renameText = ""
    @State private var showPlan = true
    @State private var confirmLeave = false
    private var base: String { "buildings/\(building.id)/plan-conversion/jobs/\(jobID)" }

    var body: some View {
        VStack(spacing: 0) {
            if loading { ProgressView("Grundriss wird geladen …").frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if model.levels.isEmpty { ContentUnavailableView("Keine Korrektur möglich", systemImage: "exclamationmark.triangle", description: Text(problem ?? "Dieser Entwurf kann nicht bearbeitet werden.")) }
            else {
                header
                GeometryReader { geo in canvas(size: geo.size) }.clipped().background(Color(uiColor: .secondarySystemBackground))
                toolbar
            }
        }
        .navigationTitle("Grundriss korrigieren").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(model.changed)
        .toolbar {
            if model.changed { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { confirmLeave = true } } }
            ToolbarItem(placement: .primaryAction) { Button { model.undo() } label: { Label("Rückgängig", systemImage: "arrow.uturn.backward") }.disabled(!model.canUndo) }
        }
        .task { await load() }
        .alert("Wie lang ist diese Strecke?", isPresented: Binding(get: { measurePending != nil }, set: { if !$0 { measurePending = nil } })) {
            TextField("Länge in Metern, z. B. 4,50", text: $measureText).keyboardType(.decimalPad)
            Button("Abbrechen", role: .cancel) { measurePending = nil }
            Button("Übernehmen") {
                if let (a, b) = measurePending, let m = Double(measureText.replacingOccurrences(of: ",", with: ".")), m >= 0.1, m <= 200 {
                    model.checkpoint(); model.references[model.levelIndex] = PlanEditorReference(a: a, b: b, mm: m * 1000)
                } else { problem = "Bitte eine Länge zwischen 0,10 und 200 m eingeben." }
                measurePending = nil
            }
        } message: { Text("Zum Beispiel ein Gesamtmaß aus dem Plan. Danach stimmen alle Maße im Modell.") }
        .alert("Raum benennen", isPresented: Binding(get: { renameRoom != nil }, set: { if !$0 { renameRoom = nil } })) {
            TextField("z. B. Küche", text: $renameText)
            Button("Abbrechen", role: .cancel) { renameRoom = nil }
            Button("Speichern") { if let r = renameRoom { model.rename(r.id, renameText) }; renameRoom = nil }
        }
        .alert("Korrektur", isPresented: Binding(get: { problem != nil && !model.levels.isEmpty }, set: { if !$0 { problem = nil } })) { Button("OK", role: .cancel) { problem = nil } } message: { Text(problem ?? "") }
        .confirmationDialog("Änderungen verwerfen?", isPresented: $confirmLeave, titleVisibility: .visible) { Button("Verwerfen", role: .destructive) { dismiss() } }
    }

    // Level switch and hint for the current tool.
    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            if model.levels.count > 1 {
                Picker("Geschoss", selection: $model.levelIndex) { ForEach(model.levels.indices, id: \.self) { Text(model.levels[$0].name).tag($0) } }.pickerStyle(.segmented)
            }
            Text(hint).font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            if model.level.scale.estimated && model.references[model.levelIndex] == nil {
                Label("Maße sind geschätzt. Mit „Strecke“ eine bekannte Länge markieren, dann stimmt die Größe.", systemImage: "ruler").font(.caption).foregroundStyle(.orange)
            }
        }.padding(.horizontal).padding(.vertical, 8)
    }
    private var hint: String {
        switch tool {
        case .move: "Tippe eine Wand, Tür oder ein Fenster an und ziehe es an die richtige Stelle – oder lösche es. Tippe auf einen Raumnamen, um ihn zu ändern. Mit zwei Fingern zoomen."
        case .wall: "Ziehe mit dem Finger eine neue Wand. Sie wird gerade ausgerichtet und rastet an anderen Wänden ein."
        case .door: "Tippe auf eine Wand, um dort eine Tür einzusetzen."
        case .window: "Tippe auf eine Wand, um dort ein Fenster einzusetzen."
        case .measure: measureA == nil ? "Tippe auf den Anfang einer Strecke, deren Länge du kennst (z. B. ein Gesamtmaß im Plan)." : "Tippe jetzt auf das Ende der Strecke."
        }
    }

    private var toolbar: some View {
        VStack(spacing: 10) {
            Picker("Werkzeug", selection: $tool) { ForEach(Tool.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented).onChange(of: tool) { _, _ in measureA = nil; model.selection = nil }
            HStack(spacing: 8) {
                if let sel = model.selection {
                    Button(role: .destructive) { model.deleteSelection() } label: { Label("Löschen", systemImage: "trash") }
                    if let wall = model.level.walls.first(where: { $0.id == sel }) {
                        Button { model.toggleThickness() } label: { Label(wall.thickness >= 200 ? "Außen" : "Innen", systemImage: "square.split.2x1") }
                    }
                    if model.level.openings.contains(where: { $0.id == sel && $0.kind == "opening" }) {
                        Button { model.openWall(at: sel) } label: { Label("Wand hier öffnen", systemImage: "rectangle.split.2x1.slash") }
                    }
                } else if model.level.image != nil {
                    Toggle(isOn: $showPlan) { Label("Planfoto zeigen", systemImage: "photo") }.toggleStyle(.button)
                }
                Spacer(minLength: 0)
            }.buttonStyle(.bordered).lineLimit(1).font(.subheadline)
            Button { Task { await save() } } label: {
                Group { if saving { ProgressView() } else { Label("Gebäude erstellen", systemImage: "cube.fill") } }.frame(maxWidth: .infinity).padding(.vertical, 4)
            }.buttonStyle(.borderedProminent).controlSize(.large).disabled(saving).accessibilityIdentifier("plan-editor-save")
        }.padding(.horizontal).padding(.vertical, 10).background(.bar)
    }

    // MARK: drawing

    private struct Frame { let k: CGFloat; let ox: CGFloat; let oy: CGFloat
        func screen(_ p: CGPoint) -> CGPoint { CGPoint(x: ox + p.x * k, y: oy - p.y * k) }
        func mm(_ s: CGPoint) -> CGPoint { CGPoint(x: (s.x - ox) / k, y: (oy - s.y) / k) }
    }
    private func frame(_ size: CGSize) -> Frame {
        let l = model.level, margin: Double = 900
        let w = l.width + 2 * margin, h = l.depth + 2 * margin
        let k = min(size.width / w, size.height / h) * zoom
        let ox = (size.width - l.width * k) / 2 + pan.width, oy = (size.height + l.depth * k) / 2 + pan.height
        return Frame(k: k, ox: ox, oy: oy)
    }

    @ViewBuilder private func canvas(size: CGSize) -> some View {
        let f = frame(size), l = model.level
        ZStack(alignment: .topLeading) {
            if showPlan, let img = l.image, let ui = model.images[l.index] {
                // Plan photo in the same mm grid: px/ image_scale -> normalised px -> mm.
                let tl = CGPoint(x: -img.origin_px[0] * img.mm_per_px, y: img.origin_px[1] * img.mm_per_px)
                let br = CGPoint(x: (Double(ui.size.width) / img.image_scale - img.origin_px[0]) * img.mm_per_px, y: (img.origin_px[1] - Double(ui.size.height) / img.image_scale) * img.mm_per_px)
                let a = f.screen(tl), b = f.screen(br)
                Image(uiImage: ui).resizable().frame(width: b.x - a.x, height: b.y - a.y).position(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2).opacity(0.45).allowsHitTesting(false)
            }
            Canvas { ctx, _ in
                for r in l.rooms {
                    var p = Path(); p.addLines(r.polygon.map(f.screen)); p.closeSubpath()
                    ctx.fill(p, with: .color(Color.accentColor.opacity(0.08)))
                }
                for w in l.walls {
                    var p = Path(); p.move(to: f.screen(w.a)); p.addLine(to: f.screen(w.b))
                    let selected = model.selection == w.id
                    ctx.stroke(p, with: .color(selected ? .orange : Color(white: 0.18)), style: StrokeStyle(lineWidth: max(2, w.thickness * f.k), lineCap: .square))
                }
                for o in l.openings {
                    guard let w = l.walls.first(where: { $0.id == o.wall }) else { continue }
                    let d = w.b - w.a, len = max(d.length, 1), u = CGPoint(x: d.x / len, y: d.y / len)
                    let a = CGPoint(x: o.at.x - u.x * o.width / 2, y: o.at.y - u.y * o.width / 2), b = CGPoint(x: o.at.x + u.x * o.width / 2, y: o.at.y + u.y * o.width / 2)
                    var p = Path(); p.move(to: f.screen(a)); p.addLine(to: f.screen(b))
                    let color: Color = model.selection == o.id ? .orange : o.kind == "window" ? .blue : .white
                    ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: max(3, w.thickness * f.k * 0.8), lineCap: .butt))
                    if o.kind != "window" { ctx.stroke(p, with: .color(.brown), style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])) }
                }
                if let r = model.references[model.levelIndex] {
                    var p = Path(); p.move(to: f.screen(r.a)); p.addLine(to: f.screen(r.b))
                    ctx.stroke(p, with: .color(.green), style: StrokeStyle(lineWidth: 2.5, dash: [6, 4]))
                }
                if let a = measureA { ctx.fill(Path(ellipseIn: CGRect(x: f.screen(a).x - 6, y: f.screen(a).y - 6, width: 12, height: 12)), with: .color(.green)) }
                if tool == .wall, let s = dragStart, let c = dragCurrent {
                    var p = Path(); p.move(to: f.screen(s)); p.addLine(to: f.screen(c))
                    ctx.stroke(p, with: .color(.orange.opacity(0.8)), style: StrokeStyle(lineWidth: max(3, 115 * f.k), lineCap: .square))
                }
            }
            ForEach(l.rooms) { r in
                let s = f.screen(r.point)
                Button { if tool == .move { renameRoom = r; renameText = r.name.hasPrefix("Raum ") ? "" : r.name } } label: {
                    VStack(spacing: 0) {
                        Text(r.name).font(.caption.weight(.semibold))
                        Text("\(r.area_m2.formatted(.number.precision(.fractionLength(1)))) m²").font(.caption2).foregroundStyle(.secondary)
                    }.padding(.horizontal, 6).padding(.vertical, 3).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 6))
                }.buttonStyle(.plain).position(s).allowsHitTesting(tool == .move)
            }
            if let r = model.references[model.levelIndex] {
                Text("\((r.mm / 1000).formatted(.number.precision(.fractionLength(2)))) m").font(.caption.bold()).padding(4).background(.green.opacity(0.85), in: Capsule()).foregroundStyle(.white)
                    .position(f.screen(CGPoint(x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2)))
            }
        }
        .contentShape(Rectangle())
        .gesture(edit(f))
        .simultaneousGesture(MagnifyGesture().onChanged { zoom = min(max(zoomBase * $0.magnification, 0.5), 8) }.onEnded { _ in zoomBase = zoom })
    }

    private func hit(_ p: CGPoint, _ f: Frame) -> String? {
        let l = model.level, tol = 14 / f.k
        if let o = l.openings.min(by: { ($0.at - p).length < ($1.at - p).length }), (o.at - p).length < o.width / 2 + tol { return o.id }
        let walls = l.walls.map { ($0, PlanGeometry.project(p, $0.a, $0.b).distance) }.filter { $0.1 <= $0.0.thickness / 2 + tol }
        return walls.min(by: { $0.1 < $1.1 })?.0.id
    }

    private func edit(_ f: Frame) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { g in
                let p = f.mm(g.location), start = f.mm(g.startLocation)
                switch tool {
                case .wall:
                    let s = PlanGeometry.snap(start, from: nil, walls: model.level.walls)
                    dragStart = s; dragCurrent = PlanGeometry.snap(p, from: s, walls: model.level.walls)
                case .move:
                    if dragOriginal == nil {
                        dragOriginal = model.level
                        model.selection = hit(start, f)
                        if model.selection != nil { model.checkpoint() } else { panBase = pan }
                    }
                    guard let original = dragOriginal else { return }
                    let moved = (g.translation.width * g.translation.width + g.translation.height * g.translation.height) > 36
                    if let sel = model.selection, moved {
                        let delta = p - start
                        if original.walls.contains(where: { $0.id == sel }) { model.moveWall(sel, from: original, by: delta) }
                        else if let o = original.openings.first(where: { $0.id == sel }), let w = original.walls.first(where: { $0.id == o.wall }) {
                            let q = PlanGeometry.project(o.at + delta, w.a, w.b).point
                            model.update { l in if let i = l.openings.firstIndex(where: { $0.id == sel }) { l.openings[i].at = q } }
                        }
                    } else if model.selection == nil { pan = CGSize(width: panBase.width + g.translation.width, height: panBase.height + g.translation.height) }
                default: break
                }
            }
            .onEnded { g in
                let p = f.mm(g.location)
                switch tool {
                case .wall:
                    if let s = dragStart, let c = dragCurrent { model.addWall(s, c) }
                    dragStart = nil; dragCurrent = nil
                case .move:
                    if let original = dragOriginal, model.level.walls == original.walls, model.level.openings == original.openings {
                        // A plain tap: selection only, no change recorded.
                        model.undoIfUnchanged(original)
                    }
                    dragOriginal = nil
                case .door, .window:
                    if !model.addOpening(tool == .door ? "door" : "window", at: p) { problem = "Bitte direkt auf eine ausreichend lange Wand tippen." }
                case .measure:
                    let q = PlanGeometry.snap(p, from: nil, walls: model.level.walls, tolerance: 15 / f.k)
                    if let a = measureA { if (q - a).length > 100 { measurePending = (a, q); measureText = "" }; measureA = nil } else { measureA = q }
                }
            }
    }

    // MARK: network

    private func load() async {
        loading = true; defer { loading = false }
        do {
            let reply: PlanEditorReply = try await account.request(base + "/editor")
            model.levels = reply.levels
            for l in reply.levels { if let img = l.image, let data = try? await account.fileRequest(path: base + "/plan-image/" + img.name), let ui = UIImage(data: data) { model.images[l.index] = ui } }
        } catch is CancellationError {} catch { problem = error.localizedDescription }
    }
    private func save() async {
        saving = true; defer { saving = false }
        do {
            struct Result: Decodable { let status: String }
            let _: Result = try await account.request(base + "/edit", method: "POST", body: model.body())
            onSaved(); dismiss()
        } catch { problem = error.localizedDescription }
    }
}

extension PlanEditorModel {
    /// Taps select without filling the undo history.
    func undoIfUnchanged(_ original: PlanEditorLevel) {
        if let last = historyLastLevels, last.walls == original.walls, last.openings == original.openings { dropLastCheckpoint() }
    }
}
