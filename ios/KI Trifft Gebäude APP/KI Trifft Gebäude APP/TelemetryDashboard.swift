import SwiftUI
import Charts
import UniformTypeIdentifiers

struct NativeDashboardEntry: View {
    @ObservedObject var account: AccountModel
    @State private var selectedID: Int?
    private var selected: Building? { account.buildings.first { $0.id == selectedID } ?? account.buildings.first }
    var body: some View {
        VStack(spacing: 0) {
            if let building = selected {
                Picker("Gebäude", selection: Binding(get: { selected?.id ?? 0 }, set: { selectedID = $0 })) { ForEach(account.buildings) { Text($0.name).tag($0.id) } }.pickerStyle(.menu).padding(.horizontal)
                TelemetryDashboardView(account: account, building: building).id(building.id)
            } else {
                ContentUnavailableView("Dein Dashboard wartet", systemImage: "chart.bar.xaxis", description: Text("Lege ein Gebäude an oder nimm eine Einladung an. "))
            }
        }
        .navigationTitle("Dashboard").navigationBarTitleDisplayMode(.inline)
    }
}
struct NativeDemoView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View { NavigationStack { TelemetryDashboardView(account: nil, building: nil, localDemo: true).navigationTitle("Vorstellungsmodus").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Demo schließen") { dismiss() } } } } }
}

struct TelemetryDashboardView: View {
    let account: AccountModel?
    let building: Building?
    var localDemo = false
    @State private var snapshot: TelemetrySnapshot?
    @State private var source = "real"
    @State private var area = "Dashboard"
    @State private var sensorID = ""
    @State private var problem: String?
    @State private var loading = false
    @State private var operation = UUID()
    @State private var importCSV = false
    @State private var addSensor = false
    @Environment(\.scenePhase) private var scenePhase
    init(account: AccountModel?, building: Building?, localDemo: Bool = false, initialArea: String = "Dashboard") {
        self.account = account; self.building = building; self.localDemo = localDemo
        _area = State(initialValue: ["Dashboard", "Sensorik", "Energie", "Analyse"].contains(initialArea) ? initialArea : "Dashboard")
    }
    private var selectedSensor: TelemetrySensor? { snapshot?.sensors.first { $0.id == sensorID } ?? snapshot?.sensors.first }
    var body: some View {
        List {
            Section {
                #if DEBUG
                if WorkflowPreview.enabled { Label("VORSCHAU · lokale Testdaten", systemImage: "testtube.2").font(.caption.bold()).foregroundStyle(.orange) }
                #endif
                Label(localDemo ? "DEMO · Fiktive Beispieldaten" : source == "real" ? "Projektserver · importierte Messwerte" : "Projektserver · Demodaten", systemImage: localDemo || source == "demo" ? "testtube.2" : "server.rack").font(.subheadline.bold()).foregroundStyle(localDemo || source == "demo" ? .orange : d21Accent)
                if localDemo { Text("Alles ausprobieren – ohne Konto, Serveränderung oder Gemini-Anfrage. Die Werte sind erfunden.").font(.footnote).foregroundStyle(.secondary) }
                else { Text("Importierte Werte sind nicht unabhängig verifiziert. Die Quellen bleiben getrennt.").font(.caption).foregroundStyle(.secondary) }
                Picker("Ansicht", selection: $area) { ForEach(["Dashboard","Sensorik","Energie","Analyse"], id: \.self) { Text($0).tag($0) } }
            }
            if let problem { Section { Label(problem, systemImage: "exclamationmark.icloud").foregroundStyle(.orange); if snapshot != nil { Text("Letzter geladener Stand. Keine aktuelle Verbindung bestätigt.").font(.footnote) }; Button("Erneut laden") { Task { await load() } }.disabled(loading) } }
            if loading && snapshot == nil { Section { ProgressView("Dashboard wird geladen …") } }
            if let data = snapshot {
                if area == "Dashboard" { overview(data) }
                if area == "Sensorik" { sensors(data) }
                if area == "Energie" { energy(data) }
                if area == "Analyse" { analysis(data) }
                Section("Datenstand") {
                    Text(data.scope).font(.caption).foregroundStyle(.secondary)
                    Text("Geladen: " + dateText(data.generated_at)).font(.caption).foregroundStyle(.secondary)
                    if data.truncated { Label("Begrenzter Ausschnitt – nicht der gesamte Datenbestand", systemImage: "line.3.horizontal.decrease.circle").foregroundStyle(.orange).font(.caption) }
                }
            }
        }
        .toolbar {
            if !localDemo { ToolbarItem(placement: .topBarTrailing) { Menu { Button("Sensor anlegen", systemImage: "sensor") { addSensor = true }; Button("Messwerte aus CSV importieren", systemImage: "square.and.arrow.down") { importCSV = true } } label: { Label("Daten", systemImage: "plus.circle") } } }
        }
        .sheet(isPresented: $addSensor, onDismiss: { Task { await load() } }) { if let account, let building { AddTelemetrySensorView(account: account, building: building, source: source) } }
        .sheet(isPresented: $importCSV, onDismiss: { Task { await load() } }) { if let account, let building { MeasurementImportView(account: account, building: building, source: source, sensors: snapshot?.sensors ?? []) } }
        .refreshable { await load() }
        .task(id: source) {
            snapshot = nil; sensorID = ""; await load()
            guard !localDemo else { return }
            while !Task.isCancelled { do { try await Task.sleep(for: .seconds(30)) } catch { return }; if scenePhase == .active && !importCSV && !addSensor { await load() } }
        }
    }
    @ViewBuilder private func overview(_ data: TelemetrySnapshot) -> some View {
        Section("Letzter gültiger Messwert je Messgröße") {
            ForEach(TelemetryMetric.allCases, id: \.self) { metric in
                let point = data.measurements.filter { $0.metric == metric && $0.quality == "ok" }.max { $0.date < $1.date }
                VStack(alignment: .leading, spacing: 5) {
                    Label(metric.title, systemImage: metric.symbol).font(.subheadline).foregroundStyle(.secondary)
                    Text(point.map { $0.value.formatted(.number.precision(.fractionLength(0...1))) + " " + metric.unit } ?? "Noch keine Werte").font(.title2.bold())
                    if let point { Text(point.sensor_code + " · " + dateText(point.measured_at)).font(.caption).foregroundStyle(.secondary); if Date().timeIntervalSince(point.date) > 7200 { Label("Älter als zwei Stunden", systemImage: "clock").font(.caption).foregroundStyle(.orange) } }
                }.padding(.vertical, 5)
            }
        }
        Section("Verlauf") {
            if let sensor = selectedSensor {
                Picker("Sensor", selection: Binding(get: { selectedSensor?.id ?? "" }, set: { sensorID = $0 })) { ForEach(data.sensors) { Text($0.name).tag($0.id) } }
                let series = Array(data.series(sensor).suffix(48))
                if series.isEmpty { Text("Für diesen Sensor fehlen auswertbare Werte.").foregroundStyle(.secondary) }
                else { Chart(series) { point in LineMark(x: .value("Zeit", point.date), y: .value(sensor.unit, point.value)).foregroundStyle(d21Accent); PointMark(x: .value("Zeit", point.date), y: .value(sensor.unit, point.value)).foregroundStyle(d21Accent) }.frame(height: 190).accessibilityLabel("Messverlauf von \(sensor.name), \(series.count) Werte"); Text("Bis zu 48 geladene gültige Werte · \(sensor.unit)").font(.caption).foregroundStyle(.secondary) }
            } else { Text("Noch kein Sensor. Über Daten → Sensor anlegen beginnen und anschließend CSV-Messwerte importieren.").foregroundStyle(.secondary) }
        }
    }
    @ViewBuilder private func sensors(_ data: TelemetrySnapshot) -> some View {
        Section("Sensoren (\(data.sensors.count))") {
            if data.sensors.isEmpty { Text("Für diese Quelle sind keine Sensoren vorhanden.").foregroundStyle(.secondary) }
            ForEach(data.sensors) { sensor in
                VStack(alignment: .leading, spacing: 6) {
                    Label(sensor.name, systemImage: sensor.metric.symbol).font(.headline)
                    Text(sensor.sensor_code + " · " + sensor.metric.title).font(.caption).foregroundStyle(.secondary)
                    if let point = data.latest(sensor) { Text(point.value.formatted(.number.precision(.fractionLength(0...1))) + " " + sensor.unit); Text(dateText(point.measured_at)).font(.caption).foregroundStyle(.secondary) }
                    Text(data.level(sensor)).font(.caption.bold()).foregroundStyle(levelColor(data.level(sensor)))
                }.padding(.vertical, 4)
            }
        }
    }
    @ViewBuilder private func energy(_ data: TelemetrySnapshot) -> some View {
        Section("Verbrauchszeiträume") {
            if data.energy.isEmpty { ContentUnavailableView("Noch keine Energiedaten", systemImage: "bolt", description: Text("Die im Web-Dashboard importierten Energiezeiträume dieses Gebäudes erscheinen auch hier. Der CSV-Import auf dem iPhone unterstützt zunächst Sensormessungen.")) }
            ForEach(data.energy) { row in VStack(alignment: .leading, spacing: 5) { Label(row.title, systemImage: "bolt.fill").font(.headline); Text(row.value.formatted() + " " + row.unit).font(.title3); Text(dateText(row.period_start) + " – " + dateText(row.period_end)).font(.caption).foregroundStyle(.secondary) } }
            Text("Keine Hochrechnung und keine Summierung über möglicherweise überlappende Zeiträume oder unterschiedliche Einheiten.").font(.caption).foregroundStyle(.secondary)
        }
    }
    @ViewBuilder private func analysis(_ data: TelemetrySnapshot) -> some View {
        Section("Regelbasierte Auswertung") {
            Text("Dieselben Projekt-Grenzwerte wie auf der Website. Diese Auswertung läuft ohne Gemini und ist keine bestätigte Gebäudediagnose.").font(.footnote).foregroundStyle(.secondary)
            ForEach(data.sensors) { sensor in
                VStack(alignment: .leading, spacing: 6) {
                    Text(sensor.name).font(.headline); Text(data.level(sensor)).foregroundStyle(levelColor(data.level(sensor)))
                    if let last = data.latest(sensor) { Text("Letzter gültiger Wert: \(last.value.formatted()) \(sensor.unit) · \(dateText(last.measured_at))").font(.caption).foregroundStyle(.secondary) }
                    if let limits = data.thresholds[sensor.metric.rawValue] { Text("Warnbereich: \(limits.warning_min.map { $0.formatted() } ?? "offen") bis \(limits.warning_max.map { $0.formatted() } ?? "offen") \(sensor.unit)").font(.caption).foregroundStyle(.secondary) }
                    let series = data.series(sensor)
                    if series.count >= 2, let first = series.first, let last = series.last { Text("Änderung im geladenen Ausschnitt: \((last.value - first.value).formatted(.number.precision(.fractionLength(0...1)))) \(sensor.unit). Keine Prognose.").font(.caption).foregroundStyle(.secondary) }
                }.padding(.vertical, 5)
            }
            if data.sensors.isEmpty { Text("Für die Auswertung fehlen Sensoren und Messwerte.") }
        }
        Section("Mit Gemini verstehen") {
            if localDemo { Label("Lokale Demo ohne KI-Anfrage", systemImage: "sparkles"); Text("Im angemeldeten Dashboard kannst du einen begrenzten Messwertkontext prüfen und bewusst an Gemini senden. Es wird dabei kein Modell trainiert.").font(.footnote).foregroundStyle(.secondary) }
            else if let account, let building { NavigationLink { GeminiMeasurementAnalysisView(account: account, building: building, source: source) } label: { Label("Daten prüfen und Gemini fragen", systemImage: "sparkles") }; Text("Kein automatischer Versand. Echte und Demo-Messwerte werden getrennt ausgewertet.").font(.footnote).foregroundStyle(.secondary) }
        }
    }
    private func dateText(_ text: String) -> String { MeasurementTime.parse(text)?.formatted(date: .abbreviated, time: .shortened) ?? "Zeitpunkt unbekannt" }
    private func levelColor(_ level: String) -> Color { level == "Kritisch" ? .red : level == "Warnung" ? .orange : .secondary }
    private func load() async {
        let ticket = UUID(); operation = ticket; loading = true; let originalSource = source; defer { if operation == ticket { loading = false } }
        do {
            let value: TelemetrySnapshot
            if localDemo { value = .demo() }
            else if let account, let building { value = try await account.request("buildings/\(building.id)/telemetry?source=\(originalSource)") }
            else { return }
            guard !Task.isCancelled, originalSource == source, operation == ticket else { return }; snapshot = value; problem = nil
        } catch { if !Task.isCancelled, source == originalSource, operation == ticket { problem = error.localizedDescription } }
    }
}

struct AddTelemetrySensorView: View {
    @ObservedObject var account: AccountModel
    let building: Building; let source: String
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var code = ""
    @State private var metric: TelemetryMetric = .temperature
    @State private var saving = false
    @State private var problem: String?
    @State private var submitted: [String:Any]?
    var body: some View {
        NavigationStack {
            Form {
                Section("Messdaten vorbereiten") { Text("\(building.name) · \(source == "real" ? "Messwerte" : "Server-Demo")"); Text("Eine Sensorkennung ordnet CSV-Zeilen zu. Es wird keine Hardware gekoppelt und es entstehen noch keine Messwerte.").font(.footnote).foregroundStyle(.secondary) }
                Section { TextField("Name, zum Beispiel Besprechungsraum", text: $name); TextField("Kennung, zum Beispiel TEMP-01", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled(); Picker("Messgröße", selection: $metric) { ForEach(TelemetryMetric.allCases, id: \.self) { Text($0.title).tag($0) } } }.disabled(submitted != nil)
                if let problem { Section { Text(problem).foregroundStyle(.red) } }
                Section { Button(saving ? "Wird gespeichert …" : submitted == nil ? "Sensor speichern" : "Speichern erneut bestätigen") { Task { await save() } }.disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty || name.count > 100 || code.range(of: "^[A-Za-z0-9_-]{1,60}$", options: .regularExpression) == nil) }
            }.navigationTitle("Sensor anlegen").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() }.disabled(saving) } }.interactiveDismissDisabled(saving)
        }
    }
    private func save() async {
        guard !saving else { return }; saving = true; defer { saving = false }
        if submitted == nil { submitted = ["name":name.trimmingCharacters(in: .whitespaces),"sensor_code":code,"metric":metric.rawValue,"source":source] }
        do { let _: TelemetrySensor = try await account.request("buildings/\(building.id)/telemetry/sensors", method: "POST", body: submitted); dismiss() } catch { problem = error.localizedDescription }
    }
}

