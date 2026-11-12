import SwiftUI

struct NativeBuildingCard: View {
    let building: Building
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                BIMBuildingThumbnail(building:building)
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
        VStack(alignment: .leading, spacing: 20) {
            Label("DEIN GEBÄUDEPASS", systemImage: "building.2.crop.circle").font(.caption.weight(.semibold)).tracking(1.2)
            Text(buildings.isEmpty ? "Hier beginnt dein\ndigitales Gebäude." : "Alles rund um\ndeine Gebäude.")
                .font(.system(.title, design: .rounded, weight: .bold)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 24) {
                summary("Gebäude", value: buildings.count)
                summary("Mit 3D-Modell", value: buildings.filter { $0.model_document_id != nil }.count)
                summary("Ungelesen", value: unread)
            }.accessibilityElement(children: .combine)
            Button(action: create) {
                Label(hasDraft ? "Entwurf fortsetzen" : "Gebäude hinzufügen", systemImage: hasDraft ? "arrow.clockwise" : "plus")
                    .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                    .foregroundStyle(Color(red: 0.08, green: 0.18, blue: 0.30))
                    .background(.white, in: RoundedRectangle(cornerRadius: 15))
            }.buttonStyle(.plain)
        }
        .foregroundStyle(.white).padding(24).frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Color(red: 0.07, green: 0.16, blue: 0.29), Color(red: 0.10, green: 0.34, blue: 0.47)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26))
    }
    private func summary(_ title: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value.formatted()).font(.system(.title2, design: .rounded, weight: .bold))
            Text(title).font(.caption).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
        }
    }
}
