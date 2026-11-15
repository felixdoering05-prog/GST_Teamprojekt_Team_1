import SwiftUI
import UIKit

struct PlanConversionSetting: Decodable { let enabled: Bool; let revision: Int }
/// Plan types the server can turn into a draft: images/PDFs (Gemini) and CAD plans (measured locally).
let planConversionMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/dxf", "application/acad"]
struct PlanDimensionCheck: Decodable { let label: String?; let labelled_mm: Double; let measured_mm: Double; let error_pct: Double }
struct PlanScaleInfo: Decodable { let method: String?; let ratio: Double? }
struct PlanQualityLevel: Decodable {
    let level: String
    let scale: PlanScaleInfo?
    let walls: Int
    let doors: Int
    let windows: Int
    let openings_unclear: Int?
    let rooms: Int
    let rooms_without_door: [String]?
    let dimensions: [PlanDimensionCheck]?
    let dimension_max_error_pct: Double?
    let grade: String?
    var scaleText: String {
        if let ratio = scale?.ratio { return "1:\(Int(ratio.rounded()))" }
        switch scale?.method { case "units", "units+dimensions": return "DXF-Einheit"; case "dimensions": return "aus Maßketten"; default: return "geschätzt" }
    }
}
struct PlanQuality: Decodable { let grade: String; let levels: [PlanQualityLevel] }
struct PlanQualityView: View {
    let quality: PlanQuality
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(quality.grade == "gut" ? "Qualitätsbericht: Maße stimmig" : "Qualitätsbericht: bitte prüfen", systemImage: quality.grade == "gut" ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.semibold)).foregroundStyle(quality.grade == "gut" ? .green : .orange)
            ForEach(Array(quality.levels.enumerated()), id: \.offset) { _, level in
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(level.level) · Maßstab \(level.scaleText)").font(.footnote.weight(.semibold))
                    Text("\(level.walls) Wände · \(level.doors) Türen · \(level.windows) Fenster · \(level.rooms) Räume" + ((level.openings_unclear ?? 0) > 0 ? " · \(level.openings_unclear ?? 0) unklare Öffnungen" : "")).font(.footnote)
                    if let error = level.dimension_max_error_pct {
                        Text("\(level.dimensions?.count ?? 0) Planmaße nachgemessen, größte Abweichung \(error.formatted(.number.precision(.fractionLength(1)))) %").font(.footnote).foregroundStyle(error <= 2 ? Color.secondary : Color.orange)
                    } else { Text("Keine Maßzahlen zum Gegenprüfen gefunden").font(.footnote).foregroundStyle(.orange) }
                    if let missing = level.rooms_without_door, !missing.isEmpty { Text("Ohne erkannte Tür: \(missing.joined(separator: ", "))").font(.footnote).foregroundStyle(.orange) }
                    if let dims = level.dimensions, !dims.isEmpty {
                        DisclosureGroup("Gemessen vs. beschriftet") {
                            ForEach(Array(dims.prefix(20).enumerated()), id: \.offset) { _, d in
                                HStack {
                                    Text(d.label ?? "–").font(.caption.monospacedDigit())
                                    Spacer()
                                    Text("\(Int(d.measured_mm.rounded())) / \(Int(d.labelled_mm.rounded())) mm").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                                    Text("\(d.error_pct.formatted(.number.precision(.fractionLength(1)))) %").font(.caption.monospacedDigit()).foregroundStyle(d.error_pct <= 2 ? Color.secondary : Color.orange)
                                }
                            }
                        }.font(.footnote)
                    }
                }
            }
        }
    }
}
struct PlanConversionJob: Decodable, Identifiable {
    let id: String
    let status: String
    let request_key: String?
    let phase: String?
    let can_rebuild: Bool?
    let warnings: [String]
    let quality: PlanQuality?
    let document_ids: [Int]
    var title: String {
        switch status {
        case "queued": "Wartet auf Analyse"
        case "running": phase == "modelling" || phase == "model_only" ? "3D-Modell wird erzeugt …" : "Grundrisse werden vermessen und erkannt …"
        case "ready": "Entwurf prüfen"
        case "approved": "In Gebäudemappe übernommen"
        case "rejected": "Verworfen"
        case "cancelled": "Abgebrochen"
        case "needs_input": "Besserer Plan erforderlich"
        default: "Nicht abgeschlossen"
        }
    }
}
struct PlanConversionReply: Decodable {
    let available: Bool
    let ai_enabled: Bool
    let policy_version: Int
    let settings: PlanConversionSetting
    let jobs: [PlanConversionJob]
}
struct PlanConversionView: View {
    let building: Building
    @ObservedObject var account: AccountModel
    let onAdopt: () -> Void
    @State private var reply: PlanConversionReply?
    @State private var documents: [BuildingDocument] = []
    @State private var selected: Set<Int> = []
    @State private var previews: [String: UIImage] = [:]
    @State private var error: String?
    @State private var busy = false
    @State private var consent = false
    private var base: String { "buildings/\(building.id)/plan-conversion" }
    private func load() async {
        do {
            let next: PlanConversionReply = try await account.request(base)
            let files = try await account.documents(buildingID: building.id)
            reply = next
            documents = files.filter { planConversionMimeTypes.contains($0.mime_type) }
            for job in next.jobs where job.status == "ready" && previews[job.id] == nil {
                if let data = try? await account.planPreview(buildingID: building.id, jobID: job.id), let image = UIImage(data: data) { previews[job.id] = image }
            }
        } catch is CancellationError {} catch { self.error = error.localizedDescription }
    }
    private func action(_ path: String, body: [String: Any], method: String = "POST") async {
        busy = true; error = nil
        defer { busy = false }
        do {
            struct Result: Decodable {}
            let _: Result = try await account.request(base + path, method: method, body: body)
            if path.hasSuffix("/approve") { onAdopt() }
            await load()
        } catch { self.error = error.localizedDescription }
    }
    var body: some View {
        List {
            Section {
                Text("Lade einen bemaßten Grundriss hoch (am genauesten: Vektor-PDF, DXF oder DWG). Daraus entsteht ein vorläufiger IFC-Entwurf, den du vor der Übernahme prüfst.")
                Text("Experimentell · keine Fachplanung · vorhandene Modelle bleiben erhalten.").font(.footnote).foregroundStyle(.secondary)
            }
            if let reply {
                Section("Automatische Plananalyse") {
                    if reply.available {
                        Toggle("Für dieses Gebäude aktivieren", isOn: Binding(get: { reply.settings.enabled }, set: { enabled in
                            if enabled { consent = true }
                            else { Task { await action("", body: ["enabled": false, "revision": reply.settings.revision, "policy_version": reply.policy_version], method: "PATCH") } }
                        })).disabled(busy || (!reply.ai_enabled && !reply.settings.enabled))
                        Text("Vektor-PDFs, DXF und DWG werden auf dem Server exakt vermessen. Neue Bilder und PDFs werden zusätzlich an Google Gemini übertragen; DXF/DWG bleiben auf dem Server. Nur freigegebene Pläne hochladen. Maximal 4 Dateien / 10 MB pro Auftrag und 3 Aufträge je Konto in 24 Stunden. Deaktivieren bricht offene Entwürfe ab.").font(.footnote).foregroundStyle(.secondary)
                        if !reply.ai_enabled { Text("Bitte zuerst KI unter Profil → KI-Einstellungen aktivieren.") }
                    } else { Text("Auf diesem Server noch nicht verfügbar.") }
                }
                if reply.settings.enabled {
                    Section("Vorhandene Pläne auswählen") {
                        if documents.isEmpty { Text("Lade zuerst einen Grundriss in die Gebäudemappe.") }
                        ForEach(documents) { doc in
                            Button { if selected.contains(doc.id) { selected.remove(doc.id) } else if selected.count < 4 { selected.insert(doc.id) } } label: {
                                HStack { Text(doc.name); Spacer(); Image(systemName: selected.contains(doc.id) ? "checkmark.circle.fill" : "circle") }
                            }.disabled(busy)
                        }
                        Button("Ausgewählte Pläne analysieren") { Task { await action("/jobs", body: ["document_ids": selected.sorted(), "request_key": UUID().uuidString.lowercased()]) } }.disabled(busy || selected.isEmpty || !reply.ai_enabled)
                    }
                }
                ForEach(reply.jobs) { job in
                    Section(job.title) {
                        Text("\(job.document_ids.count) Quelldatei(en)").font(.caption).foregroundStyle(.secondary)
                        if let quality = job.quality { PlanQualityView(quality: quality) }
                        ForEach(Array(job.warnings.enumerated()), id: \.offset) { _, warning in Text(warning).font(.footnote) }
                        if job.can_rebuild == true {
                            Button("Gespeicherte Erkennung erneut prüfen (ohne Google)") { Task { await action("/jobs/\(job.id)/rebuild", body: ["request_key": UUID().uuidString.lowercased()]) } }.disabled(busy || !reply.ai_enabled || !reply.settings.enabled)
                        }
                        if job.status == "ready" {
                            if let image = previews[job.id] { Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Vorläufiger IFC-Entwurf") }
                            Text("Bitte Proportionen und Hinweise prüfen. Übernehmen legt eine zusätzliche IFC-Datei an. Sieben Tage Zeit zur Prüfung.").font(.footnote)
                            Button("Entwurf in Gebäudemappe übernehmen") { Task { await action("/jobs/\(job.id)/approve", body: [:]) } }.disabled(busy || !reply.ai_enabled)
                        }
                        if ["queued", "running", "ready"].contains(job.status) {
                            Button(job.status == "ready" ? "Verwerfen" : "Abbrechen", role: .destructive) { Task { await action("/jobs/\(job.id)/reject", body: [:]) } }.disabled(busy)
                        }
                    }
                }
            } else { ProgressView("Plananalyse wird geladen …") }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle("Plan → 3D-Entwurf")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load(); while !Task.isCancelled { do { try await Task.sleep(for: .seconds(7)) } catch { break }; if !busy { await load() } } }
        .refreshable { if !busy { await load() } }
        .confirmationDialog("Pläne an Google Gemini übertragen?", isPresented: $consent, titleVisibility: .visible) {
            Button("Für dieses Gebäude aktivieren") { if let reply { Task { await action("", body: ["enabled": true, "revision": reply.settings.revision, "policy_version": reply.policy_version], method: "PATCH") } } }
        } message: { Text("Neue Bilder/PDFs werden automatisch zur Analyse an Google gesendet, DXF/DWG nur auf dem Server vermessen. Vorhandene Pläne erst nach deiner Auswahl. Nur Dateien verwenden, die du dafür freigeben darfst.") }
    }
}
