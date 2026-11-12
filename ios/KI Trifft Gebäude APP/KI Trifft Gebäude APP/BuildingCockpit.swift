import SwiftUI
import Charts

struct BuildingCockpit: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let open: (String) -> Void
    @State private var snapshot: TelemetrySnapshot?
    @State private var problem: String?
    @State private var loading = false
    @Environment(\.scenePhase) private var scenePhase
    private var metricSensors: [TelemetrySensor] {
        guard let snapshot else { return [] }
        return TelemetryMetric.allCases.compactMap { metric in
            snapshot.sensors.filter { $0.metric == metric && snapshot.latest($0) != nil }
                .max { (snapshot.latest($0)?.date ?? .distantPast) < (snapshot.latest($1)?.date ?? .distantPast) }
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if building.model_document_id != nil {
                    Button { open("3D") } label: {
                        ZStack(alignment: .bottomLeading) {
                            BIMBuildingThumbnail(building: building).frame(height: 120)
                            Label("3D öffnen", systemImage: "arrow.up.right").font(.caption.weight(.semibold)).padding(9).background(.regularMaterial, in: Capsule()).padding(12)
                        }.clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }.buttonStyle(BuildingTileButtonStyle())
                } else {
                    Button { open("Dateien") } label: {
                        HStack(spacing: 14) {
                            toolIcon("cube.transparent", color: d21Accent)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("3D-Modell hinzufügen").font(.subheadline.weight(.semibold))
                                Text("IFC hochladen oder aus Plänen erzeugen").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "plus.circle.fill").font(.title2).foregroundStyle(d21Accent)
                        }.padding(14).d21Card(cornerRadius: 22)
                    }.buttonStyle(BuildingTileButtonStyle()).foregroundStyle(.primary)
                }
                HStack {
                    Text("Auf einen Blick").font(.title3.bold())
                    Spacer()
                    if loading && snapshot != nil { ProgressView().controlSize(.small) }
                    else if loading { EmptyView() }
                    else { Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Dashboard aktualisieren") }
                }
                if let problem {
                    Label(problem, systemImage: "exclamationmark.icloud").font(.footnote).foregroundStyle(.orange)
                    if snapshot != nil { Text("Letzter geladener Stand").font(.caption).foregroundStyle(.secondary) }
                }
                if let snapshot {
                    if snapshot.source == "demo" { Label("Lokale Vorschau · fiktive Werte", systemImage: "testtube.2").font(.caption.bold()).foregroundStyle(.orange) }
                    if metricSensors.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "chart.xyaxis.line").font(.largeTitle).foregroundStyle(d21Accent)
                            Text("Deine Messwerte fehlen noch").font(.headline)
                            Button("Sensoren einrichten oder Daten importieren") { open("Sensorik") }.font(.subheadline)
                        }.frame(maxWidth: .infinity).padding(24).d21Card(cornerRadius: 22)
                    }
                    if let sensor = metricSensors.first { MetricChartCard(sensor: sensor, snapshot: snapshot) { open("Sensorik") } }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(metricSensors.dropFirst().prefix(snapshot.energy.isEmpty ? 2 : 1)) { sensor in MetricChartCard(sensor: sensor, snapshot: snapshot, compact: true) { open("Sensorik") } }
                        if let energy = snapshot.energy.first { energyCard(energy, snapshot: snapshot) }
                    }
                    if !metricSensors.isEmpty { Text("Importierte Messwerte · nicht unabhängig verifiziert").font(.caption2).foregroundStyle(.secondary) }
                } else if loading {
                    HStack(spacing: 12) { ProgressView(); Text("Messwerte werden geladen …").font(.subheadline).foregroundStyle(.secondary) }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(18).d21Card(cornerRadius: 22)
                }
                Button { open("Sprache") } label: {
                    HStack(spacing: 14) {
                        VoiceOrb(mode: .idle, level: 0).frame(width: 54, height: 54).scaleEffect(0.32).frame(width: 54, height: 54).clipped().accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Mit deinem Gebäude sprechen").font(.subheadline.weight(.semibold))
                            Text("Echtzeit-Gespräch, jederzeit unterbrechbar").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "phone.circle.fill").font(.title).foregroundStyle(d21Accent)
                    }.padding(12).d21Card(cornerRadius: 22)
                }.buttonStyle(BuildingTileButtonStyle()).foregroundStyle(.primary).accessibilityLabel("Sprachchat öffnen")
                Text("Werkzeuge").font(.title3.bold())
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    tool("Geräte", symbol: "lightbulb", area: "Geräte", color: .orange)
                    tool("KI-Assistent", symbol: "sparkles", area: "KI", color: d21Accent)
                    tool("Pläne & Dateien", symbol: "folder", area: "Dateien", color: .blue)
                    tool("Heatmap", symbol: "thermometer.sun", area: "Heatmap", color: .pink)
                    tool("Energie", symbol: "bolt", area: "Energie", color: .yellow)
                    tool("Sensoren", symbol: "sensor", area: "Sensorik", color: .indigo)
                }
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .refreshable { await load() }
        .task(id: building.id) {
            await load()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { break }
                if scenePhase == .active { await load() }
            }
        }
    }
    private func toolIcon(_ symbol: String, color: Color) -> some View {
        Image(systemName: symbol).font(.body.weight(.semibold)).foregroundStyle(color).frame(width: 38, height: 38)
            .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityHidden(true)
    }
    private func tool(_ title: String, symbol: String, area: String, color: Color) -> some View {
        Button { open(area) } label: {
            HStack(spacing: 10) {
                toolIcon(symbol, color: color)
                Text(title).font(.subheadline.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.85).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }.foregroundStyle(.primary).padding(12).frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
                .d21Card(cornerRadius: 18)
        }.buttonStyle(BuildingTileButtonStyle())
    }
    private func energyCard(_ first: TelemetryEnergy, snapshot: TelemetrySnapshot) -> some View {
        let rows = Array(snapshot.energy.filter { $0.medium == first.medium && $0.unit == first.unit }.sorted { $0.period_start < $1.period_start }.suffix(12))
        return Button { open("Energie") } label: {
            VStack(alignment: .leading, spacing: 12) {
                Label(first.title, systemImage: "bolt.fill").font(.subheadline.weight(.semibold))
                Chart(rows) { row in
                    BarMark(x: .value("Zeitraum", row.period_start), y: .value(row.unit, row.value)).foregroundStyle(.orange.gradient).cornerRadius(4)
                }.chartXAxis(.hidden).frame(height: 100)
                Text("Zeitraumwerte · \(first.unit)").font(.caption).foregroundStyle(.secondary)
            }.padding(18).d21Card(cornerRadius: 22)
        }.buttonStyle(BuildingTileButtonStyle()).foregroundStyle(.primary)
    }
    private func load() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do {
            let data: TelemetrySnapshot = try await account.request("buildings/\(building.id)/telemetry?source=real")
            guard !Task.isCancelled else { return }
            #if DEBUG
            if WorkflowPreview.enabled { snapshot = data; problem = nil; return }
            #endif
            guard data.source == "real" else { throw APIError(status: 0, message: "Keine bestätigte Messdatenquelle.") }
            snapshot = data; problem = nil
        } catch is CancellationError {} catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
}

