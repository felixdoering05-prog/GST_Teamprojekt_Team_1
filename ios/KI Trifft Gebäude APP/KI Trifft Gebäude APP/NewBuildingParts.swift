import SwiftUI
import MapKit
import Combine

// Building creation: Apple Maps address search with live suggestions, a map to place the pin exactly
// on the building, a step header and photo thumbnails. Searches go to Apple Maps only while typing.

@MainActor final class AddressSearchModel: NSObject, ObservableObject, MKLocalSearchCompleterDelegate {
    @Published var query = "" { didSet { if query != oldValue { completer.queryFragment = query; if query.count < 3 { suggestions = [] } } } }
    @Published var suggestions: [MKLocalSearchCompletion] = []
    @Published var resolving = false
    @Published var problem: String?
    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = [.address, .pointOfInterest]
        // Bias towards Germany; results elsewhere still appear.
        completer.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 50.9, longitude: 9.9), span: MKCoordinateSpan(latitudeDelta: 9, longitudeDelta: 9))
    }

    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let results = Array(completer.results.prefix(6))
        Task { @MainActor in if self.query.count >= 3 { self.suggestions = results } }
    }
    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        Task { @MainActor in self.suggestions = [] }
    }

    /// Resolves a suggestion (or free text) to a formatted address and coordinate.
    func resolve(_ completion: MKLocalSearchCompletion? = nil) async -> (address: String, coordinate: CLLocationCoordinate2D)? {
        resolving = true; problem = nil; defer { resolving = false }
        let request = completion.map { MKLocalSearch.Request(completion: $0) } ?? {
            let r = MKLocalSearch.Request(); r.naturalLanguageQuery = query; return r
        }()
        do {
            guard let item = try await MKLocalSearch(request: request).start().mapItems.first else { problem = "Adresse nicht gefunden."; return nil }
            let mark = item.placemark
            let street = [mark.thoroughfare, mark.subThoroughfare].compactMap { $0 }.joined(separator: " ")
            let city = [mark.postalCode, mark.locality].compactMap { $0 }.joined(separator: " ")
            var address = [street, city].filter { !$0.isEmpty }.joined(separator: ", ")
            if address.isEmpty { address = [completion?.title, completion?.subtitle].compactMap { $0 }.joined(separator: ", ") }
            if let name = item.name, completion != nil, !address.contains(name), mark.thoroughfare == nil { address = name + (address.isEmpty ? "" : ", " + address) }
            suggestions = []
            return (address, mark.coordinate)
        } catch { problem = "Die Adresssuche ist gerade nicht erreichbar. Du kannst die Adresse auch einfach eintippen."; return nil }
    }
}

/// Address step: search with suggestions, map with pin, satellite toggle and exact pin placement.
struct AddressPicker: View {
    @Binding var address: String
    @Binding var latitude: Double?
    @Binding var longitude: Double?
    let name: String
    let locked: Bool
    @StateObject private var search = AddressSearchModel()
    @State private var camera: MapCameraPosition = .automatic
    @State private var satellite = false
    @State private var adjusting = false
    @State private var centre: CLLocationCoordinate2D?
    @FocusState private var focused: Bool

    private var coordinate: CLLocationCoordinate2D? { latitude.flatMap { lat in longitude.map { CLLocationCoordinate2D(latitude: lat, longitude: $0) } } }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Straße, Hausnummer, Ort", text: $search.query).focused($focused).textContentType(.fullStreetAddress).submitLabel(.search)
                    .onSubmit { Task { await choose(nil) } }.disabled(locked)
                if search.resolving { ProgressView().controlSize(.small) }
                else if !search.query.isEmpty { Button { search.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) }.buttonStyle(.plain).accessibilityLabel("Suche leeren") }
            }
            .padding(14).d21Card(cornerRadius: 18)

            if !search.suggestions.isEmpty && focused {
                VStack(spacing: 0) {
                    ForEach(Array(search.suggestions.enumerated()), id: \.offset) { index, item in
                        Button { Task { await choose(item) } } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "mappin.circle.fill").font(.title3).foregroundStyle(.red)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                    if !item.subtitle.isEmpty { Text(item.subtitle).font(.caption).foregroundStyle(.secondary) }
                                }
                                Spacer(minLength: 0)
                            }.padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        if index < search.suggestions.count - 1 { Divider().padding(.leading, 50) }
                    }
                }.d21Card(cornerRadius: 18)
            }
            if let problem = search.problem { Label(problem, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange) }

            ZStack {
                Map(position: $camera, interactionModes: adjusting ? .all : [.zoom, .pan]) {
                    if let coordinate, !adjusting { Marker(name.isEmpty ? "Gebäude" : name, systemImage: "building.2.fill", coordinate: coordinate).tint(d21Accent) }
                }
                .mapStyle(satellite ? .hybrid(elevation: .realistic) : .standard(elevation: .realistic, pointsOfInterest: .excludingAll))
                .onMapCameraChange(frequency: .continuous) { context in centre = context.region.center }
                if adjusting {
                    Image(systemName: "plus.viewfinder").font(.system(size: 38, weight: .light)).foregroundStyle(d21Accent).shadow(color: .white, radius: 2).allowsHitTesting(false)
                }
                if coordinate == nil && !adjusting {
                    VStack(spacing: 8) {
                        Image(systemName: "map").font(.title).foregroundStyle(.secondary)
                        Text("Suche oben nach der Adresse").font(.subheadline).foregroundStyle(.secondary)
                    }.padding(16).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
            .frame(height: 260)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button { satellite.toggle() } label: { Image(systemName: satellite ? "map" : "globe.europe.africa.fill").font(.subheadline.weight(.semibold)).frame(width: 38, height: 38).background(.regularMaterial, in: Circle()) }
                    .buttonStyle(.plain).padding(10).accessibilityLabel(satellite ? "Kartenansicht" : "Satellitenansicht")
            }

            if coordinate != nil || adjusting {
                HStack {
                    if adjusting {
                        Button("Abbrechen") { adjusting = false }.buttonStyle(.bordered)
                        Spacer()
                        Button { if let centre { latitude = centre.latitude; longitude = centre.longitude }; adjusting = false } label: { Label("Pin hier setzen", systemImage: "mappin.and.ellipse") }
                            .buttonStyle(.borderedProminent).tint(d21Accent)
                    } else {
                        Label("Standort gesetzt", systemImage: "checkmark.circle.fill").font(.caption.weight(.semibold)).foregroundStyle(.green)
                        Spacer()
                        Button { adjusting = true; if let coordinate { camera = .camera(MapCamera(centerCoordinate: coordinate, distance: 350)) } } label: { Label("Pin genau setzen", systemImage: "scope") }
                            .font(.caption.weight(.semibold)).buttonStyle(.bordered).disabled(locked)
                    }
                }
                Text(adjusting ? "Karte so verschieben, dass das Fadenkreuz auf dem Gebäude liegt." : "Der Standort wird für Wetter, Heatmap und Kartenumgebung verwendet und mit Mitgliedern des Gebäudes geteilt.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            if !address.isEmpty {
                Label(address, systemImage: "house.fill").font(.subheadline.weight(.semibold)).padding(12).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 16)
            }
        }
        .onAppear {
            if search.query.isEmpty { search.query = address }
            if let coordinate { camera = .camera(MapCamera(centerCoordinate: coordinate, distance: 600, pitch: 45)) }
        }
    }

    private func choose(_ completion: MKLocalSearchCompletion?) async {
        guard let result = await search.resolve(completion) else {
            if completion == nil { address = search.query.trimmingCharacters(in: .whitespacesAndNewlines) }
            return
        }
        focused = false
        address = result.address; search.query = result.address
        latitude = result.coordinate.latitude; longitude = result.coordinate.longitude
        withAnimation(.easeInOut(duration: 0.6)) { camera = .camera(MapCamera(centerCoordinate: result.coordinate, distance: 600, pitch: 45)) }
    }
}

