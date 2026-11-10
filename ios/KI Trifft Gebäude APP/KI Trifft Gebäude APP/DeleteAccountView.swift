import SwiftUI
struct DeleteAccountView: View {
    @ObservedObject var account: AccountModel
    @State private var password = ""
    @State private var confirm = false
    @State private var busy = false
    @State private var problem: String?
    var body: some View {
        Form {
            Section {
                Text("Dein Konto, Profilbild, Kontakte, eigene Nachrichten und deine Gebäude samt Dateien werden dauerhaft vom aktiven Projektserver gelöscht.")
                Text("Auch andere Mitglieder verlieren den Zugriff auf Gebäude, die dir gehören. Gebäude anderer Eigentümer bleiben bestehen. Bereits an externe Anbieter übermittelte Daten und vorhandene Backups benötigen gegebenenfalls eine gesonderte Löschanfrage an den Support.").font(.footnote).foregroundStyle(.secondary)
            }
            Section("Mit deinem Kontopasswort bestätigen") {
                SecureField("Kontopasswort", text: $password).textContentType(.password)
                Button("Konto dauerhaft löschen", role: .destructive) { confirm = true }.disabled(busy || password.isEmpty)
                if busy { ProgressView("Konto wird gelöscht …") }
            }
            if let problem { Section { Text(problem).foregroundStyle(.red) } }
        }.navigationTitle("Konto löschen")
        .confirmationDialog("Konto und eigene Gebäude unwiderruflich löschen?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Endgültig löschen", role: .destructive) {
                busy = true; problem = nil
                Task { defer { busy = false }; do { try await account.deleteAccount(password: password); password = "" } catch { problem = error.localizedDescription } }
            }
        }
    }
}
