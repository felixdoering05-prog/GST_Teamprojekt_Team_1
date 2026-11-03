import SwiftUI

struct BuildingNextSteps: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let navigate: (String) -> Void
    @State private var files: [BuildingDocument] = []
    @State private var loaded = false
    @State private var problem: String?
    private var hasModel: Bool { files.contains { $0.mime_type == "application/x-step" } }
    var body: some View {
        Section {
            Label(building.is_owner == false ? "Gemeinsames Gebäude" : "Dein Gebäude", systemImage: "building.2.fill").font(.headline).foregroundStyle(d21Accent)
            Text("Von der ersten Datei zum digitalen Gebäude. Du kannst jeden Schritt später fortsetzen.").foregroundStyle(.secondary)
        }
        .task { await load() }
        Section("Dein nächster Schritt") {
            if let problem { Label(problem, systemImage: "exclamationmark.icloud").foregroundStyle(.orange); Button("Dateistand erneut laden") { Task { await load() } } }
            else if !loaded { ProgressView("Gebäudemappe wird geprüft …") }
            else {
                Button { navigate(hasModel ? "Geräte" : "Dateien") } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(files.isEmpty ? "Erstes Foto oder einen Plan hinzufügen" : hasModel ? "Das Gebäude mit Geräten ergänzen" : "Ein IFC-Modell ergänzen").font(.headline)
                            Text(files.isEmpty ? "Ein Foto reicht für den Anfang." : hasModel ? "Mit einem simulierten Licht starten." : "Für die 3D-Ansicht brauchst du eine IFC-Datei. Unter Dateien hochladen.").font(.subheadline).foregroundStyle(.secondary)
                        }
                    } icon: { Image(systemName: files.isEmpty ? "doc.badge.plus" : hasModel ? "lightbulb" : "cube.transparent") }
                }
            }
        }
        Section("Dein Gebäudepass") {
            step("1", title: "Gebäude angelegt", detail: "Name und Adresse kannst du unten bearbeiten.", done: true, area: "Übersicht")
            step("2", title: "Fotos und Pläne", detail: loaded ? "\(files.count) Dateien gespeichert" : "Dateistand noch nicht verfügbar", done: loaded && !files.isEmpty, area: "Dateien")
            step("3", title: "Gebäude in 3D", detail: hasModel ? "IFC-Modell vorhanden" : "Optional: IFC-Modell hochladen", done: hasModel, area: "3D")
            Button { navigate("Geräte") } label: { Label("4 · Geräte und Räume vorbereiten", systemImage: "house") }
        }
    }
    private func step(_ number: String, title: String, detail: String, done: Bool, area: String) -> some View {
        Button { navigate(area) } label: {
            HStack(spacing: 12) {
                Image(systemName: done ? "checkmark.circle.fill" : "circle").foregroundStyle(done ? d21Accent : .secondary)
                VStack(alignment: .leading, spacing: 4) { Text(number + " · " + title).foregroundStyle(.primary); Text(detail).font(.caption).foregroundStyle(.secondary) }
                Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }.padding(.vertical, 4)
        }
    }
    private func load() async {
        do { let result = try await account.documents(buildingID: building.id); guard !Task.isCancelled else { return }; files = result; loaded = true; problem = nil }
        catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
}
