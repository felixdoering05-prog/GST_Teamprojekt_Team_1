import SwiftUI
import PhotosUI
import UIKit

// Mängelmelder: defects per building with photo, room and an optional position in the IFC model.
// The position comes from "Wo bin ich?" (LiDAR locator) or from a tap in the 3D model and is stored in
// model coordinates, so the defect appears as a marker in the 3D viewer.

struct BuildingIssue: Decodable, Identifiable, Equatable {
    struct Point: Codable, Equatable { let x: Double; let y: Double; let z: Double }
    let id: Int
    let title: String
    let description: String
    let status: String
    let room: String
    let document_id: Int?
    let space_id: Int?
    let point: Point?
    let has_photo: Bool
    let reporter: String
    let is_mine: Bool
    let can_edit: Bool
    let revision: Int
    let created_at: String
    var state: IssueState { IssueState(rawValue: status) ?? .open }
    var createdDate: Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: created_at) ?? ISO8601DateFormatter().date(from: created_at)
    }
}

enum IssueState: String, CaseIterable, Identifiable {
    case open, in_progress, done
    var id: String { rawValue }
    var title: String { switch self { case .open: "Offen"; case .in_progress: "In Arbeit"; case .done: "Erledigt" } }
    var symbol: String { switch self { case .open: "exclamationmark.circle.fill"; case .in_progress: "hammer.circle.fill"; case .done: "checkmark.circle.fill" } }
    var color: Color { switch self { case .open: .red; case .in_progress: .orange; case .done: .green } }
}

/// Where a defect is; prefilled from the room locator or the 3D model.
struct IssueLocation: Equatable {
    var documentID: Int
    var spaceID: Int?
    var room: String
    var point: BuildingIssue.Point?
}

/// Asks the 3D view to fly to a defect once its markers are loaded.
@MainActor final class IssueFocus { static let shared = IssueFocus(); var issueID: Int? }

extension AccountModel {
    func issues(buildingID: Int) async throws -> [BuildingIssue] { try await request("buildings/\(buildingID)/issues") }
    func reportIssue(buildingID: Int, title: String, description: String, room: String, location: IssueLocation?, requestKey: UUID) async throws -> BuildingIssue {
        var body: [String: Any] = ["title": title, "description": description, "room": room, "request_key": requestKey.uuidString.lowercased()]
        if let location {
            body["document_id"] = location.documentID
            if let space = location.spaceID { body["space_id"] = space }
            if let p = location.point { body["point"] = ["x": p.x, "y": p.y, "z": p.z] }
        }
        return try await request("buildings/\(buildingID)/issues", method: "POST", body: body)
    }
    func updateIssue(buildingID: Int, issue: BuildingIssue, status: IssueState) async throws -> BuildingIssue {
        try await request("buildings/\(buildingID)/issues/\(issue.id)", method: "PATCH", body: ["status": status.rawValue, "revision": issue.revision])
    }
    func deleteIssue(buildingID: Int, issueID: Int) async throws {
        let _: LogoutResult = try await request("buildings/\(buildingID)/issues/\(issueID)", method: "DELETE")
    }
    func uploadIssuePhoto(buildingID: Int, issueID: Int, jpeg: Data) async throws -> BuildingIssue {
        let data = try await fileRequest(path: "buildings/\(buildingID)/issues/\(issueID)/photo", data: jpeg, method: "PUT", contentType: "image/jpeg")
        return try JSONDecoder().decode(BuildingIssue.self, from: data)
    }
    func issuePhoto(buildingID: Int, issueID: Int) async throws -> Data { try await fileRequest(path: "buildings/\(buildingID)/issues/\(issueID)/photo") }
}

enum IssuePhoto {
    /// Re-encodes to JPEG (≤1600 px, below 1.9 MB). Re-rendering drops EXIF data such as GPS.
    static func jpeg(_ image: UIImage) -> Data? {
        let longest = max(image.size.width, image.size.height), scale = longest > 1600 ? 1600 / longest : 1
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        for quality in [0.72, 0.6, 0.45, 0.3] { if let data = resized.jpegData(compressionQuality: quality), data.count < 1_900_000 { return data } }
        return nil
    }
}

// MARK: - List

