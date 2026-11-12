import SwiftUI

struct NativeBuildingCard: View {
    let building: Building
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                BIMBuildingThumbnail(building:building)
                HStack { Spacer(); Label(building.is_owner == false ? "Geteilt" : "Dein Gebäude", systemImage: building.is_owner == false ? "person.2" : "checkmark.shield").font(.caption.bold()).padding(9).background(.regularMaterial, in: Capsule()) }.padding(12).frame(maxHeight: .infinity, alignment: .top)
            }.frame(height: 112)
            VStack(alignment: .leading, spacing: 10) {
                Text(building.name).font(.title3.bold()).foregroundStyle(.primary)
                Label(building.address.isEmpty ? "Adresse noch offen" : building.address, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary)
            }.padding(18)
        }.background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 24)).clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(d21Accent.opacity(0.12)))
        .accessibilityElement(children: .combine)
    }
}

struct BuildingQuickSheet: View {
    let building: Building
    let open: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    NativeBuildingCard(building: building)
                    Text("Was möchtest du öffnen?").font(.headline)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 135))], spacing: 12) {
                        action("Übersicht", symbol: "building.2")
                        action("Dashboard", symbol: "chart.bar.xaxis")
                        action("3D", symbol: "cube.transparent")
                        action("Dateien", symbol: "folder")
                        action("Geräte", symbol: "lightbulb")
                        action("Heatmap", symbol: "thermometer.sun")
                        action("KI", symbol: "sparkles")
                        action("Team", symbol: "person.2")
                    }
                }.padding(20)
            }.background(Color(.systemGroupedBackground))
            .navigationTitle("Dein Gebäudepass").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Schließen") { dismiss() } } }
        }
        .presentationDetents([.medium,.large]).presentationDragIndicator(.visible)
    }
    private func action(_ name: String, symbol: String) -> some View {
        Button { open(name) } label: { Label(name == "3D" ? "3D-Modell" : name, systemImage: symbol).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 56).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16)) }.buttonStyle(.plain).foregroundStyle(d21Accent)
    }
}

struct BuildingOverviewSummary: View {
    let buildings: [Building]
    let unread: Int
    let hasDraft: Bool
    let create: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("DEINE ÜBERSICHT").font(.caption2.weight(.semibold)).tracking(1.4).foregroundStyle(.white.opacity(0.8))
                    Text("\(buildings.count) Gebäude").font(.system(.title2, design: .rounded, weight: .bold))
                }
                Spacer()
                Button(action: create) { Image(systemName: hasDraft ? "arrow.clockwise" : "plus").font(.title3.weight(.semibold)).frame(width: 46, height: 46).background(.white.opacity(0.17), in: RoundedRectangle(cornerRadius: 16)) }
                    .buttonStyle(.plain).accessibilityLabel(hasDraft ? "Entwurf fortsetzen" : "Gebäude hinzufügen")
            }
            HStack(spacing: 20) {
                Label("\(buildings.filter { $0.model_document_id != nil }.count) Modelle", systemImage: "cube.transparent")
                Label("\(unread) Mitteilungen", systemImage: "bell")
            }.font(.caption).foregroundStyle(.white.opacity(0.85))
        }.foregroundStyle(.white).padding(22).frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [Color(red: 0.07, green: 0.16, blue: 0.29), Color(red: 0.10, green: 0.34, blue: 0.47)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 24))
    }
}

struct BuildingTileButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: configuration.isPressed)
    }
}
