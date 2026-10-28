import SwiftUI

struct PasswordResetView: View {
    @EnvironmentObject var model: AccountModel
    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var enabled: Bool?
    @State private var step = 1
    @State private var busy = false
    @State private var message: String?
    @State private var problem: String?
    var body: some View {
        Form {
            Section {
                Text("Setze das Passwort deines persönlichen Projektkontos zurück. Der gemeinsame Website-Zugang bleibt unverändert.").font(.subheadline).foregroundStyle(.secondary)
            }
            if enabled == nil { Section { ProgressView("Mailversand wird geprüft …") } }
            else if enabled == false {
                Section { Text("Der E-Mail-Versand ist noch nicht eingerichtet. Bitte melde dich beim Projektteam. Es wurde keine E-Mail verschickt.") }
            } else if step == 3 {
                Section { Label("Passwort geändert", systemImage: "checkmark.circle.fill").foregroundStyle(.green); Text(message ?? "Bitte mit deinem neuen Passwort anmelden.") }
            } else {
                if let message { Section { Text(message).font(.subheadline) } }
                Section("Dein Konto") { TextField("E-Mail", text: $email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled() }
                if step == 2 {
                    Section("Code aus der E-Mail") { TextField("8-stelliger Code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(8)) } }
                    Section("Neues Passwort") { SecureField("Mindestens 12 Zeichen", text: $password).textContentType(.newPassword); SecureField("Passwort wiederholen", text: $confirmation).textContentType(.newPassword) }
                    Section { Text("Der Code gilt 15 Minuten und nur einmal. Nach fünf falschen Eingaben benötigst du einen neuen Code.").font(.footnote).foregroundStyle(.secondary) }
                }
                Section {
                    Button {
                        busy = true; problem = nil
                        Task {
                            defer { busy = false }
                            do {
                                if step == 1 { message = try await model.requestPasswordReset(email: email.trimmingCharacters(in: .whitespacesAndNewlines)); step = 2 }
                                else { message = try await model.confirmPasswordReset(email: email.trimmingCharacters(in: .whitespacesAndNewlines), code: code, password: password); password = ""; confirmation = ""; code = ""; step = 3 }
                            } catch { problem = error.localizedDescription }
                        }
                    } label: { HStack { if busy { ProgressView() }; Text(step == 1 ? "Code per E-Mail anfordern" : "Neues Passwort speichern") } }
                    .disabled(busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (step == 2 && (code.count != 8 || password.count < 12 || password != confirmation)))
                    Button(step == 1 ? "Ich habe bereits einen Code" : "Neuen Code anfordern") { step = step == 1 ? 2 : 1; message = nil }.disabled(busy)
                }
            }
            if let problem { Section { Text(problem).foregroundStyle(.red) } }
        }
        .disabled(busy)
        .navigationTitle("Passwort vergessen").navigationBarTitleDisplayMode(.inline)
        .task { do { enabled = try await model.passwordResetStatus() } catch { enabled = false; problem = error.localizedDescription } }
    }
}