struct BuildingIssuesView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    var open: (String) -> Void = { _ in }
    @State private var issues: [BuildingIssue] = []
    @State private var loaded = false
    @State private var loading = false
    @State private var problem: String?
    @State private var filter = "Offen"
    @State private var reporting = false
    @State private var selected: BuildingIssue?
    private var shown: [BuildingIssue] {
        switch filter {
        case "Offen": issues.filter { $0.state != .done }
        case "Erledigt": issues.filter { $0.state == .done }
        default: issues
        }
    }
    private func count(_ state: IssueState) -> Int { issues.filter { $0.state == state }.count }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if let problem { Label(problem, systemImage: "exclamationmark.icloud").font(.footnote).foregroundStyle(.orange) }
                Picker("Anzeigen", selection: $filter) { ForEach(["Offen", "Erledigt", "Alle"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
                if loaded && shown.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: filter == "Erledigt" ? "tray" : "checkmark.seal").font(.largeTitle).foregroundStyle(d21Accent)
                        Text(filter == "Erledigt" ? "Noch nichts erledigt" : issues.isEmpty ? "Keine Mängel gemeldet" : "Keine offenen Mängel").font(.headline)
                        Text("Mit „Mangel melden“ hältst du Schäden mit Foto und Raum fest. In „Wo bin ich?“ oder im 3D-Modell geht das direkt an der richtigen Stelle.")
                            .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }.frame(maxWidth: .infinity).padding(24).d21Card(cornerRadius: 22)
                } else if !loaded {
                    ProgressView("Mängel werden geladen …").frame(maxWidth: .infinity).padding(24)
                }
                ForEach(shown) { issue in
                    Button { selected = issue } label: { IssueRow(issue: issue) }.buttonStyle(BuildingTileButtonStyle()).foregroundStyle(.primary)
                }
                Label("Meldungen, Fotos und Orte sehen alle Mitglieder dieses Gebäudes. Bitte keine Personen fotografieren.", systemImage: "person.2").font(.caption).foregroundStyle(.secondary)
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .refreshable { await load() }
        .task(id: building.id) { await load() }
        .sheet(isPresented: $reporting) {
            IssueReportSheet(building: building, account: account, location: nil) { created in upsert(created) }
        }
        .sheet(item: $selected) { issue in
            IssueDetailSheet(issue: issue, building: building, account: account, changed: upsert, deleted: { id in issues.removeAll { $0.id == id } },
                             show3D: issue.point != nil && issue.document_id == building.model_document_id ? { IssueFocus.shared.issueID = issue.id; selected = nil; open("3D") } : nil)
        }
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top) { headerTitle; Spacer(); reportButton }
                VStack(alignment: .leading, spacing: 12) { headerTitle; reportButton }
            }
            HStack(spacing: 8) {
                ForEach(IssueState.allCases) { state in
                    Label("\(count(state))", systemImage: state.symbol).font(.caption.weight(.semibold)).fixedSize()
                        .padding(.horizontal, 10).padding(.vertical, 7).background(.white.opacity(0.16), in: Capsule())
                        .accessibilityLabel("\(count(state)) \(state.title)")
                }
            }
        }
        .foregroundStyle(.white).padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Color(red: 0.36, green: 0.10, blue: 0.14), Color(red: 0.62, green: 0.27, blue: 0.12)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
    private var headerTitle: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Mängel").font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.75))
            Text(count(.open) + count(.in_progress) == 1 ? "1 offen" : "\(count(.open) + count(.in_progress)) offen").font(.system(.title, design: .rounded, weight: .bold))
        }
    }
    private var reportButton: some View {
        Button { reporting = true } label: {
            Label("Mangel melden", systemImage: "plus").font(.subheadline.weight(.semibold)).fixedSize().padding(.horizontal, 14).frame(minHeight: 40)
                .background(.white, in: Capsule()).foregroundStyle(Color(red: 0.36, green: 0.10, blue: 0.14))
        }.buttonStyle(BuildingTileButtonStyle())
    }
    private func upsert(_ issue: BuildingIssue) {
        if let i = issues.firstIndex(where: { $0.id == issue.id }) { issues[i] = issue } else { issues.insert(issue, at: 0) }
    }
    private func load() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { issues = try await account.issues(buildingID: building.id); problem = nil; loaded = true }
        catch is CancellationError {} catch { problem = error.localizedDescription; loaded = true }
    }
}

private struct IssueRow: View {
    let issue: BuildingIssue
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: issue.state.symbol).font(.title2).foregroundStyle(issue.state.color).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(issue.title).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
                if !issue.room.isEmpty { Label(issue.room, systemImage: "door.left.hand.open").font(.caption).foregroundStyle(.secondary) }
                HStack(spacing: 6) {
                    Text(issue.state.title).foregroundStyle(issue.state.color)
                    Text("·"); Text(issue.reporter)
                    if let date = issue.createdDate { Text("·"); Text(date, format: .relative(presentation: .named)) }
                }.font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            VStack(spacing: 6) {
                if issue.has_photo { Image(systemName: "photo").accessibilityLabel("mit Foto") }
                if issue.point != nil { Image(systemName: "cube.transparent").accessibilityLabel("im 3D-Modell verortet") }
            }.font(.caption).foregroundStyle(.secondary)
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 18)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Report

