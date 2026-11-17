import SwiftUI

// MARK: - Fortschritt eines Planauftrags

/// Klarer Fortschritt statt Fließtext: vier Schritte, ein Balken und ein Satz, was gerade passiert.
struct PlanJobProgress: View {
    let job: PlanConversionJob
    private static let steps = ["Hochgeladen", "Vermessen", "3D-Modell", "Prüfen"]
    private var stage: Int {
        switch job.status {
        case "queued": 0
        case "running": job.phase == "modelling" || job.phase == "model_only" ? 2 : 1
        default: 3
        }
    }
    private var headline: String {
        switch stage {
        case 0: "Dein Auftrag ist in der Warteschlange"
        case 1: "Grundriss wird vermessen und erkannt"
        case 2: "Dein 3D-Modell ist fast fertig"
        default: "Fertig – bitte kurz prüfen"
        }
    }
    private var detail: String {
        switch stage {
        case 0: "Startet in wenigen Sekunden."
        case 1: "Wände, Türen, Fenster und Räume werden aus dem Plan gelesen."
        case 2: "Wände werden hochgezogen, Ebenen übereinandergesetzt."
        default: "Vorschau ansehen, Ebenen festlegen und übernehmen."
        }
    }
    /// Seconds since the job last changed state (server timestamp), used to let the bar creep forward within a step.
    private func elapsed(_ now: Date) -> Double {
        guard let text = job.updated_at, let date = PlanJobProgress.parse(text) else { return 0 }
        return max(0, now.timeIntervalSince(date))
    }
    private static func parse(_ text: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    private func fraction(_ now: Date) -> Double {
        if stage >= 3 { return 1 }
        let start = [0.05, 0.2, 0.6][stage], end = [0.2, 0.6, 0.95][stage], typical = [5.0, 25.0, 20.0][stage]
        // Approaches the next step but never reaches it before the server confirms.
        return start + (end - start) * (1 - exp(-elapsed(now) / typical))
    }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(headline).font(.headline)
                    Spacer()
                    if stage < 3 { Text("\(Int((fraction(context.date) * 100).rounded())) %").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary) }
                }
                ProgressView(value: fraction(context.date)).tint(d21Accent).animation(.easeInOut(duration: 0.8), value: fraction(context.date))
                HStack(spacing: 0) {
                    ForEach(Array(Self.steps.enumerated()), id: \.offset) { index, name in
                        VStack(spacing: 4) {
                            ZStack {
                                Circle().fill(index < stage || stage == 3 ? d21Accent : index == stage ? d21Accent.opacity(0.18) : Color.secondary.opacity(0.15)).frame(width: 26, height: 26)
                                if index < stage || stage == 3 { Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white) }
                                else if index == stage { ProgressView().controlSize(.mini).tint(d21Accent) }
                                else { Text("\(index + 1)").font(.caption2.bold()).foregroundStyle(.secondary) }
                            }
                            Text(name).font(.caption2).foregroundStyle(index <= stage ? .primary : .secondary)
                        }.frame(maxWidth: .infinity)
                    }
                }
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(headline). \(detail)")
        }
    }
}

/// Kurze Zusammenfassung eines fertigen Entwurfs in einer Zeile pro Ebene.
struct PlanJobSummary: View {
    let quality: PlanQuality
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(quality.levels.enumerated()), id: \.offset) { _, level in
                HStack(spacing: 8) {
                    Text(level.level).font(.caption.bold()).padding(.horizontal, 7).padding(.vertical, 3).background(d21Accent.opacity(0.15), in: Capsule()).foregroundStyle(d21Accent)
                    Text("\(level.rooms) Räume · \(level.walls) Wände · \(level.doors + level.windows) Öffnungen").font(.footnote)
                }
            }
            Label(quality.grade == "gut" ? "Maße stimmig" : "Bitte Maße und Hinweise prüfen", systemImage: quality.grade == "gut" ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .font(.footnote.weight(.semibold)).foregroundStyle(quality.grade == "gut" ? .green : .orange)
        }
    }
}

