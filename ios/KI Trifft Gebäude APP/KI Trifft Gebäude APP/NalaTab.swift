import SwiftUI

/// Reiter „Nala“: die Gebäudeassistentin direkt erreichbar – Gebäude wählen, chatten oder sprechen.
struct NalaTabView: View {
    @ObservedObject var model: AccountModel
    @ObservedObject private var router = AppRouter.shared
    @AppStorage("nala.buildingID") private var storedID = 0
    private var building: Building? {
        let favorite = WidgetSnapshot.load()?.favoriteID
        return model.buildings.first { $0.id == storedID } ?? model.buildings.first { $0.id == favorite } ?? model.buildings.first
    }
    var body: some View {
        NavigationStack {
            Group {
                if let building {
                    // Neuer Aufbau bei Gebäudewechsel oder neuer Siri-Frage, damit Verlauf und Vorbelegung stimmen.
                    BuildingAssistantView(building: building, account: model).id("\(building.id)-\(router.nalaRequest)")
                } else {
                    ContentUnavailableView {
                        Label("Hi, ich bin Nala", systemImage: "sparkles")
                    } description: {
                        Text("Deine Gebäudeassistentin. Lege im Reiter „Gebäude“ dein erstes Gebäude an, dann helfe ich dir hier weiter.")
                    }
                }
            }
            .navigationTitle("Nala")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let building, model.buildings.count > 1 {
                    ToolbarItem(placement: .topBarLeading) {
                        Menu {
                            Picker("Gebäude", selection: Binding(get: { building.id }, set: { storedID = $0 })) {
                                ForEach(model.buildings) { Text($0.name).tag($0.id) }
                            }
                        } label: {
                            Label(building.name, systemImage: "building.2").labelStyle(.titleAndIcon).lineLimit(1)
                        }.accessibilityLabel("Gebäude wählen, aktuell \(building.name)")
                    }
                }
                if let building {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink { BuildingVoiceView(building: building, account: model) } label: {
                            Label("Mit Nala sprechen", systemImage: "waveform.circle.fill").labelStyle(.iconOnly).font(.title3)
                        }.accessibilityLabel("Mit Nala sprechen")
                    }
                }
            }
        }
    }
}