struct IssueReportSheet: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let location: IssueLocation?
    let done: (BuildingIssue) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var details = ""
    @State private var roomText = ""
    @State private var place: IssueLocation?
    @State private var rooms: [ModelRoom] = []
    @State private var roomID: Int?
    @State private var photo: UIImage?
    @State private var pickerItem: PhotosPickerItem?
    @State private var camera = false
    @State private var busy = false
    @State private var problem: String?
    @State private var requestKey = UUID()
    @State private var created: BuildingIssue?
    private struct ModelRoom: Decodable, Identifiable { let id: Int; let name: String }
    private struct RoomList: Decodable { let rooms: [ModelRoom] }
    private let suggestions = ["Riss", "Feuchtigkeit / Schimmel", "Licht defekt", "Tür klemmt", "Fenster undicht", "Heizung kalt"]
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Was ist kaputt?", text: $title)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack { ForEach(suggestions, id: \.self) { s in Button(s) { title = s }.buttonStyle(.bordered).controlSize(.small).tint(d21Accent) } }
                    }
                    TextField("Beschreibung (optional)", text: $details, axis: .vertical).lineLimit(3...6)
                } header: { Text("Mangel") }
                Section {
                    if let place, place.point != nil {
                        Label(place.room.isEmpty ? "Position im 3D-Modell" : place.room, systemImage: "scope").foregroundStyle(d21Accent)
                        Button("Position entfernen", role: .destructive) { self.place = nil }
                    } else {
                        if !rooms.isEmpty {
                            Picker("IFC-Raum", selection: $roomID) {
                                Text("Kein Raum gewählt").tag(Int?.none)
                                ForEach(rooms) { Text($0.name).tag(Optional($0.id)) }
                            }
                        }
                        TextField(rooms.isEmpty ? "Raum oder Ort, z. B. Flur 1. OG" : "Oder Ort beschreiben", text: $roomText)
                    }
                } header: { Text("Wo?") } footer: {
                    if place?.point != nil { Text("Der Mangel erscheint als Markierung im 3D-Modell.") }
                }
                Section {
                    if let photo {
                        Image(uiImage: photo).resizable().scaledToFit().frame(maxHeight: 220).clipShape(RoundedRectangle(cornerRadius: 14))
                        Button("Foto entfernen", role: .destructive) { self.photo = nil; pickerItem = nil }
                    }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button { camera = true } label: { Label(photo == nil ? "Foto aufnehmen" : "Neues Foto aufnehmen", systemImage: "camera") }
                    }
                    PhotosPicker(selection: $pickerItem, matching: .images) { Label("Aus Fotos wählen", systemImage: "photo.on.rectangle") }
                } header: { Text("Foto") } footer: {
                    Text("Meldung, Ort und Foto sehen alle Mitglieder dieses Gebäudes. Standortdaten im Foto werden vor dem Hochladen entfernt. Bitte keine Personen fotografieren.")
                }
                if let problem { Section { Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            }
            .navigationTitle("Mangel melden").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { if let created { done(created) }; dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Wird gesendet …" : "Senden") { Task { await send() } }
                        .disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .fullScreenCover(isPresented: $camera) { CameraPicker { image in photo = image }.ignoresSafeArea() }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task { if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { photo = image } }
            }
            .task {
                place = location
                if let location { roomText = location.room }
                guard location == nil, let model = building.model_document_id else { return }
                if let list: RoomList = try? await account.request("documents/\(model)/model-rooms") { rooms = list.rooms.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } }
            }
            .interactiveDismissDisabled(busy)
        }
    }
    private func send() async {
        busy = true; defer { busy = false }; problem = nil
        do {
            var issue: BuildingIssue
            if let created { issue = created } else {
                var where_ = place
                var room = roomText.trimmingCharacters(in: .whitespacesAndNewlines)
                if where_ == nil, let roomID, let model = building.model_document_id, let chosen = rooms.first(where: { $0.id == roomID }) {
                    where_ = IssueLocation(documentID: model, spaceID: chosen.id, room: chosen.name, point: nil)
                    if room.isEmpty { room = chosen.name }
                }
                if room.isEmpty, let where_ { room = where_.room }
                issue = try await account.reportIssue(buildingID: building.id, title: title.trimmingCharacters(in: .whitespacesAndNewlines), description: details.trimmingCharacters(in: .whitespacesAndNewlines), room: String(room.prefix(100)), location: where_, requestKey: requestKey)
                created = issue
            }
            if let photo {
                guard let jpeg = IssuePhoto.jpeg(photo) else { throw APIError(status: 0, message: "Das Foto konnte nicht verkleinert werden.") }
                issue = try await account.uploadIssuePhoto(buildingID: building.id, issueID: issue.id, jpeg: jpeg)
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            done(issue); dismiss()
        } catch {
            problem = created == nil ? error.localizedDescription : "Der Mangel ist gespeichert, das Foto aber noch nicht: \(error.localizedDescription) Bitte erneut senden."
        }
    }
}