private struct MetricChartCard: View {
    let sensor: TelemetrySensor
    let snapshot: TelemetrySnapshot
    var compact = false
    let open: () -> Void
    private var points: [TelemetryPoint] { Array(snapshot.series(sensor).suffix(48)) }
    private var color: Color { sensor.metric == .temperature ? .orange : sensor.metric == .humidity ? .blue : d21Accent }
    /// Y range padded around the real values only; the area fill starts at the lower bound, not at zero.
    private var lowerBound: Double { let v = points.map(\.value); guard let lo = v.min(), let hi = v.max() else { return 0 }; return lo - max((hi - lo) * 0.15, 0.5) }
    private var upperBound: Double { let v = points.map(\.value); guard let lo = v.min(), let hi = v.max() else { return 1 }; return hi + max((hi - lo) * 0.15, 0.5) }
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Label(sensor.metric.title, systemImage: sensor.metric.symbol).font(.subheadline).foregroundStyle(.secondary)
                        if let last = points.last { Text(last.value.formatted(.number.precision(.fractionLength(0...1))) + " " + sensor.unit).font(.system(compact ? .title3 : .title2, design: .rounded, weight: .bold)) }
                    }
                    Spacer()
                    Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(.secondary)
                }
                Chart(points) { point in
                    AreaMark(x: .value("Zeit", point.date), yStart: .value(sensor.unit, lowerBound), yEnd: .value(sensor.unit, point.value))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(LinearGradient(colors: [color.opacity(0.22), color.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Zeit", point.date), y: .value(sensor.unit, point.value))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(color).lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    if point.id == points.last?.id {
                        PointMark(x: .value("Zeit", point.date), y: .value(sensor.unit, point.value)).foregroundStyle(color).symbolSize(compact ? 30 : 44)
                    }
                }.chartYScale(domain: lowerBound...upperBound).chartXAxis { if !compact { AxisMarks(values: .automatic(desiredCount: 3)) { _ in AxisGridLine().foregroundStyle(.quaternary); AxisValueLabel(format: .dateTime.hour().minute()) } } }.chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: compact ? 2 : 3)) }.frame(height: compact ? 70 : 100)
                HStack { Text(sensor.name).lineLimit(1); Spacer(); if let last = points.last { Text(last.date, style: .time); if Date().timeIntervalSince(last.date) > 7200 { Image(systemName: "clock.badge.exclamationmark").foregroundStyle(.orange).accessibilityLabel("Messwert älter als zwei Stunden") } } }.font(.caption2).foregroundStyle(.secondary)
            }.padding(18).d21Card(cornerRadius: 22)
        }.buttonStyle(BuildingTileButtonStyle()).foregroundStyle(.primary).accessibilityElement(children: .combine)
    }
}
