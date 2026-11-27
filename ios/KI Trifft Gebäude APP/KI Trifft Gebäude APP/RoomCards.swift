import CoreImage.CIFilterBuiltins
import SwiftUI

// Räume aus der Gebäudestruktur mit Raumkarte, wie im Web (#273, #274):
// Messwert mit Quelle, Mangel mit Foto, Frage an Nala, Umbenennen und QR-Code.

struct StructureFloor: Decodable, Identifiable, Hashable { let id: String; let name: String? }
struct StructureRoom: Decodable, Identifiable, Hashable {
    let id: String
    let name: String?
    let room_code: String?
    let floor_id: String?
    var ifc_global_id: String? = nil
    /// „003 · Projektraum“, ohne doppelte Angaben.
    var displayName: String {
        var parts: [String] = []
        for part in [room_code, name] { if let part, !part.isEmpty, !parts.contains(part) { parts.append(part) } }
        return parts.isEmpty ? tr("Raum ohne Namen") : parts.joined(separator: " · ")
    }
}
struct BuildingStructure: Decodable { let floors: [StructureFloor]; let rooms: [StructureRoom] }
struct RoomCardDetail: Decodable {
    struct Ref: Decodable { let id: Int; let name: String }
    struct Floor: Decodable { let id: String?; let name: String }
    let building: Ref
    let room: StructureRoom
    let floor: Floor?
}
struct RoomLatestReading: Decodable {
    let metric: String
    let value: Double
    let unit: String?
    let measured_at: String
    let source: String?
    let provider: String?
    let sensor_code: String?
}
private struct RoomLatestResponse: Decodable { let reading: RoomLatestReading? }

enum RoomLink {
    /// Gleicher Link wie auf dem gedruckten Web-Etikett.
    static func url(building: Int, room: String) -> URL {
        var parts = URLComponents(string: "https://nala-solutions.de/gebaeude")!
        parts.queryItems = [URLQueryItem(name: "building", value: String(building)), URLQueryItem(name: "room", value: room), URLQueryItem(name: "karte", value: "1")]
        return parts.url!
    }
    /// Erkennt Etikett-Links (`/gebaeude?building=…&room=…&karte=1`).
    static func parse(_ url: URL) -> (building: Int, room: String)? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), parts.path == "/gebaeude" else { return nil }
        let items = parts.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        guard value("karte") == "1", let building = value("building").flatMap(Int.init), let room = value("room"),
              room.range(of: "^[A-Za-z0-9_-]{1,100}$", options: .regularExpression) != nil else { return nil }
        return (building, room)
    }
}

/// Raumliste eines Gebäudes, nach Geschossen gruppiert.
struct BuildingRoomsView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let open: (String) -> Void
    /// Raum aus einem Direktlink (QR-Code), der sofort geöffnet wird.
    var initialRoom: String? = nil
    @State private var structure: BuildingStructure?
    @State private var problem: String?
    @State private var search = ""
    @State private var selected: StructureRoom?

    private func rooms(on floor: String?) -> [StructureRoom] {
        (structure?.rooms ?? []).filter { $0.floor_id == floor }
            .filter { search.isEmpty || $0.displayName.localizedCaseInsensitiveContains(search) }
            .sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
    }
    var body: some View {
        List {
            if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            if let structure {
                if structure.rooms.isEmpty {
                    Section { Text("Dieses Gebäude hat noch keine Räume. Räume entstehen zum Beispiel aus einem IFC-Modell oder einem Raumscan.").foregroundStyle(.secondary) }
                }
                ForEach(structure.floors) { floor in
                    let list = rooms(on: floor.id)
                    if !list.isEmpty { Section(floor.name ?? tr("Geschoss")) { ForEach(list) { row($0) } } }
                }
                let known = Set(structure.floors.map(\.id))
                let loose = (structure.rooms.filter { $0.floor_id == nil || !known.contains($0.floor_id!) })
                    .filter { search.isEmpty || $0.displayName.localizedCaseInsensitiveContains(search) }
                if !loose.isEmpty { Section("Ohne Geschoss") { ForEach(loose) { row($0) } } }
            } else if problem == nil {
                Section { ProgressView("Räume werden geladen …") }
            }
        }
        .searchable(text: $search, prompt: "Raum suchen")
        .refreshable { await load() }
        .task {
            await load()
            if let initialRoom, selected == nil { selected = structure?.rooms.first { $0.id == initialRoom } ?? StructureRoom(id: initialRoom, name: nil, room_code: nil, floor_id: nil) }
        }
        .navigationDestination(item: $selected) { room in
            RoomCardView(building: building, roomID: room.id, account: account, open: open)
        }
    }
    private func row(_ room: StructureRoom) -> some View {
        Button { selected = room } label: {
            HStack {
                Label(room.displayName, systemImage: "door.left.hand.open").foregroundStyle(.primary)
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
            }
        }
    }
    private func load() async {
        do { structure = try await account.request("buildings/\(building.id)/structure"); problem = nil }
        catch { problem = error.localizedDescription }
    }
}

