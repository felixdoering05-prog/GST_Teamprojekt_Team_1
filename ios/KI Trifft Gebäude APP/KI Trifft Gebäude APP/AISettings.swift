import SwiftUI

struct AIPreferences: Decodable {
    var device_control_enabled: Bool? = nil
    let enabled: Bool; let policy_version: Int; let revision: Int
    var active: Bool { enabled && policy_version == 1 }
    static let disabled = AIPreferences(enabled: false, policy_version: 0, revision: 0)
}
struct AISettingsView: View {
    @ObservedObject var account: AccountModel
    @State private var busy = false
    @State private var problem: String?
    var body: some View {
        Form {
            Section {
                Toggle("KI-Assistent", isOn: Binding(get: { account.aiPreferences.active }, set: { enabled in Task { busy = true; defer { busy = false }; do { try await account.saveAIPreferences(enabled); problem = nil } catch { problem = error.localizedDescription } } })).disabled(busy).tint(d21Accent)
                Text("Einmal für dein Konto aktivieren. Die Einstellung wird auf dem Projektserver gespeichert und gilt auch auf anderen Geräten und im Web.").font(.footnote).foregroundStyle(.secondary)
                if busy { ProgressView("Wird gespeichert …") }
            }
            Section("Was du aktivierst") {
                Text("Deine bewusst gestarteten Text-KI-Anfragen werden mit begrenzten Gebäudedaten an Google Gemini gesendet. Diese externe Testversion enthält kein Live-Sprach-SDK und überträgt kein Mikrofon-Audio.")
                DisclosureGroup("Daten und Grenzen") {
                    Text("Text-KI: Frage, begrenzte private KI-Historie, Gebäudename/Adresse, Dateinamen und Modell-Typzahlen; bei Messwertanalyse zusammengefasste ausgewählte Werte sowie bewusst geladene Wettermodellwerte mit Quelle und Abrufzeit. Plananalyse ist eine getrennte Freigabe je Gebäude: aktivierte neue Planbilder und PDFs sowie selbst ausgewählte Altdateien werden vollständig an Google Gemini gesendet. Ohne diese Freigabe werden keine Datei-Inhalte automatisch übertragen. Anbieter verarbeiten Daten nach ihren Bedingungen. Es wird kein eigenes Modell trainiert.").font(.footnote)
                }
                Text("Ausschalten sperrt neue KI-Anfragen. Bereits übermittelte Daten können dadurch nicht zurückgerufen werden. Die Live-Sprachfunktion ist in diesem Test-Build nicht verfügbar.").font(.footnote).foregroundStyle(.secondary)
                Text("Mit dieser Freigabe darf der Assistent deine ausdrücklich verbundenen Lampen im gewählten Gebäude schalten, dimmen und färben. Du gibst den Auftrag im Chat oder Gespräch; zusätzliche Haken sind nicht nötig.").font(.footnote).foregroundStyle(.secondary)
            }
            Section { NavigationLink("Open-Source-Lizenzen") { ScrollView { Text((Bundle.main.url(forResource: "ThirdPartyNotices", withExtension: "txt").flatMap { try? String(contentsOf: $0, encoding: .utf8) }) ?? "Lizenzangaben konnten nicht geladen werden.").font(.caption.monospaced()).padding().textSelection(.enabled) }.navigationTitle("Lizenzen") } }
            if let problem { Section { Text(problem).foregroundStyle(.red) } }
        }.navigationTitle("KI-Einstellungen").navigationBarTitleDisplayMode(.inline)
        .task { busy = true; await account.refreshAIPreferences(); busy = false }
    }
}
