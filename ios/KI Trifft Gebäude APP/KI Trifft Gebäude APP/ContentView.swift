import SwiftUI
import Combine
import Security
import PhotosUI
import UniformTypeIdentifiers
import QuickLook
import UIKit

struct Building: Identifiable, Codable, Equatable {
    let id: Int
    let name: String
    let address: String
}
struct BuildingDocument: Identifiable, Codable {
    let id: Int
    let name: String
    let mime_type: String
    let size: Int
}
struct DocumentPreview: Identifiable {
    let id = UUID()
    let document: BuildingDocument
    let url: URL
}
struct Account: Codable { let id: Int; let name: String; let email: String }
struct LoginSession: Codable { let token: String; let user: Account }
struct APIMessage: Decodable { let error: String }
struct LogoutResult: Decodable { let ok: Bool }
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
    @Published var buildings: [Building] = []
    @Published var busy = false
    @Published var restoring = true
    @Published var error: String?
    @Published var serverURL = UserDefaults.standard.string(forKey: "d21.serverURL") ?? "https://filling-vendor-verification-hop.trycloudflare.com"
    private var token: String?
    private var credentials: GatewayCredentials? {
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
        if changed { try SecureStore.write(nil, key: "session"); token = nil; user = nil; buildings = [] }
        try SecureStore.write(try JSONEncoder().encode(GatewayCredentials(username: username, password: password)), key: "gateway")
        serverURL = cleaned
        UserDefaults.standard.set(cleaned, forKey: "d21.serverURL")
    }
    private func request<T: Decodable>(_ path: String, method: String = "GET", body: [String:String]? = nil) async throws -> T {
        guard let url = URL(string: serverURL + "/api/v1/" + path), url.scheme == "https" else { throw APIError(status: 0, message: "Bitte die Serververbindung einrichten.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue(token, forHTTPHeaderField: "X-D21-Session") }
        if let gate = credentials, !gate.username.isEmpty {
            request.setValue("Basic " + Data("\(gate.username):\(gate.password)".utf8).base64EncodedString(), forHTTPHeaderField: "Authorization")
        }
        // Reject redirects so credentials are never forwarded to a different origin.
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(status: 0, message: "Keine gültige Serverantwort.") }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(APIMessage.self, from: data))?.error
                ?? (http.statusCode == 401 ? "Website-Zugang prüfen: Unter Serververbindung die gemeinsamen Zugangsdaten eingeben." : "Server nicht verfügbar (\(http.statusCode)). Bitte Serveradresse und Bereitstellung prüfen.")
            throw APIError(status: http.statusCode, message: message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func resume() async {
        defer { restoring = false }
        guard let data = SecureStore.read("session"), let stored = try? JSONDecoder().decode(LoginSession.self, from: data) else { return }
        token = stored.token
        do {
            let account: Account = try await request("auth/me")
            user = account
            await loadBuildings()
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
            token = session.token; user = session.user
            await loadBuildings()
        } catch { self.error = error.localizedDescription }
    }
    func loadBuildings() async {
        do { buildings = try await request("buildings") }
        catch { self.error = error.localizedDescription }
    }
    func addBuilding(name: String, address: String) async -> Bool {
        busy = true; defer { busy = false }
        do {
            let building: Building = try await request("buildings", method: "POST", body: ["name":name,"address":address])
            buildings.append(building); return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func documents(buildingID: Int) async throws -> [BuildingDocument] {
        try await request("buildings/\(buildingID)/documents")
    }
    private func fileRequest(path: String, data: Data? = nil, name: String? = nil) async throws -> Data {
        guard let url = URL(string: serverURL + "/api/v1/" + path), url.scheme == "https" else { throw APIError(status: 0, message: "Bitte Serververbindung prüfen.") }
        var request = URLRequest(url: url)
        request.httpMethod = data == nil ? "GET" : "POST"
        request.timeoutInterval = 120
        request.httpBody = data
        if data != nil { request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type") }
        if let name {
            var allowed = CharacterSet.urlPathAllowed
            allowed.remove(charactersIn: "%/?#&+=")
            request.setValue(name.addingPercentEncoding(withAllowedCharacters: allowed), forHTTPHeaderField: "X-File-Name")
        }
        if let token { request.setValue(token, forHTTPHeaderField: "X-D21-Session") }
        if let gate = credentials, !gate.username.isEmpty {
            request.setValue("Basic " + Data("\(gate.username):\(gate.password)".utf8).base64EncodedString(), forHTTPHeaderField: "Authorization")
        }
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (result, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(status: 0, message: "Keine gültige Serverantwort.") }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(APIMessage.self, from: result))?.error ?? "Datei-Anfrage fehlgeschlagen (\(http.statusCode)). Website-Zugang und Dateigröße prüfen."
            throw APIError(status: http.statusCode, message: message)
        }
        return result
    }
    func uploadDocument(buildingID: Int, name: String, data: Data) async throws -> BuildingDocument {
        guard !data.isEmpty, data.count <= 25 * 1024 * 1024 else { throw APIError(status: 0, message: "Bitte eine Datei bis 25 MB auswählen.") }
        let result = try await fileRequest(path: "buildings/\(buildingID)/documents", data: data, name: name)
        return try JSONDecoder().decode(BuildingDocument.self, from: result)
    }
    func previewDocument(_ document: BuildingDocument) async throws -> DocumentPreview {
        let data = try await fileRequest(path: "documents/\(document.id)")
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("D21Preview-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let safeName = document.name.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "\\", with: "_")
        let url = directory.appendingPathComponent(safeName)
        do { try data.write(to: url, options: [.atomic, .completeFileProtection]) }
        catch { try? FileManager.default.removeItem(at: directory); throw error }
        return DocumentPreview(document: document, url: url)
    }
    func logout() async {
        busy = true; defer { busy = false }
        do {
            let _: LogoutResult = try await request("auth/logout", method: "POST")
            try SecureStore.write(nil, key: "session")
            token = nil; user = nil; buildings = []
        } catch { self.error = "Abmelden nicht abgeschlossen: " + error.localizedDescription }
    }
}
final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}

private let d21Accent = Color(red: 0.07, green: 0.49, blue: 0.51)
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
                    Text("Dein digitaler Gebäudepass für das D21.").font(.title3).foregroundStyle(.secondary)
                    Label("Gebäudedaten zentral speichern", systemImage: "externaldrive.badge.icloud")
                    Label("Dein Konto auf iPhone und Server", systemImage: "person.crop.circle")
                    VStack(spacing: 12) {
                        NavigationLink { AuthenticationView(register: true) } label: { Text("Konto erstellen").frame(maxWidth: .infinity).padding(8) }.buttonStyle(.borderedProminent)
                        NavigationLink { AuthenticationView(register: false) } label: { Text("Ich habe bereits ein Konto").frame(maxWidth: .infinity).padding(8) }.buttonStyle(.bordered)
                    }
                    Button("Serververbindung einrichten", systemImage: "network") { showConnection = true }
                    Text("Projektprototyp · Konten und Gebäude werden auf dem Projektserver gespeichert. Noch keine E-Mail-Bestätigung oder Passwort-Wiederherstellung.")
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
    @State private var search = ""
    @State private var showAdd = false
    @State private var showConnection = false
    var body: some View {
        TabView {
            NavigationStack {
                List {
                    Section { Text("Hallo, \(model.user?.name ?? "")").font(.title2.bold()); Label("Mit dem Projektserver verbunden", systemImage: "checkmark.icloud").font(.footnote).foregroundStyle(.secondary) }
                    Section("Meine Gebäude") {
                        ForEach(model.buildings.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.address.localizedCaseInsensitiveContains(search) }) { building in
                            NavigationLink { BuildingDetailView(building: building) } label: {
                                Label { VStack(alignment: .leading) { Text(building.name).font(.headline); Text(building.address).font(.subheadline).foregroundStyle(.secondary) } } icon: { Image(systemName: "building.2").foregroundStyle(d21Accent) }
                            }
                        }
                        if model.buildings.isEmpty { Text("Noch keine Gebäude. Lege dein erstes Gebäude an.").foregroundStyle(.secondary) }
                        Button("Gebäude hinzufügen", systemImage: "plus.circle") { showAdd = true }
                    }
                }
                .navigationTitle("D21 Gebäude").searchable(text: $search, prompt: "Gebäude suchen")
                .refreshable { await model.loadBuildings() }
                .sheet(isPresented: $showAdd) { AddBuildingView() }
            }.tabItem { Label("Gebäude", systemImage: "building.2") }
            NavigationStack { ContentUnavailableView("Noch keine Meldungen", systemImage: "bell", description: Text("Gebäudewarnungen werden später angebunden.")).navigationTitle("Meldungen") }.tabItem { Label("Meldungen", systemImage: "bell") }
            NavigationStack {
                Form {
                    Section("Dein Konto") { LabeledContent("Name", value: model.user?.name ?? ""); LabeledContent("E-Mail", value: model.user?.email ?? "") }
                    Section { Button("Serververbindung", systemImage: "network") { showConnection = true }; Button("Abmelden", role: .destructive) { Task { await model.logout() } }.disabled(model.busy) }
                    Section { Text("Gebäude sind deinem Konto zugeordnet. Das frühere Demo-Dashboard und lokale Testgebäude werden nicht automatisch übernommen.").font(.footnote) }
                }.navigationTitle("Profil").sheet(isPresented: $showConnection) { ConnectionView() }
            }.tabItem { Label("Profil", systemImage: "person.crop.circle") }
        }
    }
}
struct AddBuildingView: View {
    @EnvironmentObject var model: AccountModel
    @Environment(\.dismiss) var dismiss
    @State private var name = ""
    @State private var address = ""
    var body: some View {
        NavigationStack {
            Form { TextField("Gebäudename", text: $name); TextField("Adresse", text: $address) }
                .disabled(model.busy).navigationTitle("Neues Gebäude")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(model.busy) }
                    ToolbarItem(placement: .confirmationAction) { Button(model.busy ? "Speichert …" : "Speichern") { Task { if await model.addBuilding(name: name, address: address) { dismiss() } } }.disabled(model.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                }
        }
    }
}
struct BuildingDetailView: View {
    @EnvironmentObject var model: AccountModel
    let building: Building
    @State private var documents: [BuildingDocument] = []
    @State private var loading = false
    @State private var working = false
    @State private var filePicker = false
    @State private var photo: PhotosPickerItem?
    @State private var preview: DocumentPreview?
    @State private var fileError: String?
    @State private var success: String?
    private var acceptedTypes: [UTType] {
        [.pdf, .jpeg, .png, .webP, UTType(filenameExtension: "dwg") ?? UTType(importedAs: "com.autodesk.dwg")]
    }
    func reload() async {
        loading = true; defer { loading = false }
        do { documents = try await model.documents(buildingID: building.id) }
        catch { fileError = error.localizedDescription }
    }
    func upload(name: String, data: Data) async {
        do {
            let document = try await model.uploadDocument(buildingID: building.id, name: name, data: data)
            documents.insert(document, at: 0)
            success = "Datei in der Serverdatenbank gespeichert."
        } catch { fileError = error.localizedDescription }
    }
    var body: some View {
        List {
            Section("Gebäudeinformationen") {
                LabeledContent("Gebäude", value: building.name)
                LabeledContent("Adresse", value: building.address)
            }
            Section {
                PhotosPicker(selection: $photo, matching: .images) { Label("Bild aus Fotos hochladen", systemImage: "photo.on.rectangle") }
                Button("Datei auswählen", systemImage: "doc.badge.plus") { filePicker = true }
                Text("PDF, JPG, PNG, WebP oder DWG · bis 25 MB pro Datei · 250 MB pro Konto. Fotos werden als JPEG übertragen.").font(.footnote).foregroundStyle(.secondary)
                if working { ProgressView("Datei wird übertragen …") }
                if let success { Label(success, systemImage: "checkmark.circle").font(.footnote).foregroundStyle(.green) }
            } header: { Text("Bilder und Pläne hochladen") }
            .disabled(working)
            Section("Dateien (\(documents.count))") {
                if loading { ProgressView("Dateien werden geladen …") }
                else if documents.isEmpty { Text("Noch keine Dateien vorhanden.").foregroundStyle(.secondary) }
                ForEach(documents) { document in
                    Button {
                        working = true; success = nil
                        Task {
                            defer { working = false }
                            do { preview = try await model.previewDocument(document) }
                            catch { fileError = error.localizedDescription }
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: document.mime_type.hasPrefix("image/") ? "photo" : document.mime_type == "application/acad" ? "cube.transparent" : "doc.text").foregroundStyle(d21Accent)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(document.name).foregroundStyle(.primary)
                                Text(ByteCountFormatter.string(fromByteCount: Int64(document.size), countStyle: .file)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "arrow.down.doc").foregroundStyle(.secondary)
                        }
                    }.disabled(working)
                }
            }
            Section("Weitere Funktionen") {
                Label("Revit / BIM · folgt", systemImage: "cube.transparent")
                Label("Sensorik und Analyse · folgen", systemImage: "waveform.path")
            }.foregroundStyle(.secondary)
        }
        .navigationTitle(building.name).navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { if !working { await reload() } }
        .fileImporter(isPresented: $filePicker, allowedContentTypes: acceptedTypes) { result in
            switch result {
            case .failure(let error): fileError = error.localizedDescription
            case .success(let url):
                working = true; success = nil
                Task {
                    defer { working = false }
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    do {
                        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                        guard size <= 25 * 1024 * 1024 else { throw APIError(status: 0, message: "Maximal 25 MB pro Datei.") }
                        let data = try Data(contentsOf: url, options: .mappedIfSafe)
                        await upload(name: url.lastPathComponent, data: data)
                    } catch { fileError = error.localizedDescription }
                }
            }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            working = true; success = nil
            Task {
                defer { working = false; photo = nil }
                do {
                    guard let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.85) else { throw APIError(status: 0, message: "Bild konnte nicht geladen werden.") }
                    await upload(name: "Foto-" + UUID().uuidString.prefix(8) + ".jpg", data: jpeg)
                } catch { fileError = error.localizedDescription }
            }
        }
        .alert("Datei", isPresented: Binding(get: { fileError != nil }, set: { if !$0 { fileError = nil } })) {
            Button("OK") { fileError = nil }
        } message: { Text(fileError ?? "") }
        .sheet(item: $preview) { item in DocumentPreviewView(item: item) }
    }
}
struct DocumentPreviewView: View {
    @Environment(\.dismiss) var dismiss
    let item: DocumentPreview
    var body: some View {
        NavigationStack {
            Group {
                if item.document.mime_type == "application/acad" {
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
