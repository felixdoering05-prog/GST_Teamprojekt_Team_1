import SwiftUI
import Combine
import Security
import PhotosUI
import UniformTypeIdentifiers
import QuickLook
import UIKit
import ImageIO

struct DocumentPreview: Identifiable {
    let id = UUID()
    let document: BuildingDocument
    let url: URL
}
struct Account: Codable { let id: Int; let name: String; let email: String }
struct LoginSession: Codable { let token: String; let user: Account }
struct APIMessage: Decodable { let error: String }
struct LogoutResult: Decodable { let ok: Bool }
struct ResetStatus: Decodable { let enabled: Bool }
struct ResetMessage: Decodable { let message: String }
struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

// Secrets are stored in the iOS Keychain, never in the source code or UserDefaults.
enum SecureStore {
    static func read(_ key: String) -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "D21Accounts", kSecAttrAccount as String: key,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
    static func write(_ data: Data?, key: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "D21Accounts", kSecAttrAccount as String: key]
        if let data {
            let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            if status == errSecItemNotFound {
                var item = query
                item[kSecValueData as String] = data
                item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw APIError(status: 0, message: "Schlüsselbund konnte nicht gespeichert werden.") }
            } else if status != errSecSuccess { throw APIError(status: 0, message: "Schlüsselbund konnte nicht aktualisiert werden.") }
        } else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw APIError(status: 0, message: "Schlüsselbund konnte nicht gelöscht werden.") }
        }
    }
}
struct GatewayCredentials: Codable { let username: String; let password: String }