/// Raumkarte: Messwert, Mangel mit Foto, Nala, 3D, Umbenennen und QR-Code.
struct RoomCardView: View {
    let building: Building
    let roomID: String
    @ObservedObject var account: AccountModel
    let open: (String) -> Void
    @State private var detail: RoomCardDetail?
    @State private var reading: RoomLatestReading?
    @State private var readingFailed = false
    @State private var problem: String?
    @State private var reporting = false
    @State private var asking = false
    @State private var showQR = false
    @State private var renaming = false
    @State private var newName = ""
    @State private var saving = false
    @State private var reported = false

    var body: some View {
        List {
            if let problem {
                Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange); Button("Neu laden") { Task { await load() } } }
            }
            if let detail {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        if let code = detail.room.room_code, !code.isEmpty, code != detail.room.name {
                            Text("Raum \(code)").font(.subheadline.weight(.semibold)).foregroundStyle(d21Accent)
                        }
                        Text(detail.room.name ?? detail.room.room_code ?? "").font(.title.bold())
                    }.padding(.vertical, 4)
                    LabeledContent("Geschoss", value: detail.floor?.name ?? tr("Geschoss nicht hinterlegt"))
                    LabeledContent("Gebäude", value: detail.building.name)
                }
                Section("Letzter Raummesswert") { readingView }
                Section {
                    Button { reporting = true } label: { Label("Mangel mit Foto melden", systemImage: "camera") }
                    Button { asking = true } label: { Label("Nala zu diesem Raum fragen", systemImage: "sparkles") }
                    Button { open("3D") } label: { Label("Im Modell anzeigen", systemImage: "cube.transparent") }
                        .disabled(building.model_document_id == nil)
                    Button { showQR = true } label: { Label("Raum-QR-Code", systemImage: "qrcode") }
                    Button { newName = detail.room.name ?? ""; renaming = true } label: { Label("Umbenennen", systemImage: "pencil") }
                } footer: {
                    if reported { Text("Mangel gespeichert.") }
                    else if building.model_document_id == nil { Text("Für dieses Gebäude ist noch kein IFC-Modell hinterlegt.") }
                }
            } else if problem == nil {
                Section { ProgressView() }
            }
        }
        .navigationTitle(detail?.room.name ?? tr("Raum")).navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .task(id: detail?.room.id) {
            // Wie im Web: Messwert jede Minute nachladen, solange die Karte offen ist.
            while !Task.isCancelled, detail != nil {
                try? await Task.sleep(for: .seconds(60))
                if !Task.isCancelled { await loadReading() }
            }
        }
        .sheet(isPresented: $reporting) {
            if let detail {
                IssueReportSheet(building: building, account: account, location: nil, structureRoom: (detail.room.id, detail.room.displayName)) { _ in reported = true }
            }
        }
        .sheet(isPresented: $asking) {
            if let detail {
                NavigationStack {
                    BuildingAssistantView(building: building, account: account, room: (detail.room.id, detail.room.displayName))
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { asking = false } } }
                }
            }
        }
        .sheet(isPresented: $showQR) {
            if let detail { RoomQRSheet(buildingName: detail.building.name, floor: detail.floor?.name, room: detail.room, url: RoomLink.url(building: building.id, room: detail.room.id)) }
        }
        .alert("Raum umbenennen", isPresented: $renaming) {
            TextField("Raumname", text: $newName)
            Button("Abbrechen", role: .cancel) {}
            Button("Speichern") { Task { await rename() } }.disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
        } message: { Text("Der Name gilt für alle Mitglieder. Raum-ID und QR-Link bleiben gleich.") }
    }

    @ViewBuilder private var readingView: some View {
        if readingFailed {
            Text("Der Messwert konnte nicht geladen werden.").foregroundStyle(.secondary)
        } else if let reading {
            let date = ISO8601DateFormatter.withFractions.date(from: reading.measured_at) ?? ISO8601DateFormatter().date(from: reading.measured_at)
            let stale = date.map { Date().timeIntervalSince($0) > 7200 } ?? true
            VStack(alignment: .leading, spacing: 6) {
                Text(metricName(reading.metric)).font(.caption).foregroundStyle(.secondary)
                Text("\(reading.value.formatted(.number.precision(.fractionLength(0...1)))) \(reading.unit ?? "")").font(.title2.bold()).monospacedDigit()
                HStack(spacing: 6) {
                    Text(sourceLabel(reading))
                    if let date { Text("·"); Text(date.formatted(.relative(presentation: .named))) }
                }.font(.caption).foregroundStyle(.secondary)
                if reading.source == "demo" { Label("Simulierter Wert", systemImage: "flask").font(.caption).foregroundStyle(.orange) }
                if stale { Label("Messwert älter als zwei Stunden", systemImage: "clock.badge.exclamationmark").font(.caption).foregroundStyle(.orange) }
            }
        } else {
            Text("Für diesen Raum liegt noch kein Messwert vor.").foregroundStyle(.secondary)
        }
    }
    private func metricName(_ metric: String) -> String {
        switch metric {
        case "temperature": tr("Temperatur")
        case "humidity": tr("Luftfeuchte")
        case "co2": "CO₂"
        case "power": tr("Leistung")
        case "energy": tr("Energie")
        default: metric
        }
    }
    private func sourceLabel(_ reading: RoomLatestReading) -> String {
        if reading.provider == "home-assistant" { return "Home Assistant" }
        if reading.source == "demo" { return tr("Demo") }
        return reading.sensor_code.map { tr("Sensor \($0)") } ?? tr("Sensor")
    }
    private func load() async {
        do {
            detail = try await account.request("buildings/\(building.id)/structure/rooms/\(roomID)")
            problem = nil
            await loadReading()
        } catch { problem = error.localizedDescription }
    }
    private func loadReading() async {
        do { let value: RoomLatestResponse = try await account.request("buildings/\(building.id)/telemetry/rooms/\(roomID)/latest"); reading = value.reading; readingFailed = false }
        catch { readingFailed = (error as? APIError)?.status != 403 }
    }
    private func rename() async {
        let clean = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= 120, !saving else { return }
        saving = true; defer { saving = false }
        do {
            struct Saved: Decodable { let id: String }
            let _: Saved = try await account.request("twin/Room/update", method: "POST", body: ["id": roomID, "data": ["name": clean]])
            await load()
        } catch { problem = error.localizedDescription }
    }
}