// MARK: - Ebenen festlegen und stapeln

let planLevelNames = ["2. UG", "UG", "EG", "1. OG", "2. OG", "3. OG", "DG"]

/// Dach über der obersten Ebene (Server: flat | gable | shed).
struct PlanRoof: Decodable, Equatable { var type: String; var pitch: Int?; var ridge: String? }
private enum RoofKind: String, CaseIterable, Identifiable {
    case flat, gable, shed
    var id: String { rawValue }
    var title: String { switch self { case .flat: "Flachdach"; case .gable: "Satteldach"; case .shed: "Pultdach" } }
    var symbol: String { switch self { case .flat: "rectangle"; case .gable: "house"; case .shed: "triangle" } }
}
private let levelColors: [Color] = [.blue, .orange, .green, .purple]

private struct LevelChoice: Identifiable {
    let level: PlanEditorLevel
    var name: String?          // nil = nicht verwenden
    var heightM: Double
    var offsetX: Double        // Meter
    var offsetY: Double
    var id: Int { level.index }
}

/// Welche erkannten Pläne werden welche Ebene? Höhe und Versatz einstellen; der Server setzt sie übereinander.
struct PlanLevelsView: View {
    let building: Building
    let jobID: String
    @ObservedObject var account: AccountModel
    var onSaved: () -> Void = {}
    @Environment(\.dismiss) private var dismiss
    @State private var choices: [LevelChoice] = []
    @State private var roofKind: RoofKind = .flat
    @State private var roofPitch = 35
    @State private var ridgeLong = true
    @State private var error: String?
    @State private var saving = false
    private var base: String { "buildings/\(building.id)/plan-conversion/jobs/\(jobID)" }
    private var used: [LevelChoice] {
        choices.filter { $0.name != nil }.sorted { planLevelNames.firstIndex(of: $0.name!)! < planLevelNames.firstIndex(of: $1.name!)! }
    }
    private var duplicate: String? {
        let names = choices.compactMap(\.name)
        return names.first { n in names.filter { $0 == n }.count > 1 }
    }
    var body: some View {
        Form {
            if choices.isEmpty && error == nil { ProgressView("Ebenen werden geladen …") }
            if !choices.isEmpty {
                Section {
                    StackDiagram(levels: used).frame(height: CGFloat(max(1, used.count)) * 34 + 24)
                    LevelOverlay(choices: used).frame(height: 220)
                } header: { Text("So wird gestapelt") } footer: {
                    Text(used.count == 1 ? "1 Ebene im Modell." : "\(used.count) Ebenen im Modell, von unten nach oben. EG liegt auf ±0,00 m.")
                }
                Section {
                    Picker("Dachform", selection: $roofKind) {
                        ForEach(RoofKind.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                    }.pickerStyle(.segmented)
                    if roofKind != .flat {
                        Stepper(value: $roofPitch, in: 5...60) { LabeledContent("Neigung", value: "\(roofPitch)°") }
                        Picker("First", selection: $ridgeLong) {
                            Text("längs").tag(true)
                            Text("quer").tag(false)
                        }.pickerStyle(.segmented)
                    }
                } header: { Text("Dach") } footer: {
                    Text(roofKind == .flat ? "Flachdach mit umlaufender Attika über der obersten Ebene." : "Wird über die oberste Ebene gelegt. „Längs“ = First entlang der langen Gebäudeseite.")
                }
                ForEach($choices) { $choice in
                    Section {
                        LevelThumbnail(level: choice.level, color: color(for: choice)).frame(height: 120)
                        Text("Plan \(choice.level.index + 1) · \(meters(choice.level.width)) × \(meters(choice.level.depth)) · \(choice.level.rooms.count) Räume").font(.footnote).foregroundStyle(.secondary)
                        Picker("Ebene", selection: $choice.name) {
                            Text("Nicht verwenden").tag(String?.none)
                            ForEach(planLevelNames, id: \.self) { Text($0).tag(String?.some($0)) }
                        }
                        if choice.name != nil {
                            Stepper(value: $choice.heightM, in: 2.0...6.0, step: 0.05) {
                                LabeledContent("Geschosshöhe", value: choice.heightM.formatted(.number.precision(.fractionLength(2))) + " m")
                            }
                            DisclosureGroup("Ausrichten (Versatz)") {
                                offsetField("nach rechts", value: $choice.offsetX)
                                offsetField("nach oben", value: $choice.offsetY)
                                Text("Verschiebt diese Ebene gegenüber den anderen, falls die Pläne nicht deckungsgleich gezeichnet sind.").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    } header: { Text(choice.name ?? "Plan \(choice.level.index + 1) – nicht verwendet") }
                }
                Section {
                    if let duplicate { Label("„\(duplicate)“ ist mehrfach vergeben.", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                    Button { Task { await save() } } label: {
                        HStack { Spacer(); if saving { ProgressView() } else { Text("Übernehmen und Modell neu bauen").bold() }; Spacer() }
                    }.disabled(saving || used.isEmpty || duplicate != nil)
                } footer: { Text("Ohne KI und ohne neues Kontingent. Das Modell wird in wenigen Sekunden neu gebaut.") }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle("Ebenen und Dach")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }
    private func color(for choice: LevelChoice) -> Color {
        guard let i = used.firstIndex(where: { $0.id == choice.id }) else { return .secondary }
        return levelColors[i % levelColors.count]
    }
    private func meters(_ mm: Double) -> String { (mm / 1000).formatted(.number.precision(.fractionLength(2))) + " m" }
    private func offsetField(_ label: String, value: Binding<Double>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("0", value: value, format: .number.precision(.fractionLength(0...2))).keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing).frame(maxWidth: 90)
            Text("m").foregroundStyle(.secondary)
        }
    }
    @MainActor private func load() async {
        do {
            let reply: PlanEditorReply = try await account.request(base + "/editor")
            if let roof = reply.roof {
                roofKind = RoofKind(rawValue: roof.type) ?? .flat
                if let pitch = roof.pitch { roofPitch = pitch } else { roofPitch = roofKind == .shed ? 10 : 35 }
                ridgeLong = roof.ridge != "short"
            }
            choices = reply.levels.map { l in
                let known = planLevelNames.contains(l.name) ? l.name : nil
                return LevelChoice(level: l, name: known, heightM: ((l.height ?? 2500) / 1000), offsetX: (l.offset?.first ?? 0) / 1000, offsetY: (l.offset?.last ?? 0) / 1000)
            }
        } catch { self.error = error.localizedDescription }
    }
    @MainActor private func save() async {
        saving = true; error = nil; defer { saving = false }
        let levels: [[String: Any]] = used.map { c in
            ["index": c.level.index, "name": c.name!, "height": (c.heightM * 1000).rounded(),
             "offset": [(min(max(c.offsetX, -50), 50) * 1000).rounded(), (min(max(c.offsetY, -50), 50) * 1000).rounded()]]
        }
        do {
            struct Receipt: Decodable { let status: String }
            let roof: [String: Any] = roofKind == .flat ? ["type": "flat"] : ["type": roofKind.rawValue, "pitch": roofPitch, "ridge": ridgeLong ? "long" : "short"]
            let _: Receipt = try await account.request(base + "/levels", method: "POST", body: ["levels": levels, "roof": roof, "request_key": UUID().uuidString.lowercased()])
            onSaved(); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

/// Seitenansicht: Ebenen als Scheiben übereinander, mit Höhe.
private struct StackDiagram: View {
    let levels: [LevelChoice]
    var body: some View {
        VStack(spacing: 4) {
            ForEach(Array(levels.enumerated().reversed()), id: \.offset) { i, l in
                HStack(spacing: 10) {
                    Text(l.name ?? "").font(.caption.bold()).frame(width: 48, alignment: .leading)
                    RoundedRectangle(cornerRadius: 5).fill(levelColors[i % levelColors.count].opacity(0.25))
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(levelColors[i % levelColors.count], lineWidth: 1.5))
                        .overlay(alignment: .leading) { Text("\(l.level.rooms.count) Räume").font(.caption2).padding(.leading, 8) }
                    Text(l.heightM.formatted(.number.precision(.fractionLength(2))) + " m").font(.caption2.monospacedDigit()).foregroundStyle(.secondary).frame(width: 52, alignment: .trailing)
                }.frame(height: 30)
            }
        }.padding(.vertical, 6)
    }
}

/// Draufsicht: alle verwendeten Ebenen übereinander in Farbe, so sieht man, ob sie deckungsgleich sind.
private struct LevelOverlay: View {
    let choices: [LevelChoice]
    var body: some View {
        Canvas { ctx, size in
            let shifted = choices.map { c in (c, CGPoint(x: c.offsetX * 1000, y: c.offsetY * 1000)) }
            let pts = shifted.flatMap { c, o in c.level.walls.flatMap { [CGPoint(x: $0.a.x + o.x, y: $0.a.y + o.y), CGPoint(x: $0.b.x + o.x, y: $0.b.y + o.y)] } }
            guard let minX = pts.map(\.x).min(), let maxX = pts.map(\.x).max(), let minY = pts.map(\.y).min(), let maxY = pts.map(\.y).max() else { return }
            let top: CGFloat = 30   // room for the legend
            let s = min((size.width - 16) / max(maxX - minX, 1), (size.height - top - 10) / max(maxY - minY, 1))
            let ox = (size.width - (maxX - minX) * s) / 2, oy = (size.height - top - (maxY - minY) * s) / 2
            let P = { (p: CGPoint) in CGPoint(x: ox + (p.x - minX) * s, y: size.height - oy - (p.y - minY) * s) }
            for (i, (c, o)) in shifted.enumerated() {
                var path = Path()
                for w in c.level.walls { path.move(to: P(CGPoint(x: w.a.x + o.x, y: w.a.y + o.y))); path.addLine(to: P(CGPoint(x: w.b.x + o.x, y: w.b.y + o.y))) }
                ctx.stroke(path, with: .color(levelColors[i % levelColors.count].opacity(0.75)), lineWidth: 1.5)
            }
        }
        .background(Color(uiColor: .tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .topLeading) {
            HStack(spacing: 8) {
                ForEach(Array(choices.enumerated()), id: \.offset) { i, c in
                    Label(c.name ?? "", systemImage: "square.fill").font(.caption2).foregroundStyle(levelColors[i % levelColors.count])
                }
            }.padding(8)
        }
        .accessibilityLabel("Draufsicht aller Ebenen übereinander")
    }
}

/// Kleiner Grundriss eines erkannten Plans.
private struct LevelThumbnail: View {
    let level: PlanEditorLevel
    let color: Color
    var body: some View {
        Canvas { ctx, size in
            let pts = level.walls.flatMap { [$0.a, $0.b] }
            guard let minX = pts.map(\.x).min(), let maxX = pts.map(\.x).max(), let minY = pts.map(\.y).min(), let maxY = pts.map(\.y).max() else { return }
            let s = min((size.width - 12) / max(maxX - minX, 1), (size.height - 12) / max(maxY - minY, 1))
            let ox = (size.width - (maxX - minX) * s) / 2, oy = (size.height - (maxY - minY) * s) / 2
            let P = { (p: CGPoint) in CGPoint(x: ox + (p.x - minX) * s, y: size.height - oy - (p.y - minY) * s) }
            for r in level.rooms where r.polygon.count > 2 {
                var room = Path(); room.addLines(r.polygon.map(P)); room.closeSubpath()
                ctx.fill(room, with: .color(color.opacity(0.08)))
            }
            for w in level.walls {
                var p = Path(); p.move(to: P(w.a)); p.addLine(to: P(w.b))
                ctx.stroke(p, with: .color(.primary.opacity(0.8)), lineWidth: max(1, w.thickness * s))
            }
        }
        .accessibilityLabel("Grundriss Plan \(level.index + 1)")
    }
}
