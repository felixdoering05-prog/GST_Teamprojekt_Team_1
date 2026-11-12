import SwiftUI

/// Finishes the upload workflow with one explicit, persistent server job.
struct GuidedGenerationView: View {
    @ObservedObject var flow: BuildingWorkflowModel
    let building: Building
    @State private var reply: PlanConversionReply?
    @State private var files: [BuildingDocument] = []
    @State private var selected: Set<Int> = []
    @State private var loading = true
    @State private var error: String?
    @State private var confirming = false
    private var base: String { "buildings/\(building.id)/plan-conversion" }
    private var currentJob: PlanConversionJob? {
        guard let key = flow.draft.generationRequestKey else { return nil }
        return reply?.jobs.first { $0.request_key == key }
    }
    private var selectedBytes: Int { files.filter { selected.contains($0.id) }.reduce(0) { $0 + $1.size } }
    private func load() async {
        do {
            let next: PlanConversionReply = try await flow.account.request(base)
            let documents = try await flow.account.documents(buildingID: building.id)
            guard flow.validAccount else { return }
            reply = next
            files = documents.filter { ["image/jpeg", "image/png", "image/webp", "application/pdf"].contains($0.mime_type) }
            if loading {
                // Exterior photos are never silently selected as floor plans.
                let uploadedPlanIDs = Set(flow.draft.files.filter { !$0.isPhoto && $0.state == .saved }.compactMap { $0.document?.id })
                selected = Set(files.filter { uploadedPlanIDs.contains($0.id) }.prefix(4).map(\.id))
            }
            loading = false; error = nil
        } catch is CancellationError {} catch { loading = false; self.error = error.localizedDescription }
    }
    private func start() async {
        guard !flow.busy, flow.validAccount, let state = reply, state.available, !selected.isEmpty, selected.count <= 4, selectedBytes <= 10 * 1024 * 1024 else { return }
        flow.busy = true; defer { flow.busy = false }
        error = nil
        let ids = selected.sorted()
        if flow.draft.generationDocumentIDs != ids || flow.draft.generationRequestKey == nil {
            flow.draft.generationDocumentIDs = ids
            flow.draft.generationRequestKey = UUID().uuidString.lowercased()
        }
        guard flow.persist(), let key = flow.draft.generationRequestKey else { return }
        do {
            // The confirmation covers both account AI activation and this building's plans.
            if !state.ai_enabled {
                await flow.account.refreshAIPreferences()
                guard flow.validAccount else { return }
                try await flow.account.saveAIPreferences(true, deviceControlEnabled: flow.account.aiPreferences.device_control_enabled ?? false)
            }
            guard flow.validAccount else { return }
            if !state.settings.enabled {
                let _: PlanConversionSetting = try await flow.account.request(base, method: "PATCH", body: ["enabled": true, "revision": state.settings.revision, "policy_version": state.policy_version])
            }
            guard flow.validAccount else { return }
            struct JobReceipt: Decodable { let id: String; let status: String }
            let _: JobReceipt = try await flow.account.request(base + "/jobs", method: "POST", body: ["document_ids": ids, "request_key": key])
            await load()
        } catch { self.error = error.localizedDescription }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Aus Grundrissen wird ein 3D-Entwurf", systemImage: "wand.and.stars").font(.headline)
            if loading { ProgressView("Server wird geprüft …") }
            else if let reply {
                if let job = currentJob {
                    Label(job.title, systemImage: job.status == "ready" ? "checkmark.circle.fill" : "cube.transparent").foregroundStyle(d21Accent)
                    if ["queued", "running"].contains(job.status) {
                        ProgressView()
                        Text("Gemini erkennt den Grundriss, BIMCraft erstellt daraus auf dem Server einen IFC-Entwurf. Du kannst die App verlassen. Eine Fertigmeldung erscheint in deinen Mitteilungen beim nächsten Öffnen. Push bei geschlossener App ist noch nicht eingerichtet.").font(.footnote).foregroundStyle(.secondary)
                    }
                    ForEach(Array(job.warnings.enumerated()), id: \.offset) { _, message in Text(message).font(.footnote).foregroundStyle(.secondary) }
                    NavigationLink(job.status == "ready" ? "3D-Entwurf prüfen und übernehmen" : "Auftrag und Details öffnen") {
                        PlanConversionView(building: building, account: flow.account, onAdopt: {})
                    }.buttonStyle(.bordered)
                } else if !reply.available {
                    Text("Die Modellgenerierung ist auf diesem Server noch nicht verfügbar. Deine Pläne bleiben gespeichert.").font(.footnote)
                } else if files.isEmpty {
                    Text("Für die Generierung fehlt noch ein PDF- oder Bildgrundriss. Du kannst zurückgehen und einen Plan ergänzen. Ein vorhandenes IFC lässt sich direkt in der Gebäudemappe öffnen.").font(.footnote)
                } else {
                    Text("Wähle bis zu vier zusammengehörige Grundrisse, insgesamt maximal 10 MB. Außenfotos werden nicht automatisch ausgewählt.").font(.footnote).foregroundStyle(.secondary)
                    ForEach(files) { file in
                        Button {
                            if selected.contains(file.id) { selected.remove(file.id) }
                            else if selected.count < 4 { selected.insert(file.id) }
                        } label: {
                            HStack { Image(systemName: selected.contains(file.id) ? "checkmark.circle.fill" : "circle"); Text(file.name).multilineTextAlignment(.leading); Spacer() }
                        }.disabled(flow.busy)
                    }
                    if selectedBytes > 10 * 1024 * 1024 { Text("Bitte kleinere Dateien oder weniger Pläne wählen: maximal 10 MB zusammen.").font(.footnote).foregroundStyle(.orange) }
                    Button("3D-Entwurf auf dem Server erstellen", systemImage: "sparkles") { confirming = true }
                        .buttonStyle(.borderedProminent).disabled(flow.busy || selected.isEmpty || selectedBytes > 10 * 1024 * 1024)
                    Text("Ein Entwurf, keine geprüfte Fachplanung. Vor dem Übernehmen kontrollierst du Vorschau, Maßstab und Hinweise. Dein vorhandenes Modell wird nicht ersetzt.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.red); Button("Serverstatus erneut laden") { Task { await load() } }.disabled(flow.busy) }
        }
        .padding(18).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
        .task {
            await load()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(7)) } catch { break }
                if !flow.busy { await load() }
            }
        }
        .confirmationDialog("Grundrisse mit KI verarbeiten?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Freigeben und Entwurf erstellen") { Task { await start() } }
        } message: {
            Text("Die ausgewählten Dateien werden vollständig an Google Gemini übertragen. Damit aktivierst du KI für dein Konto und die automatische Plananalyse für dieses Gebäude; später hochgeladene Bilder und PDFs werden ebenfalls analysiert. Nur Pläne verwenden, die du dafür freigeben darfst. Maximal 3 Aufträge je Konto in 24 Stunden. Abschaltbar unter Plan → 3D-Entwurf.")
        }
    }
}