@MainActor final class AccountModel: ObservableObject {
    @Published var user: Account?
    @Published var avatarData: Data?
    @Published var aiPreferences = AIPreferences.disabled
    @Published var presentationMode = false
    private var uiRevision = 0
    @Published var buildings: [Building] = []
    @Published var busy = false
    @Published var restoring = true
    @Published var error: String?
    @Published var serverURL = UserDefaults.standard.string(forKey: "d21.serverURL") ?? "https://filling-vendor-verification-hop.trycloudflare.com"
    private var token: String?
    private var credentials: GatewayCredentials? {
        #if DEBUG
        if WorkflowPreview.enabled { return nil }
        #endif
        guard let data = SecureStore.read("gateway") else { return nil }
        return try? JSONDecoder().decode(GatewayCredentials.self, from: data)
    }
    func gateway() -> GatewayCredentials? { credentials }
    func configure(url: String, username: String, password: String) throws {
        let cleaned = url.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let parts = URLComponents(string: cleaned), parts.scheme == "https", parts.host != nil,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty else { throw APIError(status: 0, message: "Bitte eine HTTPS-Serveradresse ohne Pfad eingeben.") }
        let changed = cleaned != serverURL
        if changed { try SecureStore.write(nil, key: "session"); token = nil; user = nil; buildings = []; avatarData = nil; aiPreferences = .disabled; presentationMode=false;uiRevision=0 }
        try SecureStore.write(try JSONEncoder().encode(GatewayCredentials(username: username, password: password)), key: "gateway")
        serverURL = cleaned
        UserDefaults.standard.set(cleaned, forKey: "d21.serverURL")
    }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: [String:Any]? = nil, headers: [String:String] = [:], timeout: TimeInterval = 20) async throws -> T {
        guard let url = URL(string: serverURL + "/api/v1/" + path), url.scheme == "https" else { throw APIError(status: 0, message: "Bitte die Serververbindung einrichten.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue(token, forHTTPHeaderField: "X-D21-Session") }
        if let gate = credentials, !gate.username.isEmpty {
            request.setValue("Basic " + Data("\(gate.username):\(gate.password)".utf8).base64EncodedString(), forHTTPHeaderField: "Authorization")
        }
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        // Reject redirects so credentials are never forwarded to a different origin.
        let session = URLSession(configuration: sessionConfiguration(), delegate: NoRedirects(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(status: 0, message: "Keine gültige Serverantwort.") }
        guard (200..<300).contains(http.statusCode) else {
            let accountError = try? JSONDecoder().decode(APIMessage.self, from: data)
            if http.statusCode == 401 && accountError != nil { invalidateSession() }
            let message = accountError?.error
                ?? (http.statusCode == 401 ? "Website-Zugang prüfen: Unter Serververbindung die gemeinsamen Zugangsdaten eingeben." : "Server nicht verfügbar (\(http.statusCode)). Bitte Serveradresse und Bereitstellung prüfen.")
            throw APIError(status: http.statusCode, message: message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    private func sessionConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        #if DEBUG
        if WorkflowPreview.enabled { configuration.protocolClasses = [WorkflowPreviewProtocol.self] }
        #endif
        return configuration
    }
    func resume() async {
        #if DEBUG
        if WorkflowPreview.enabled {
            serverURL = "https://d21-preview.invalid"; token = String(repeating: "0", count: 64)
            user = Account(id: 999999, name: "Felix · Vorschau", email: "vorschau@example.invalid")
            await loadBuildings(); restoring = false; return
        }
        #endif
        defer { restoring = false }
        guard let data = SecureStore.read("session"), let stored = try? JSONDecoder().decode(LoginSession.self, from: data) else { return }
        token = stored.token
        do {
            let account: Account = try await request("auth/me")
            user = account
            await loadBuildings()
            await loadAvatar()
            await refreshAIPreferences()
            await refreshUIPreferences()
        } catch {
            if (error as? APIError)?.status == 401 { try? SecureStore.write(nil, key: "session"); token = nil }
            self.error = error.localizedDescription
        }
    }
    func authenticate(register: Bool, name: String, email: String, password: String) async {
        busy = true; defer { busy = false }
        do {
            var body = ["email":email.trimmingCharacters(in: .whitespacesAndNewlines), "password":password]
            if register { body["name"] = name.trimmingCharacters(in: .whitespacesAndNewlines) }
            let session: LoginSession = try await request(register ? "auth/register" : "auth/login", method: "POST", body: body)
            try SecureStore.write(try JSONEncoder().encode(session), key: "session")
            token = session.token; user = session.user; avatarData = nil
            await loadBuildings()
            await loadAvatar()
            await refreshAIPreferences()
            await refreshUIPreferences()
        } catch { self.error = error.localizedDescription }
    }
    func refreshAIPreferences() async {
        guard let owner = user?.id else { aiPreferences = .disabled; presentationMode=false;uiRevision=0; return }
        do { let value: AIPreferences = try await request("profile/ai"); if user?.id == owner { aiPreferences = value } }
        catch { if user?.id == owner { aiPreferences = .disabled; presentationMode=false;uiRevision=0 } }
    }
    func saveAIPreferences(_ enabled: Bool) async throws {
        let owner = user?.id
        do {
            let value: AIPreferences = try await request("profile/ai", method: "PATCH", body: ["enabled":enabled,"device_control_enabled":enabled,"revision":aiPreferences.revision,"policy_version":1])
            if user?.id == owner { aiPreferences = value }
        } catch { await refreshAIPreferences(); throw error }
    }
    func refreshUIPreferences() async {
        guard user != nil else {presentationMode=false;uiRevision=0;return}
        do {let value:UIPreferences = try await request("profile/ui");presentationMode=value.presentation_mode;uiRevision=value.revision} catch {presentationMode=false}
    }
    func savePresentationMode(_ enabled:Bool) async throws {
        let value:UIPreferences=try await request("profile/ui",method:"PATCH",body:["presentation_mode":enabled,"revision":uiRevision]);presentationMode=value.presentation_mode;uiRevision=value.revision
    }
    func passwordResetStatus() async throws -> Bool {
        let status: ResetStatus = try await request("auth/password-reset/status")
        return status.enabled
    }
    func requestPasswordReset(email: String) async throws -> String {
        let response: ResetMessage = try await request("auth/password-reset/request", method: "POST", body: ["email":email])
        return response.message
    }
    func confirmPasswordReset(email: String, code: String, password: String) async throws -> String {
        let response: ResetMessage = try await request("auth/password-reset/confirm", method: "POST", body: ["email":email,"code":code,"password":password])
        return response.message
    }
    func fetchBuildings() async throws -> [Building] { try await request("buildings") }
    func loadBuildings() async {
        do { buildings = try await request("buildings") }
        catch { self.error = error.localizedDescription }
    }
    func addBuilding(name: String, address: String, requestID: UUID? = nil) async -> Building? {
        busy = true; defer { busy = false }
        do {
            let building: Building = try await request("buildings", method: "POST", body: ["name":name,"address":address], headers: requestID.map { ["X-Request-ID":$0.uuidString] } ?? [:])
            if !buildings.contains(where: { $0.id == building.id }) { buildings.append(building) }; return building
        } catch { self.error = error.localizedDescription; return nil }
    }
    func documents(buildingID: Int) async throws -> [BuildingDocument] {
        try await request("buildings/\(buildingID)/documents")
    }
    private func fileRequest(path: String, data: Data? = nil, name: String? = nil, method: String? = nil, uploadID: UUID? = nil, progress: (@MainActor @Sendable (Double) -> Void)? = nil, voiceConsent: Bool = false, contentType: String = "application/octet-stream", requestID: UUID? = nil) async throws -> Data {
        guard let url = URL(string: serverURL + "/api/v1/" + path), url.scheme == "https" else { throw APIError(status: 0, message: "Bitte Serververbindung prüfen.") }
        var request = URLRequest(url: url)
        request.httpMethod = method ?? (data == nil ? "GET" : "POST")
        request.timeoutInterval = 120
        if let uploadID { request.setValue(uploadID.uuidString, forHTTPHeaderField: "X-Upload-ID") }
        if data != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if voiceConsent { request.setValue("yes", forHTTPHeaderField: "X-D21-Voice-Consent") }
        if let requestID { request.setValue(requestID.uuidString.lowercased(), forHTTPHeaderField: "X-Request-ID") }
        if let name {
            var allowed = CharacterSet.urlPathAllowed
            allowed.remove(charactersIn: "%/?#&+=")
            request.setValue(name.addingPercentEncoding(withAllowedCharacters: allowed), forHTTPHeaderField: "X-File-Name")
        }
        if let token { request.setValue(token, forHTTPHeaderField: "X-D21-Session") }
        if let gate = credentials, !gate.username.isEmpty {
            request.setValue("Basic " + Data("\(gate.username):\(gate.password)".utf8).base64EncodedString(), forHTTPHeaderField: "Authorization")
        }
        let session = URLSession(configuration: sessionConfiguration(), delegate: NoRedirects(progress: progress), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let result: Data
        let response: URLResponse
        if let data { (result, response) = try await session.upload(for: request, from: data) }
        else { (result, response) = try await session.data(for: request) }
        guard let http = response as? HTTPURLResponse else { throw APIError(status: 0, message: "Keine gültige Serverantwort.") }
        guard (200..<300).contains(http.statusCode) else {
            let accountError = try? JSONDecoder().decode(APIMessage.self, from: result)
            if http.statusCode == 401 && accountError != nil { invalidateSession() }
            let message = accountError?.error ?? "Datei-Anfrage fehlgeschlagen (\(http.statusCode)). Website-Zugang und Dateigröße prüfen."
            throw APIError(status: http.statusCode, message: message)
        }
        return result
    }
    func transcribeVoice(buildingID: Int, data: Data, requestID: UUID) async throws -> String {
        guard data.count <= 1_048_576 else { throw APIError(status: 0, message: "Aufnahme maximal 1 MB.") }
        struct Transcript: Decodable { let text: String }
        let bytes = try await fileRequest(path: "buildings/\(buildingID)/voice/transcribe", data: data, voiceConsent: true, requestID: requestID)
        return try JSONDecoder().decode(Transcript.self, from: bytes).text
    }
    func speakVoice(buildingID: Int, text: String, requestID: UUID) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: ["text":text])
        return try await fileRequest(path: "buildings/\(buildingID)/voice/speak", data: data, voiceConsent: true, contentType: "application/json", requestID: requestID)
    }
    func uploadDocument(buildingID: Int, name: String, data: Data, uploadID: UUID? = nil, progress: (@MainActor @Sendable (Double) -> Void)? = nil) async throws -> BuildingDocument {
        guard !data.isEmpty, data.count <= 25 * 1024 * 1024 else { throw APIError(status: 0, message: "Bitte eine Datei bis 25 MB auswählen.") }
        let result = try await fileRequest(path: "buildings/\(buildingID)/documents", data: data, name: name, uploadID: uploadID, progress: progress)
        return try JSONDecoder().decode(BuildingDocument.self, from: result)
    }
    func renameDocument(_ document: BuildingDocument, name: String) async throws -> BuildingDocument {
        try await request("documents/\(document.id)", method: "PATCH", body: ["name":name])
    }
    func deleteDocument(_ document: BuildingDocument) async throws {
        let _: LogoutResult = try await request("documents/\(document.id)", method: "DELETE")
    }
    func draftStore(buildingID: Int? = nil) -> BuildingDraftStore? {
        guard let user else { return nil }
        let kind = buildingID.map { "building-\($0)" } ?? "new-building"
        return BuildingDraftStore(scope: serverURL + "#\(user.id)#" + kind)
    }
    func previewDocument(_ document: BuildingDocument) async throws -> DocumentPreview {
        let originalServer = serverURL, originalUser = user?.id
        if document.mime_type == "application/x-step", document.size > 20 * 1024 * 1024 { throw APIError(status: 0, message: "Dieses IFC-Modell ist größer als 20 MB. Bitte einen kleineren Ausschnitt verwenden.") }
        let data = try await fileRequest(path: "documents/\(document.id)")
        guard serverURL == originalServer, user?.id == originalUser, originalUser != nil else { throw APIError(status: 0, message: "Konto oder Server wurde gewechselt. Bitte die Datei erneut öffnen.") }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("D21Preview-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let safeName = document.name.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "\\", with: "_")
        let url = directory.appendingPathComponent(safeName)
        do { try data.write(to: url, options: [.atomic, .completeFileProtection]) }
        catch { try? FileManager.default.removeItem(at: directory); throw error }
        return DocumentPreview(document: document, url: url)
    }
    func loadAvatar() async {
        do { avatarData = try await fileRequest(path: "profile/avatar") }
        catch { avatarData = nil }
    }
    func saveAvatar(_ data: Data) async throws {
        guard !data.isEmpty, data.count <= 2 * 1024 * 1024 else { throw APIError(status: 0, message: "Das Profilbild darf maximal 2 MB groß sein.") }
        _ = try await fileRequest(path: "profile/avatar", data: data, method: "PUT")
        avatarData = data
    }
    private func invalidateSession() {
        try? SecureStore.write(nil, key: "session")
        token = nil; user = nil; buildings = []; avatarData = nil; aiPreferences = .disabled; presentationMode=false;uiRevision=0
    }
    func logout() async {
        busy = true; defer { busy = false }
        do {
            let _: LogoutResult = try await request("auth/logout", method: "POST")
            try SecureStore.write(nil, key: "session")
            token = nil; user = nil; buildings = []; avatarData = nil; aiPreferences = .disabled; presentationMode=false;uiRevision=0
        } catch { if user != nil { self.error = "Abmelden nicht abgeschlossen: " + error.localizedDescription } }
    }
}
final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let progress: (@MainActor @Sendable (Double) -> Void)?
    init(progress: (@MainActor @Sendable (Double) -> Void)? = nil) { self.progress = progress }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0, let progress else { return }
        let fraction = min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend))
        Task { @MainActor in progress(fraction) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}

let d21Accent = Color(red: 0.07, green: 0.49, blue: 0.51)
struct ContentView: View {
    @StateObject private var model = AccountModel()
    var body: some View {
        Group {
            if model.restoring { ProgressView("Anmeldung wird geprüft …") }
            else if model.user != nil { AccountHomeView() }
            else { WelcomeView() }
        }
        .environmentObject(model).tint(d21Accent)
        .task { await model.resume() }
        .alert("D21", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK") { model.error = nil }
        } message: { Text(model.error ?? "") }
    }
}
struct WelcomeView: View {
    @EnvironmentObject var model: AccountModel
    @State private var showConnection = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Image(systemName: "building.2.crop.circle.fill").font(.system(size: 72)).foregroundStyle(d21Accent)
                    Text("KI trifft\nGebäude").font(.system(size: 42, weight: .bold))
                    Text("Dein digitaler Gebäudepass.").font(.title3).foregroundStyle(.secondary)
                    Label("Gebäudedaten zentral speichern", systemImage: "externaldrive.badge.icloud")
                    Label("Dein Konto auf iPhone und Server", systemImage: "person.crop.circle")
                    VStack(spacing: 12) {
                        NavigationLink { AuthenticationView(register: true) } label: { Text("Konto erstellen").frame(maxWidth: .infinity).padding(8) }.buttonStyle(.borderedProminent)
                        NavigationLink { AuthenticationView(register: false) } label: { Text("Ich habe bereits ein Konto").frame(maxWidth: .infinity).padding(8) }.buttonStyle(.bordered)
                    }
                    Button("Serververbindung einrichten", systemImage: "network") { showConnection = true }
                    Text("Projektprototyp · Konten und Gebäude werden auf dem Projektserver gespeichert. Noch keine E-Mail-Bestätigung.")
                        .font(.footnote).foregroundStyle(.secondary)
                }.padding(28)
            }
            .sheet(isPresented: $showConnection) { ConnectionView() }
        }
    }
}
struct AuthenticationView: View {
    @EnvironmentObject var model: AccountModel
    let register: Bool
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""
    var body: some View {
        Form {
            Section(register ? "Dein neues Konto" : "Willkommen zurück") {
                if register { TextField("Name", text: $name).textContentType(.name) }
                TextField("E-Mail", text: $email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Passwort", text: $password).textContentType(register ? .newPassword : .password)
                if register { SecureField("Passwort wiederholen", text: $confirmation).textContentType(.newPassword) }
            }
            if register {
                Section { Text("Mindestens 12 Zeichen. Verwende für diesen Prototyp ein eigenes Passwort.").font(.footnote).foregroundStyle(.secondary) }
            }
            if !register {
                Section { NavigationLink("Passwort vergessen?") { PasswordResetView() } }
            }
            Section {
                Button {
                    Task { await model.authenticate(register: register, name: name, email: email, password: password); password = ""; confirmation = "" }
                } label: {
                    HStack { Spacer(); if model.busy { ProgressView() }; Text(register ? "Konto erstellen" : "Anmelden"); Spacer() }
                }.disabled(model.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty || (register && (name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.count < 12 || password != confirmation)))
            }
        }
        .disabled(model.busy)
        .navigationTitle(register ? "Konto erstellen" : "Anmelden")
        .navigationBarTitleDisplayMode(.inline)
    }
}
struct ConnectionView: View {
    @EnvironmentObject var model: AccountModel
    @Environment(\.dismiss) var dismiss
    @State private var url = ""
    @State private var username = ""
    @State private var password = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("Projektserver") {
                    TextField("https://…", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("Die Testadresse kann sich ändern. Hier lässt sie sich aktualisieren.").font(.footnote)
                }
                Section("Zusätzlicher Website-Zugang") {
                    TextField("Website-Benutzername", text: $username).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Website-Passwort", text: $password)
                    Text("Das sind die gemeinsamen Zugangsdaten der Website, getrennt von deinem persönlichen Konto. Sie werden im Schlüsselbund gespeichert.").font(.footnote)
                }
            }
            .navigationTitle("Serververbindung")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Speichern") {
                    do { try model.configure(url: url, username: username, password: password); dismiss() }
                    catch { model.error = error.localizedDescription }
                } }
            }
            .onAppear { url = model.serverURL; username = model.gateway()?.username ?? ""; password = model.gateway()?.password ?? "" }
        }
    }
}
struct AccountHomeView: View {
    @EnvironmentObject var model: AccountModel
    @State private var selectedTab: Int = {
        #if DEBUG
        if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21DashboardPreview") { return 4 }
        if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21DevicesPreview") { return 3 }
        if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21ContactsPreview") { return 1 }
        if WorkflowPreview.enabled && ProcessInfo.processInfo.arguments.contains("-D21NoticesPreview") { return 2 }
        return 0
        #else
        return 0
        #endif
    }()
    @StateObject private var social = CollaborationModel()
    @State private var search = ""
    @State private var showAdd = false
    @State private var showProfile = false
    @State private var path: [Building] = []
    @State private var buildingPreview: Building?
    @State private var nextBuilding: Building?
    @State private var nextArea = "Übersicht"
    @State private var savedDraft: BuildingDraft?
    @State private var discardDraft = false
    @Environment(\.scenePhase) private var scenePhase
    private func refreshDraft() {
        do { savedDraft = try model.draftStore()?.load() }
        catch { model.error = "Der gespeicherte Entwurf konnte nicht gelesen werden. Er bleibt erhalten. " + error.localizedDescription }
    }
    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { NativeDashboardEntry(account: model) }.tabItem { Label("Dashboard", systemImage: "chart.bar.xaxis") }.tag(4)
            NavigationStack(path: $path) {
                List {
                    Section {
                        Text("Deine Gebäude. Alles an einem Ort.").foregroundStyle(.secondary)
                        Button { showAdd = true } label: {
                            Label(savedDraft == nil ? "Neues Gebäude Schritt für Schritt anlegen" : "Gespeicherten Entwurf fortsetzen", systemImage: savedDraft == nil ? "plus.circle.fill" : "arrow.clockwise.circle.fill")
                                .font(.headline).padding(.vertical, 8)
                        }
                    }
                    if let draft = savedDraft {
                        Section("Dein Zwischenstand") {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(draft.name.isEmpty ? "Neues Gebäude" : draft.name).font(.headline)
                                Text("Schritt \(draft.step.rawValue) von 5 · \(draft.step.title)").foregroundStyle(.secondary)
                                if draft.pendingCount > 0 { Text("\(draft.pendingCount) Datei(en) warten noch auf den Upload.").font(.caption).foregroundStyle(.orange) }
                            }
                            Button("Fortsetzen") { showAdd = true }
                            Button("Lokalen Entwurf verwerfen", role: .destructive) { discardDraft = true }
                        }
                    }
                    Section("Meine und geteilte Gebäude") {
                        ForEach(model.buildings.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.address.localizedCaseInsensitiveContains(search) }) { building in
                            Button { buildingPreview = building } label: { NativeBuildingCard(building: building) }.buttonStyle(.plain).listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0)).accessibilityLabel("Gebäude \(building.name) entdecken")
                        }
                        if model.buildings.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Hier beginnt dein erster Gebäudepass.").font(.headline)
                                Text("Wir führen dich durch Name, Adresse, Fotos und Pläne.").foregroundStyle(.secondary)
                            }.padding(.vertical, 8)
                        }
                    }
                }
                .navigationTitle("Hallo, \(model.user?.name ?? "")")
                .searchable(text: $search, prompt: "Gebäude suchen")
                .navigationDestination(for: Building.self) { BuildingDetailView(building: $0, model: model, initialSection: nextArea) }
                .sheet(item: $buildingPreview, onDismiss: { if let building = nextBuilding { nextBuilding = nil; path.append(building) } }) { building in
                    BuildingQuickSheet(building: building) { area in nextArea = area; nextBuilding = building; buildingPreview = nil }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showProfile = true } label: { AvatarBadge(data: model.avatarData, size: 38) }
                            .accessibilityLabel("Mein Profil öffnen")
                            .contextMenu { Button("Profil und Profilbild", systemImage: "person.crop.circle") { showProfile = true } }
                    }
                }
                .refreshable { await model.loadBuildings(); await model.loadAvatar(); refreshDraft() }
                .sheet(isPresented: $showAdd, onDismiss: refreshDraft) { AddBuildingView(model: model) { building in showAdd = false; nextArea = "Übersicht"; path.append(building) } }
                 .sheet(isPresented: $showProfile) { ProfileView() }
                .task { refreshDraft() }
                .onChange(of: scenePhase) { _, phase in if phase == .active { refreshDraft() } }
                .confirmationDialog("Lokalen Entwurf verwerfen?", isPresented: $discardDraft, titleVisibility: .visible) {
                    Button("Entwurf auf diesem iPhone verwerfen", role: .destructive) {
                        do { try model.draftStore()?.clear(); savedDraft = nil } catch { model.error = error.localizedDescription }
                    }
                    Button("Behalten", role: .cancel) {}
                } message: { Text("Bereits auf dem Server gespeicherte Gebäude und Dateien bleiben erhalten. Nur der lokale Zwischenstand und noch nicht hochgeladene Dateikopien werden entfernt.") }
            }.tabItem { Label("Gebäude", systemImage: "building.2") }.tag(0)
            NavigationStack { TeamInboxView(account:model,social:social) }.tabItem { Label("Team",systemImage:"person.2") }.badge(social.unread).tag(1)
        }.task {
            await social.reload(model)
            while !Task.isCancelled { do { try await Task.sleep(for: .seconds(20)) } catch { return }; if scenePhase == .active { await social.reload(model) } }
        }
    }
}
struct AvatarBadge: View {
    let data: Data?
    let size: CGFloat
    var body: some View {
        Group {
            if let data, let image = UIImage(data: data) { Image(uiImage: image).resizable().scaledToFill() }
            else { Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(d21Accent).padding(size * 0.05) }
        }
        .frame(width: size, height: size).background(d21Accent.opacity(0.1)).clipShape(Circle())
        .overlay(Circle().strokeBorder(d21Accent.opacity(0.2), lineWidth: 1))
    }
}
enum PhotoPreparation {
    static func jpeg(_ data: Data, dimension: Int = 2048) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: dimension, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary),
              let result = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.85)
        else { throw APIError(status: 0, message: "Dieses Bild konnte nicht gelesen werden.") }
        return result
    }
}
struct ProfileView: View {
    @EnvironmentObject var model: AccountModel
    @Environment(\.dismiss) var dismiss
    @State private var photo: PhotosPickerItem?
    @State private var uploading = false
    @State private var showConnection = false
    @State private var problem: String?
    @State private var saved = false
    @State private var showPresentation = false
    @State private var savingMode = false
    var body: some View {
        let photoTitle = model.avatarData == nil ? "Profilbild auswählen" : "Profilbild ändern"
        return NavigationStack {
            Form {
                Section {
                    VStack(spacing: 16) {
                        AvatarBadge(data: model.avatarData, size: 112)
                        Text(model.user?.name ?? "").font(.title2.bold())
                        PhotosPicker(selection: $photo, matching: .images) { Label(photoTitle, systemImage: "camera") }.disabled(uploading)
                        if uploading { ProgressView("Profilbild wird gespeichert …") }
                        if saved { Label("Auf dem Projektserver gespeichert", systemImage: "checkmark.circle").font(.footnote).foregroundStyle(.green) }
                    }.frame(maxWidth: .infinity).padding(.vertical, 16)
                }
                Section { NavigationLink { AISettingsView(account: model) } label: { Label("KI-Einstellungen", systemImage: "sparkles") } }
                Section("Darstellung") {
                    Toggle("Vorstellungsmodus",isOn:Binding(get:{model.presentationMode},set:{value in Task{savingMode=true;defer{savingMode=false};do{try await model.savePresentationMode(value);showPresentation=value}catch{problem=error.localizedDescription}}})).disabled(savingMode)
                    Text("Nur hier lassen sich fiktive Beispieldaten aktivieren. Deine echten Gebäude und Daten werden dadurch nicht verändert.").font(.footnote).foregroundStyle(.secondary)
                    LabeledContent("App-Version",value:(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")+" · "+(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""))
                }
                Section("Dein Konto") { LabeledContent("Name", value: model.user?.name ?? ""); LabeledContent("E-Mail", value: model.user?.email ?? "") }
                Section { Button("Serververbindung", systemImage: "network") { showConnection = true }.disabled(uploading); Button("Abmelden", role: .destructive) { Task { await model.logout(); if model.user == nil { dismiss() } } }.disabled(model.busy || uploading) }
            }
            .navigationTitle("Mein Profil").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() }.disabled(uploading) } }
            .interactiveDismissDisabled(uploading)
            .sheet(isPresented: $showConnection) { ConnectionView() }
            .fullScreenCover(isPresented:$showPresentation,onDismiss:{Task{do{try await model.savePresentationMode(false)}catch{model.presentationMode=false}}}) {NativeDemoView()}
            .task {await model.refreshUIPreferences();showPresentation=model.presentationMode}
            .onChange(of: photo) { _, item in
                guard let item else { return }; uploading = true; saved = false
                Task {
                    defer { uploading = false; photo = nil }
                    do {
                        guard let data = try await item.loadTransferable(type: Data.self) else { throw APIError(status: 0, message: "Bild konnte nicht geladen werden.") }
                        try await model.saveAvatar(PhotoPreparation.jpeg(data, dimension: 512)); saved = true
                    } catch { problem = error.localizedDescription }
                }
            }
            .alert("Profilbild", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) { Button("OK") { problem = nil } } message: { Text(problem ?? "") }
        }
    }
}
struct DocumentPreviewView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) var dismiss
    let item: DocumentPreview
    var smartHome = false
    var body: some View {
        NavigationStack {
            Group {
                if item.document.mime_type == "application/x-step" {
                    IFCStoredModelView(url: item.url, smartHome: smartHome, account: account, buildingID: item.document.building_id, documentID: item.document.id)
                } else if item.document.mime_type == "application/acad" {
                    ContentUnavailableView("DWG-Plan gespeichert", systemImage: "cube.transparent", description: Text("Zur Ansicht über die Teilen-Schaltfläche in einer geeigneten CAD-App öffnen. Ein eigener DWG-Viewer ist noch nicht enthalten."))
                } else { NativeFilePreview(url: item.url) }
            }
            .navigationTitle(item.document.name).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fertig") { dismiss() } }
                ToolbarItem(placement: .primaryAction) { ShareLink(item: item.url) { Label("Teilen / Sichern", systemImage: "square.and.arrow.up") } }
            }
        }
        .onDisappear { try? FileManager.default.removeItem(at: item.url.deletingLastPathComponent()) }
    }
}
struct NativeFilePreview: UIViewControllerRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController(); controller.dataSource = context.coordinator; return controller
    }
    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    }
}
#Preview { ContentView() }
