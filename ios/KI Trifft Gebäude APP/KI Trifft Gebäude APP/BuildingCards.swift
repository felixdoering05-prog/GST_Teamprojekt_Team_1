import SwiftUI

struct NativeBuildingCard: View {
    let building: Building
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [d21Accent.opacity(0.18),Color(.secondarySystemGroupedBackground)], startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: "building.2.crop.circle.fill").font(.system(size: 62)).foregroundStyle(d21Accent.opacity(0.85)).padding(20)
                HStack { Spacer(); Label(building.is_owner == false ? "Geteilt" : "Dein Gebäude", systemImage: building.is_owner == false ? "person.2" : "checkmark.shield").font(.caption.bold()).padding(9).background(.regularMaterial, in: Capsule()) }.padding(12).frame(maxHeight: .infinity, alignment: .top)
            }.frame(height: 132)
            VStack(alignment: .leading, spacing: 10) {
                Text(building.name).font(.title3.bold()).foregroundStyle(.primary)
                Label(building.address.isEmpty ? "Adresse noch offen" : building.address, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary)
                Divider()
                HStack { Text("Gebäude entdecken").font(.subheadline.weight(.semibold)); Spacer(); Image(systemName: "arrow.up.right") }.foregroundStyle(d21Accent)
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
                        action("Sprache", symbol: "waveform")
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
