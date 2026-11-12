import SwiftUI

struct NativeBuildingCard: View {
    let building: Building
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                BIMBuildingThumbnail(building:building)
                LinearGradient(colors: [.clear, Color.black.opacity(0.04)], startPoint: .center, endPoint: .bottom).allowsHitTesting(false)
                Label(building.is_owner == false ? "Geteilt" : "Dein Gebäude", systemImage: building.is_owner == false ? "person.2.fill" : "checkmark.shield.fill")
                    .font(.caption2.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule()).padding(12)
            }.frame(height: 128).clipped()
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(building.name).font(.system(.title3, design: .rounded, weight: .bold)).foregroundStyle(.primary).lineLimit(2)
                    Label(building.address.isEmpty ? "Adresse noch offen" : building.address, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(d21Accent)
                    .frame(width: 34, height: 34).background(d21Accent.opacity(0.12), in: Circle()).accessibilityHidden(true)
            }.padding(.horizontal, 18).padding(.vertical, 16)
        }.d21Card(cornerRadius: 26)
        .accessibilityElement(children: .combine)
    }
}

/// Shared card surface: grouped background, continuous corners and a very soft shadow in light mode.
struct D21CardSurface: ViewModifier {
    var cornerRadius: CGFloat = 22
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.05), radius: 10, y: 4)
    }
}

extension View {
    func d21Card(cornerRadius: CGFloat = 22) -> some View { modifier(D21CardSurface(cornerRadius: cornerRadius)) }
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
    private var models: Int { buildings.filter { $0.model_document_id != nil }.count }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Deine Übersicht").font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.75))
                    Text(buildings.count == 1 ? "1 Gebäude" : "\(buildings.count) Gebäude").font(.system(.largeTitle, design: .rounded, weight: .bold)).minimumScaleFactor(0.7).lineLimit(1)
                }
                Spacer()
                Button(action: create) {
                    Label(hasDraft ? "Fortsetzen" : "Neu", systemImage: hasDraft ? "arrow.clockwise" : "plus")
                        .font(.subheadline.weight(.semibold)).padding(.horizontal, 14).frame(minHeight: 40)
                        .background(.white, in: Capsule()).foregroundStyle(Color(red: 0.07, green: 0.18, blue: 0.31))
                }.buttonStyle(BuildingTileButtonStyle()).accessibilityLabel(hasDraft ? "Entwurf fortsetzen" : "Gebäude hinzufügen")
            }
            HStack(spacing: 8) {
                chip("\(models)", models == 1 ? "Modell" : "Modelle", symbol: "cube.transparent")
                chip("\(unread)", unread == 1 ? "Mitteilung" : "Mitteilungen", symbol: unread > 0 ? "bell.badge" : "bell")
            }
        }.foregroundStyle(.white).padding(22).frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack(alignment: .bottomTrailing) {
                    LinearGradient(colors: [Color(red: 0.06, green: 0.15, blue: 0.28), Color(red: 0.05, green: 0.36, blue: 0.42)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "building.2").font(.system(size: 120, weight: .thin)).foregroundStyle(.white.opacity(0.07)).offset(x: 18, y: 26).accessibilityHidden(true)
                }.clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            }
            .accessibilityElement(children: .contain)
    }
    private func chip(_ value: String, _ title: String, symbol: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.caption.weight(.semibold))
            Text(value).font(.subheadline.weight(.bold)).monospacedDigit()
            Text(title).font(.caption).foregroundStyle(.white.opacity(0.8))
        }.padding(.horizontal, 12).padding(.vertical, 8).background(.white.opacity(0.14), in: Capsule())
        .accessibilityElement(children: .combine)
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