/// Five-step indicator with icons.
struct BuildingStepHeader: View {
    let step: BuildingStep
    private static let symbols: [BuildingStep: String] = [.name: "pencil", .address: "mappin", .photos: "camera.fill", .plans: "doc.text.fill", .overview: "checkmark"]
    var body: some View {
        HStack(spacing: 0) {
            ForEach(BuildingStep.allCases, id: \.rawValue) { item in
                let done = item.rawValue < step.rawValue, current = item == step
                VStack(spacing: 6) {
                    Image(systemName: done ? "checkmark" : Self.symbols[item] ?? "circle")
                        .font(.caption.weight(.bold)).foregroundStyle(done || current ? .white : .secondary)
                        .frame(width: 32, height: 32)
                        .background(done ? AnyShapeStyle(d21Accent.opacity(0.75)) : current ? AnyShapeStyle(d21Accent.gradient) : AnyShapeStyle(Color(uiColor: .tertiarySystemFill)), in: Circle())
                        .overlay(Circle().strokeBorder(d21Accent.opacity(current ? 0.35 : 0), lineWidth: 4).padding(-4))
                    Text(item.title).font(.caption2.weight(current ? .bold : .regular)).foregroundStyle(current ? .primary : .secondary).lineLimit(1).minimumScaleFactor(0.8)
                }.frame(maxWidth: .infinity)
                if item != .overview {
                    Capsule().fill(done ? d21Accent.opacity(0.6) : Color(uiColor: .tertiarySystemFill)).frame(height: 3).frame(maxWidth: 24).offset(y: -10)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Schritt \(step.rawValue) von 5: \(step.title)")
    }
}

/// Thumbnails of the photos staged in the draft (read from the local draft store).
struct DraftPhotoGrid: View {
    @ObservedObject var flow: BuildingWorkflowModel
    @State private var images: [UUID: UIImage] = [:]
    private var items: [DraftUpload] { flow.draft.files.filter(\.isPhoto) }
    var body: some View {
        if !items.isEmpty {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 10)], spacing: 10) {
                ForEach(items) { item in
                    ZStack(alignment: .bottomTrailing) {
                        Group {
                            if let image = images[item.id] { Image(uiImage: image).resizable().scaledToFill() }
                            else { Color(uiColor: .tertiarySystemFill).overlay(ProgressView()) }
                        }.frame(height: 96).frame(maxWidth: .infinity).clipped()
                        Image(systemName: item.state == .saved ? "checkmark.circle.fill" : item.state == .failed ? "exclamationmark.circle.fill" : "arrow.up.circle.fill")
                            .font(.title3).symbolRenderingMode(.palette)
                            .foregroundStyle(.white, item.state == .saved ? Color.green : item.state == .failed ? Color.orange : d21Accent)
                            .padding(6)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .task(id: item.id) { if images[item.id] == nil, let data = try? flow.store.data(for: item) { images[item.id] = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: 240, height: 240)) } }
                    .accessibilityLabel(item.state == .saved ? "Foto gespeichert" : "Foto wird hochgeladen")
                }
            }
        }
    }
}

/// Large tappable option tile used in the photo and plan steps.
struct BuildingOptionTile: View {
    let symbol: String
    let color: Color
    let title: String
    let subtitle: String
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).font(.title3.weight(.semibold)).foregroundStyle(.white).frame(width: 46, height: 46).background(color.gradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }.padding(14).d21Card(cornerRadius: 20)
    }
}