extension ISO8601DateFormatter {
    static let withFractions: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter
    }()
}

/// QR-Code für ein Raumetikett: lokal erzeugt, teilen oder drucken.
struct RoomQRSheet: View {
    let buildingName: String
    let floor: String?
    let room: StructureRoom
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var copied = false

    private var image: UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
    /// Etikett mit QR-Code und Raumangaben, wie im Web-Druck.
    private var label: UIImage? {
        guard let code = image else { return nil }
        let size = CGSize(width: 900, height: 1150)
        return UIGraphicsImageRenderer(size: size).image { _ in
            UIColor.white.setFill(); UIRectFill(CGRect(origin: .zero, size: size))
            code.draw(in: CGRect(x: 75, y: 60, width: 750, height: 750))
            let center = NSMutableParagraphStyle(); center.alignment = .center
            func draw(_ text: String, y: CGFloat, size: CGFloat, weight: UIFont.Weight) {
                (text as NSString).draw(in: CGRect(x: 40, y: y, width: 820, height: size * 1.4),
                    withAttributes: [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: UIColor.black, .paragraphStyle: center])
            }
            draw(room.displayName, y: 840, size: 56, weight: .bold)
            draw([floor, buildingName].compactMap { $0 }.joined(separator: " · "), y: 930, size: 36, weight: .regular)
            draw("Nala Solutions", y: 1030, size: 28, weight: .semibold)
        }
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    if let image {
                        Image(uiImage: image).interpolation(.none).resizable().scaledToFit().frame(maxWidth: 280)
                            .padding(16).background(.white, in: RoundedRectangle(cornerRadius: 16))
                            .accessibilityLabel("QR-Code für \(room.displayName)")
                    }
                    VStack(spacing: 4) {
                        Text(room.displayName).font(.title2.bold())
                        Text([floor, buildingName].compactMap { $0 }.joined(separator: " · ")).foregroundStyle(.secondary)
                    }.multilineTextAlignment(.center)
                    Text("Wer den Code scannt und Zugriff auf das Gebäude hat, landet direkt auf dieser Raumkarte – im Web oder in der App.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    VStack(spacing: 10) {
                        if let label {
                            ShareLink(item: Image(uiImage: label), preview: SharePreview(room.displayName, image: Image(uiImage: label))) {
                                Label("Etikett teilen oder drucken", systemImage: "printer").frame(maxWidth: .infinity)
                            }.buttonStyle(.borderedProminent).tint(d21Accent)
                        }
                        Button { UIPasteboard.general.url = url; copied = true } label: {
                            Label(copied ? "Link kopiert" : "Link kopieren", systemImage: copied ? "checkmark" : "link").frame(maxWidth: .infinity)
                        }.buttonStyle(.bordered)
                    }.controlSize(.large)
                }.padding(24)
            }
            .navigationTitle("Raum-QR-Code").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
        }
    }
}