struct MeasurementImportView: View {
    @ObservedObject var account: AccountModel
    let building: Building; let source: String; let sensors: [TelemetrySensor]
    @Environment(\.dismiss) private var dismiss
    @State private var picker = false
    @State private var rows: [MeasurementCSVRow] = []
    @State private var fileName = ""
    @State private var problem: String?
    @State private var saving = false
    @State private var imported: Int?
    @State private var submitted = false
    @State private var requestKey = UUID()
    private var unknown: [String] { Array(Set(rows.map(\.sensor_code))).filter { code in sensors.filter { $0.sensor_code.lowercased() == code.lowercased() }.count != 1 } }
    var body: some View {
        NavigationStack {
            Form {
                Section("1 · Datei auswählen") {
                    Text(building.name + " · " + (source == "real" ? "Als Messwerte importieren" : "Als Demo importieren"))
                    Text("Zuerst die Sensorkennungen über Daten → Sensor anlegen erfassen. Die CSV wird erst nach deiner Bestätigung übertragen.").font(.footnote).foregroundStyle(.secondary)
                    Button(fileName.isEmpty ? "CSV auswählen" : "Andere CSV auswählen", systemImage: "doc") { picker = true }.disabled(submitted || saving)
                    DisclosureGroup("CSV-Format und Beispiel") { Text(MeasurementCSV.example).font(.caption.monospaced()).textSelection(.enabled); Text("UTF-8 · maximal 1 MB und 200 Zeilen. UTC oder Zeitzone erforderlich. Semikolon unterstützt Dezimalkomma. Keine mehrzeiligen Zellen.").font(.caption) }
                }
                if !rows.isEmpty {
                    Section("2 · Vorschau prüfen") { Text("\(rows.count) Werte · \(fileName)"); ForEach(Array(rows.prefix(5).enumerated()), id: \.offset) { _, row in VStack(alignment: .leading) { Text(row.sensor_code + " · " + row.value.formatted()); Text(row.measured_at).font(.caption).foregroundStyle(.secondary) } }; if rows.count > 5 { Text("Weitere \(rows.count - 5) Werte werden ebenfalls importiert.").font(.caption) }; if !unknown.isEmpty { Text("Kennungen fehlen oder sind nicht eindeutig: " + unknown.joined(separator: ", ")).foregroundStyle(.red) } }
                    if imported == nil { Section("3 · Auf dem Server speichern") { Text("Alle Zeilen werden zusammen gespeichert. Wiederholtes Bestätigen derselben Anlage erzeugt keine Duplikate. Quelle Messwerte ist deine Einstufung, keine automatische Echtheitsprüfung.").font(.footnote).foregroundStyle(.secondary); Button(saving ? "Import läuft …" : submitted ? "Denselben Import erneut bestätigen" : "\(rows.count) Messwerte importieren") { Task { await upload() } }.disabled(saving || !unknown.isEmpty) } }
                }
                if let imported { Section { Label("\(imported) Messwerte gespeichert", systemImage: "checkmark.circle.fill").foregroundStyle(.green); Button("Fertig") { dismiss() } } }
                if let problem { Section { Text(problem).foregroundStyle(.red) } }
            }
            .navigationTitle("Messwerte importieren").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() }.disabled(saving) } }.interactiveDismissDisabled(saving)
            .fileImporter(isPresented: $picker, allowedContentTypes: [.commaSeparatedText,.plainText], allowsMultipleSelection: false) { result in
                do {
                    guard let url = try result.get().first else { return }
                    let scoped = url.startAccessingSecurityScopedResource(); defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard size <= 1_048_576 else { throw MeasurementCSVError.invalid("CSV maximal 1 MB.") }
                    let data = try Data(contentsOf: url)
                    guard data.count <= 1_048_576, let text = String(data: data, encoding: .utf8) else { throw MeasurementCSVError.invalid("Bitte eine UTF-8-CSV bis 1 MB auswählen.") }
                    let parsed = try MeasurementCSV.parse(text); rows = parsed; fileName = url.lastPathComponent; problem = nil; requestKey = UUID(); submitted = false
                } catch { problem = error.localizedDescription }
            }
        }
    }
    private func upload() async {
        guard !saving, imported == nil else { return }; saving = true; submitted = true; defer { saving = false }
        struct Result: Decodable { let imported: Int }
        do { let result: Result = try await account.request("buildings/\(building.id)/telemetry/import", method: "POST", body: ["source":source,"rows":rows.map(\.json),"request_key":requestKey.uuidString.lowercased()]); imported = result.imported; problem = nil }
        catch { problem = error.localizedDescription }
    }
}