private struct CameraPicker: UIViewControllerRepresentable {
    let picked: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let c = UIImagePickerController(); c.sourceType = .camera; c.delegate = context.coordinator; return c
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.picked(image) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

// MARK: - Detail

struct IssueDetailSheet: View {
    @State var issue: BuildingIssue
    let building: Building
    @ObservedObject var account: AccountModel
    let changed: (BuildingIssue) -> Void
    let deleted: (Int) -> Void
    var show3D: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var busy = false
    @State private var problem: String?
    @State private var confirmDelete = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if issue.has_photo {
                        Group {
                            if let image { Image(uiImage: image).resizable().scaledToFit() }
                            else { ProgressView().frame(maxWidth: .infinity, minHeight: 180) }
                        }.clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous)).accessibilityLabel("Foto des Mangels")
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Label(issue.state.title, systemImage: issue.state.symbol).font(.caption.weight(.bold)).foregroundStyle(issue.state.color)
                        Text(issue.title).font(.title2.bold())
                        if !issue.room.isEmpty { Label(issue.room, systemImage: "door.left.hand.open").font(.subheadline).foregroundStyle(.secondary) }
                        HStack(spacing: 4) {
                            Text("Gemeldet von \(issue.reporter)")
                            if let date = issue.createdDate { Text("·"); Text(date, format: .dateTime.day().month().year().hour().minute()) }
                        }.font(.caption).foregroundStyle(.secondary)
                    }
                    if !issue.description.isEmpty { Text(issue.description).font(.body) }
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Status").font(.headline)
                        HStack(spacing: 8) {
                            ForEach(IssueState.allCases) { state in
                                Button { Task { await set(state) } } label: {
                                    Label(state.title, systemImage: state.symbol).font(.caption.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 40)
                                        .background(issue.state == state ? state.color.opacity(0.18) : Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .foregroundStyle(issue.state == state ? state.color : .primary)
                                }.buttonStyle(.plain).disabled(busy).accessibilityAddTraits(issue.state == state ? .isSelected : [])
                            }
                        }
                    }
                    if let show3D {
                        Button(action: show3D) { Label("Im 3D-Modell zeigen", systemImage: "cube.transparent").frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent).tint(d21Accent).controlSize(.large)
                    }
                    if let problem { Label(problem, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.orange) }
                    if issue.can_edit {
                        Button("Mangel löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }.disabled(busy)
                    }
                }.padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Mangel").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .confirmationDialog("Mangel endgültig löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Löschen", role: .destructive) { Task { await remove() } }
            } message: { Text("Meldung und Foto werden für alle Mitglieder entfernt.") }
            .task {
                guard issue.has_photo, image == nil else { return }
                if let data = try? await account.issuePhoto(buildingID: building.id, issueID: issue.id) { image = UIImage(data: data) }
            }
        }
        .presentationDetents([.large])
    }
    private func set(_ state: IssueState) async {
        guard state != issue.state, !busy else { return }
        busy = true; defer { busy = false }
        do { issue = try await account.updateIssue(buildingID: building.id, issue: issue, status: state); changed(issue); problem = nil }
        catch {
            problem = error.localizedDescription
            if (error as? APIError)?.status == 409, let fresh = try? await account.issues(buildingID: building.id).first(where: { $0.id == issue.id }) { issue = fresh; changed(fresh) }
        }
    }
    private func remove() async {
        busy = true; defer { busy = false }
        do { try await account.deleteIssue(buildingID: building.id, issueID: issue.id); deleted(issue.id); dismiss() }
        catch { problem = error.localizedDescription }
    }
}
