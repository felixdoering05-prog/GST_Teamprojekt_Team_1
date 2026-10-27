
import SwiftUI

// MARK: - Gebäudedaten

struct Building: Identifiable, Codable, Equatable {
    var id = UUID()
    var name: String
    var address: String
}

// MARK: - Hauptansicht

struct ContentView: View {

    @State private var buildings: [Building] = [
        Building(
            name: "Gebäude D21",
            address: "Hochschule Darmstadt"
        )
    ]

    @AppStorage("d21.localBuildings.v1") private var savedBuildings = Data()
    @State private var hasLoadedBuildings = false
    @State private var search = ""
    @State private var storageError: String?
    @State private var showAddBuilding = false
    @State private var newName = ""
    @State private var newAddress = ""

    var body: some View {
        TabView {

            // MARK: Gebäude
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Willkommen")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            Text("Meine Gebäude")
                                .font(.largeTitle)
                                .fontWeight(.bold)

                            Text("Verwalte deine digitalen Gebäude.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.top, 12)

                        // Gebäudeliste
                        ForEach(buildings.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.address.localizedCaseInsensitiveContains(search) }) { building in
                            NavigationLink {
                                BuildingDetailView(building: building)
                            } label: {
                                HStack(spacing: 15) {

                                    Image(systemName: "building.2")
                                        .font(.system(size: 30))
                                        .foregroundStyle(.blue)
                                        .frame(width: 55, height: 55)
                                        .background(
                                            Color.blue.opacity(0.1),
                                            in: RoundedRectangle(
                                                cornerRadius: 12
                                            )
                                        )

                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(building.name)
                                            .font(.headline)
                                            .foregroundStyle(.primary)

                                        Text(building.address)
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }

                                    Spacer()

                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(.secondary)
                                }
                                .padding()
                                .background(
                                    Color.gray.opacity(0.1),
                                    in: RoundedRectangle(
                                        cornerRadius: 16
                                    )
                                )
                            }
                            .buttonStyle(.plain)
                        }

                        // Gebäude hinzufügen
                        Button {
                            newName = ""
                            newAddress = ""
                            showAddBuilding = true
                        } label: {
                            Label(
                                "Gebäude hinzufügen",
                                systemImage: "plus.circle.fill"
                            )
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding()
                        }
                        .buttonStyle(.borderedProminent)

                        // Hinweis
                        HStack(spacing: 10) {
                            Image(systemName: "info.circle")
                            Text("Lokaler Prototyp: Gebäude bleiben auf diesem Gerät gespeichert. Keine Server-Synchronisierung.")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)
                    }
                    .padding()
                }
                .searchable(text: $search, prompt: "Gebäude suchen")
                .navigationTitle("D21 Gebäude")
                .navigationBarTitleDisplayMode(.inline)
                .sheet(isPresented: $showAddBuilding) {
                    addBuildingSheet
                }
            }
            .tabItem {
                Label("Gebäude", systemImage: "building.2")
            }

            // MARK: Meldungen
            NavigationStack {
                ContentUnavailableView(
                    "Keine Meldungen",
                    systemImage: "bell",
                    description: Text(
                        "Hier erscheinen später Gebäudewarnungen."
                    )
                )
                .navigationTitle("Meldungen")
            }
            .tabItem {
                Label("Meldungen", systemImage: "bell")
            }

            // MARK: Profil
            NavigationStack {
                List {
                    Section("Benutzerkonto") {
                        Label(
                            "Anmeldung folgt",
                            systemImage: "person.crop.circle"
                        )
                        Label(
                            "Gebäudefreigaben folgen",
                            systemImage: "person.2"
                        )
                    }

                    Section("App") {
                        LabeledContent(
                            "Version",
                            value: "0.1 – Prototyp"
                        )
                    }
                }
                .navigationTitle("Profil")
            }
            .tabItem {
                Label("Profil", systemImage: "person.crop.circle")
            }
        }
        .tint(Color(red: 0.07, green: 0.49, blue: 0.51))
        .onAppear {
            guard !hasLoadedBuildings else { return }
            if !savedBuildings.isEmpty {
                do { buildings = try JSONDecoder().decode([Building].self, from: savedBuildings) }
                catch { storageError = "Die lokal gespeicherten Gebäude konnten nicht geladen werden. Vorhandene Daten wurden nicht überschrieben."; return }
            }
            hasLoadedBuildings = true
        }
        .onChange(of: buildings) { _, updated in
            guard hasLoadedBuildings else { return }
            do { savedBuildings = try JSONEncoder().encode(updated) }
            catch { storageError = "Die Gebäude konnten nicht gespeichert werden." }
        }
        .alert("Lokaler Speicher", isPresented: Binding(get: { storageError != nil }, set: { if !$0 { storageError = nil } })) {
            Button("OK") { storageError = nil }
        } message: { Text(storageError ?? "") }
    }

    // MARK: - Neues Gebäude

    private var addBuildingSheet: some View {
        NavigationStack {
            Form {
                Section("Gebäudeinformationen") {
                    TextField(
                        "Name des Gebäudes",
                        text: $newName
                    )

                    TextField(
                        "Adresse",
                        text: $newAddress
                    )
                }
            }
            .navigationTitle("Neues Gebäude")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        showAddBuilding = false
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") {
                        let building = Building(
                            name: newName.trimmingCharacters(
                                in: .whitespacesAndNewlines
                            ),
                            address: newAddress.trimmingCharacters(in: .whitespacesAndNewlines)
                        )

                        buildings.append(building)

                        newName = ""
                        newAddress = ""
                        showAddBuilding = false
                    }
                    .disabled(
                        newName.trimmingCharacters(
                            in: .whitespacesAndNewlines
                        ).isEmpty
                    )
                }
            }
        }
    }
}

// MARK: - Gebäudedetails

struct BuildingDetailView: View {

    let building: Building

    var body: some View {
        List {

            Section("Gebäudeinformationen") {
                LabeledContent(
                    "Gebäude",
                    value: building.name
                )

                LabeledContent(
                    "Adresse",
                    value: building.address
                )
            }

            Section("Digitaler Zwilling") {
                Label(
                    "3D-Gebäudemodell",
                    systemImage: "cube.transparent"
                )

                Label(
                    "Baupläne und Dokumente",
                    systemImage: "doc.text"
                )

                Label(
                    "Sensoren und Messwerte",
                    systemImage: "thermometer"
                )

                Label(
                    "KI-Auswertung",
                    systemImage: "brain.head.profile"
                )
            }

            Section("Zusammenarbeit") {
                Label(
                    "Gebäude teilen",
                    systemImage: "square.and.arrow.up"
                )
            }

            Section {
                Text(
                    "Diese Funktionen werden in den nächsten Entwicklungsschritten angebunden."
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
        .navigationTitle(building.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Vorschau

#Preview {
    ContentView()
}

