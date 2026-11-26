import Foundation
import Network
import Combine
import AuthenticationServices
import UIKit

// Home Assistant direkt aus der App: im Heimnetz finden, mit dem offiziellen HA-Login anmelden,
// ausgewählte Sensorwerte lesen und zum Projektserver hochladen. Der HA-Zugang (Refresh-Token)
// bleibt im Schlüsselbund dieses iPhones und wird nie an den Projektserver geschickt.

struct HAInstance: Identifiable, Hashable { let name: String; let url: URL; var id: String { url.absoluteString } }

enum HALocalError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

/// Sucht Home Assistant per Bonjour (`_home-assistant._tcp`) im lokalen Netz.
@MainActor final class HADiscovery: ObservableObject {
    @Published private(set) var found: [HAInstance] = []
    @Published private(set) var searching = false
    private var browser: NWBrowser?
    func start() {
        #if DEBUG
        if WorkflowPreview.enabled { found = [HAInstance(name: "Zuhause", url: URL(string: "http://homeassistant.local:8123")!)]; return }
        #endif
        guard browser == nil else { return }
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_home-assistant._tcp", domain: nil), using: NWParameters())
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            var list: [HAInstance] = []
            for result in results {
                guard case let .bonjour(txt) = result.metadata else { continue }
                let values = txt.dictionary
                let raw = [values["internal_url"], values["base_url"]].compactMap { $0 }.first { !$0.isEmpty } ?? ""
                guard let url = HASetup.normalize(raw) else { continue }
                list.append(HAInstance(name: values["location_name"].flatMap { $0.isEmpty ? nil : $0 } ?? "Home Assistant", url: url))
            }
            let unique = Array(Dictionary(list.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }).values).sorted { $0.name < $1.name }
            Task { @MainActor in self?.found = unique }
        }
        browser.stateUpdateHandler = { [weak self] state in
            if case .failed = state { Task { @MainActor in self?.stop() } }
        }
        browser.start(queue: .main); self.browser = browser; searching = true
    }
    func stop() { browser?.cancel(); browser = nil; searching = false }
}

enum HASetup {
    static let redirect = "kitrifftgebaeude://ha-auth"
    /// Nur http(s) ohne Zugangsdaten, Pfad und Abfrage. Z. B. "homeassistant.local:8123" → http://homeassistant.local:8123
    static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        if !text.contains("://") { text = "http://" + text }
        guard let parts = URLComponents(string: text), let scheme = parts.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/" else { return nil }
        var clean = URLComponents(); clean.scheme = scheme; clean.host = host
        clean.port = parts.port ?? (scheme == "http" ? 8123 : nil)
        return clean.url
    }
}

/// Zugang für ein Gebäude, nur im Schlüsselbund dieses iPhones (nicht synchronisiert).
struct HACredentials: Codable {
    let url: String; var refreshToken: String; let clientID: String; var lastSync: Date?
    static func key(_ building: Int, account: AccountModel) -> String? { account.bridgeAddress.map { "ha-\(building)@" + $0 } }
    static func load(_ building: Int, account: AccountModel) -> HACredentials? {
        guard let key = key(building, account: account), let data = SecureStore.read(key) else { return nil }
        return try? JSONDecoder().decode(HACredentials.self, from: data)
    }
    func save(_ building: Int, account: AccountModel) throws {
        guard let key = Self.key(building, account: account) else { return }
        try SecureStore.write(try JSONEncoder().encode(self), key: key)
    }
    static func remove(_ building: Int, account: AccountModel) { if let key = key(building, account: account) { try? SecureStore.write(nil, key: key) } }
}

/// Offizieller Home-Assistant-Login (OAuth2/IndieAuth) im Systembrowser.
final class HALogin: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
    @MainActor func code(base: URL, clientID: String) async throws -> String {
        let state = UUID().uuidString
        var parts = URLComponents(url: base.appendingPathComponent("auth/authorize"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "response_type", value: "code"), URLQueryItem(name: "client_id", value: clientID),
                            URLQueryItem(name: "redirect_uri", value: HASetup.redirect), URLQueryItem(name: "state", value: state)]
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: parts.url!, callbackURLScheme: "kitrifftgebaeude") { url, error in
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { continuation.resume(throwing: HALocalError.message("Anmeldung abgebrochen.")); return }
                let items = url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.queryItems } ?? []
                guard let code = items.first(where: { $0.name == "code" })?.value, items.first(where: { $0.name == "state" })?.value == state else {
                    continuation.resume(throwing: HALocalError.message("Home Assistant hat die Anmeldung nicht bestätigt.")); return
                }
                continuation.resume(returning: code)
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() { continuation.resume(throwing: HALocalError.message("Die Anmeldeseite konnte nicht geöffnet werden.")) }
        }
    }
}

/// Kleiner REST-Client für Home Assistant im Heimnetz.
struct HAClient {
    let base: URL; let clientID: String
    private func data(_ request: URLRequest) async throws -> Data {
        let configuration = URLSessionConfiguration.ephemeral; configuration.timeoutIntervalForRequest = 15
        let session = URLSession(configuration: configuration); defer { session.finishTasksAndInvalidate() }
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: request) }
        catch { throw HALocalError.message("Home Assistant ist nicht erreichbar. Bist du im selben WLAN?") }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 || status == 403 { throw HALocalError.message("Home Assistant hat den Zugang abgelehnt. Bitte neu anmelden.") }
        guard (200..<300).contains(status) else { throw HALocalError.message("Home Assistant antwortet mit Fehler \(status).") }
        return data
    }
    private func form(_ fields: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: base.appendingPathComponent("auth/token")); request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var parts = URLComponents(); parts.queryItems = fields.map { URLQueryItem(name: $0.key, value: $0.value) }
        request.httpBody = Data((parts.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
        return (try JSONSerialization.jsonObject(with: try await data(request)) as? [String: Any]) ?? [:]
    }
    func exchange(code: String) async throws -> (access: String, refresh: String) {
        let json = try await form(["grant_type": "authorization_code", "code": code, "client_id": clientID])
        guard let access = json["access_token"] as? String, let refresh = json["refresh_token"] as? String else { throw HALocalError.message("Kein Zugang von Home Assistant erhalten.") }
        return (access, refresh)
    }
    func access(refresh: String) async throws -> String {
        let json = try await form(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": clientID])
        guard let access = json["access_token"] as? String else { throw HALocalError.message("Home-Assistant-Anmeldung abgelaufen. Bitte neu anmelden.") }
        return access
    }
    func get(_ path: String, query: [URLQueryItem] = [], token: String) async throws -> Any {
        var parts = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query }
        var request = URLRequest(url: parts.url!); request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        return try JSONSerialization.jsonObject(with: try await data(request))
    }
    func post(_ path: String, body: [String: Any], token: String) async throws -> Any {
        var request = URLRequest(url: base.appendingPathComponent(path)); request.httpMethod = "POST"
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try JSONSerialization.jsonObject(with: try await data(request))
    }
    func template(_ text: String, token: String) async throws -> Any {
        var request = URLRequest(url: base.appendingPathComponent("api/template")); request.httpMethod = "POST"
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["template": text])
        return try JSONSerialization.jsonObject(with: try await data(request))
    }
    /// Meldet nur ab, was der App gehört (Refresh-Token widerrufen).
    func revoke(refresh: String) async {
        var request = URLRequest(url: base.appendingPathComponent("auth/revoke")); request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var parts = URLComponents(); parts.queryItems = [URLQueryItem(name: "token", value: refresh)]
        request.httpBody = Data((parts.percentEncodedQuery ?? "").utf8)
        _ = try? await data(request)
    }
}

/// Reine Paketlogik (gleiche Regeln wie Server und HA-Integration).
enum HAPayload {
    static let allowedUnits: [String: Set<String>] = [
        "temperature": ["°C", "°F", "K"],
        "humidity": ["%"],
        "carbon_dioxide": ["ppm"],
        "power": ["W", "kW"],
        "energy": ["Wh", "kWh", "MWh"],
        "battery": ["%"],
        "water": ["L", "m³", "gal", "ft³", "CCF", "MCF"],
        "volume_flow_rate": ["mL/s", "L/s", "L/min", "L/h", "m³/s", "m³/min", "m³/h"],
        "volume_storage": ["mL", "L", "m³", "gal", "ft³"],
        "irradiance": ["W/m²"],
    ]
    static func allowed(_ entity: String, _ deviceClass: String?, _ unit: String?) -> Bool {
        guard entity.range(of: #"^sensor\.[a-z0-9_]{1,200}$"#, options: .regularExpression) != nil, let deviceClass, let unit else { return false }
        return allowedUnits[deviceClass]?.contains(unit) == true
    }
    // Registry-Daten (Bereiche, Geräte) über die Template-API, ohne WebSocket.
    static let registryTemplate = """
    {%- set ns = namespace(s=[], a=[]) -%}
    {%- for s in (states.sensor | selectattr('attributes.device_class', 'in', ['temperature','humidity','carbon_dioxide','power','energy','battery','water','volume_flow_rate','volume_storage','irradiance']) | list) + (states.light | list) -%}
    {%- set d = device_id(s.entity_id) -%}
    {%- set ns.s = ns.s + [{'e': s.entity_id, 'a': area_id(s.entity_id), 'd': d, 'dn': (device_attr(d, 'name_by_user') or device_attr(d, 'name')) if d else none, 'dm': device_attr(d, 'manufacturer') if d else none, 'do': device_attr(d, 'model') if d else none, 'da': device_attr(d, 'area_id') if d else none}] -%}
    {%- endfor -%}
    {%- for a in areas() -%}{%- set ns.a = ns.a + [[a, area_name(a)]] -%}{%- endfor -%}
    {{ {'s': ns.s, 'a': ns.a} | tojson }}
    """
    static let refRegex = #"^[A-Za-z0-9_.-]{1,64}$"#
    static func ref(_ value: Any?) -> String? { (value as? String).flatMap { $0.range(of: refRegex, options: .regularExpression) != nil ? $0 : nil } }
    static func text(_ value: Any?) -> String { String(((value as? String) ?? "").prefix(100)) }

    static func inventory(states: [[String: Any]], registry: [String: Any]?) -> [String: Any] {
        var meta: [String: [String: Any]] = [:]
        for row in (registry?["s"] as? [[String: Any]]) ?? [] { if let e = row["e"] as? String { meta[e] = row } }
        var areaNames: [String: String] = [:]
        for pair in (registry?["a"] as? [[Any]]) ?? [] where pair.count == 2 { if let id = ref(pair[0]), let name = pair[1] as? String { areaNames[id] = name } }
        var entities: [[String: Any]] = [], devices: [String: [String: Any]] = [:], usedAreas = Set<String>(), lights = 0
        for state in states.sorted(by: { ($0["entity_id"] as? String ?? "") < ($1["entity_id"] as? String ?? "") }) {
            guard let id = state["entity_id"] as? String, let attributes = state["attributes"] as? [String: Any] else { continue }
            if id.range(of: #"^light\.[a-z0-9_]{1,200}$"#, options: .regularExpression) != nil {
                guard lights < 100 else { continue }; lights += 1
                let row = meta[id], area = ref(row?["a"]).flatMap { areaNames[$0] != nil ? $0 : nil }, device = ref(row?["d"])
                if let d = device {
                    let deviceArea = ref(row?["da"]).flatMap { areaNames[$0] != nil ? $0 : nil }
                    devices[d] = ["device_id": d, "name": text(row?["dn"]).isEmpty ? d : text(row?["dn"]), "manufacturer": text(row?["dm"]), "model": text(row?["do"]), "area_id": deviceArea as Any? ?? NSNull()]
                    if let deviceArea { usedAreas.insert(deviceArea) }
                }
                if let area { usedAreas.insert(area) }
                let name = text(attributes["friendly_name"])
                let modes = (attributes["supported_color_modes"] as? [String]) ?? []
                var lamp: [String: Any] = ["entity_id": id, "name": name.isEmpty ? id : name, "supports_color": supportsColor(attributes), "supports_brightness": !(modes.isEmpty || modes == ["onoff"]), "supports_temp": modes.contains("color_temp")]
                if modes.contains("color_temp") {
                    if let lo = attributes["min_color_temp_kelvin"] as? Int, (1000...12000).contains(lo) { lamp["min_kelvin"] = lo }
                    if let hi = attributes["max_color_temp_kelvin"] as? Int, (1000...12000).contains(hi), hi >= (lamp["min_kelvin"] as? Int ?? 0) { lamp["max_kelvin"] = hi }
                }
                entities.append(lamp.merging(["device_id": device as Any? ?? NSNull(), "area_id": area as Any? ?? NSNull()]) { a, _ in a })
                continue
            }
            let deviceClass = attributes["device_class"] as? String, unit = attributes["unit_of_measurement"] as? String
            guard allowed(id, deviceClass, unit), entities.count - lights < 500 else { continue }
            let row = meta[id]
            let area = ref(row?["a"]).flatMap { areaNames[$0] != nil ? $0 : nil }
            var device = ref(row?["d"])
            if let d = device {
                let deviceArea = ref(row?["da"]).flatMap { areaNames[$0] != nil ? $0 : nil }
                devices[d] = ["device_id": d, "name": text(row?["dn"]).isEmpty ? d : text(row?["dn"]), "manufacturer": text(row?["dm"]), "model": text(row?["do"]), "area_id": deviceArea as Any? ?? NSNull()]
                if let deviceArea { usedAreas.insert(deviceArea) }
            } else { device = nil }
            if let area { usedAreas.insert(area) }
            let name = text(attributes["friendly_name"])
            entities.append(["entity_id": id, "name": name.isEmpty ? id : name, "device_class": deviceClass!, "unit": unit!, "device_id": device as Any? ?? NSNull(), "area_id": area as Any? ?? NSNull()])
        }
        let areas = usedAreas.sorted().map { ["area_id": $0, "name": String((areaNames[$0] ?? $0).prefix(100))] }
        return ["areas": areas, "devices": devices.keys.sorted().map { devices[$0]! }, "entities": entities]
    }

    static func supportsColor(_ attributes: [String: Any]) -> Bool {
        ((attributes["supported_color_modes"] as? [String]) ?? []).contains { ["hs", "xy", "rgb", "rgbw", "rgbww"].contains($0) }
    }
    /// Lampenzustand für den Server (nur ausgewählte Lampen).
    static func lightStates(states: [[String: Any]], selected: Set<String>) -> [[String: Any]] {
        states.compactMap { state in
            guard let id = state["entity_id"] as? String, id.hasPrefix("light."), selected.contains(id) else { return nil }
            let value = state["state"] as? String ?? "", attributes = state["attributes"] as? [String: Any] ?? [:]
            let available = value == "on" || value == "off"
            var item: [String: Any] = ["entity_id": id, "available": available, "is_on": available ? (value == "on") as Any : NSNull()]
            if let b = attributes["brightness"] as? Int, (0...255).contains(b) { item["brightness"] = b }
            if let rgb = attributes["rgb_color"] as? [Int], rgb.count == 3, rgb.allSatisfy({ (0...255).contains($0) }) { item["rgb"] = rgb }
            if attributes["color_mode"] as? String == "color_temp", let k = attributes["color_temp_kelvin"] as? Int, (1000...12000).contains(k) { item["color_temp_kelvin"] = k; item["rgb"] = nil }
            return item
        }
    }
    static func iso(_ date: Date) -> String { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.string(from: date) }
    static func date(_ text: Any?) -> Date? {
        guard let text = text as? String else { return nil }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: text) { return d }
        // HA liefert Mikrosekunden; auf Millisekunden kürzen.
        if let dot = text.firstIndex(of: "."), let tz = text[dot...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) {
            let trimmed = String(text[..<dot]) + "." + String(text[text.index(after: dot)..<tz].prefix(3)) + String(text[tz...])
            if let d = f.date(from: trimmed) { return d }
        }
        return ISO8601DateFormatter().date(from: text)
    }
    /// Verlauf in abgeschlossene Halbstunden mitteln (stabile Zeitpunkte → Wiederholungen werden auf dem Server übersprungen).
    static func buckets(history: [[[String: Any]]], selected: Set<String>, now: Date = Date()) -> [[String: Any]] {
        let size: TimeInterval = 1800
        var points: [[String: Any]] = []
        for series in history {
            guard let id = series.first?["entity_id"] as? String, selected.contains(id) else { continue }
            var sums: [Double: (Double, Int)] = [:]
            for row in series {
                guard let value = Double(row["state"] as? String ?? ""), value.isFinite, let at = date(row["last_changed"] ?? row["last_updated"]) else { continue }
                let start = (at.timeIntervalSince1970 / size).rounded(.down) * size
                guard start + size <= now.timeIntervalSince1970 else { continue }
                let old = sums[start] ?? (0, 0); sums[start] = (old.0 + value, old.1 + 1)
            }
            for (start, sum) in sums { points.append(["entity_id": id, "value": (sum.0 / Double(sum.1) * 1000).rounded() / 1000, "measured_at": iso(Date(timeIntervalSince1970: start))]) }
        }
        return points.sorted { ($0["measured_at"] as! String, $0["entity_id"] as! String) < ($1["measured_at"] as! String, $1["entity_id"] as! String) }
    }
    static func live(states: [[String: Any]], selected: Set<String>) -> [[String: Any]] {
        states.compactMap { state in
            guard let id = state["entity_id"] as? String, selected.contains(id), let value = Double(state["state"] as? String ?? ""), value.isFinite,
                  let at = date(state["last_updated"]) else { return nil }
            return ["entity_id": id, "value": value, "measured_at": iso(min(at, Date()))]
        }
    }
}

/// Ablauf: verbinden, Übersicht übertragen, Werte abgleichen.
@MainActor enum HASync {
    private static var running = Set<Int>()
    static func clientID(_ account: AccountModel) -> String? { account.bridgeAddress.map { $0 + "/ha-client" } }

    static func connect(account: AccountModel, building: Building, url: URL, login: HALogin) async throws {
        guard let clientID = clientID(account) else { throw HALocalError.message("Projektserver nicht eingestellt.") }
        #if DEBUG
        if WorkflowPreview.enabled {
            try HACredentials(url: url.absoluteString, refreshToken: "preview", clientID: clientID, lastSync: nil).save(building.id, account: account)
            let _: HAOverview = try await account.request("buildings/\(building.id)/home-assistant/app-connect", method: "POST", body: ["instance_name": "Zuhause", "ha_version": "2026.11.2"])
            let _: HAOverview = try await account.request("buildings/\(building.id)/home-assistant/inventory", method: "PUT", body: ["areas": [], "devices": [], "entities": []])
            return
        }
        #endif
        let client = HAClient(base: url, clientID: clientID)
        let code = try await login.code(base: url, clientID: clientID)
        let tokens = try await client.exchange(code: code)
        try HACredentials(url: url.absoluteString, refreshToken: tokens.refresh, clientID: clientID, lastSync: nil).save(building.id, account: account)
        let config = (try? await client.get("api/config", token: tokens.access)) as? [String: Any] ?? [:]
        let _: HAOverview = try await account.request("buildings/\(building.id)/home-assistant/app-connect", method: "POST",
            body: ["instance_name": HAPayload.text(config["location_name"]), "ha_version": String(HAPayload.text(config["version"]).prefix(40))])
        try await uploadInventory(account: account, building: building.id, client: client, token: tokens.access)
    }

    private static func uploadInventory(account: AccountModel, building: Int, client: HAClient, token: String) async throws {
        let states = (try await client.get("api/states", token: token) as? [[String: Any]]) ?? []
        // Die Template-API braucht ein Admin-Konto; ohne sie fehlen nur Bereiche und Geräte.
        let registry = (try? await client.template(HAPayload.registryTemplate, token: token)) as? [String: Any]
        let _: HAOverview = try await account.request("buildings/\(building)/home-assistant/inventory", method: "PUT", body: HAPayload.inventory(states: states, registry: registry), timeout: 40)
    }

    struct Result { let stored: Int }
    /// Gleicht ausgewählte Sensoren ab: Verlauf seit dem letzten Abgleich (max. 7 Tage) und aktuelle Werte.
    @discardableResult static func sync(account: AccountModel, building: Int, refreshInventory: Bool = false) async throws -> Result {
        guard var credentials = HACredentials.load(building, account: account), !running.contains(building) else { return Result(stored: 0) }
        running.insert(building); defer { running.remove(building) }
        #if DEBUG
        if WorkflowPreview.enabled {
            let now = Date()
            let points: [[String: Any]] = (0..<6).map { ["entity_id": "sensor.besprechung_temperatur", "value": 21.5 + Double($0) / 10, "measured_at": HAPayload.iso(now.addingTimeInterval(Double(-$0) * 1800))] }
            let result: HASyncResponse = try await account.request("buildings/\(building)/home-assistant/samples", method: "POST", body: ["points": points])
            credentials.lastSync = now; try credentials.save(building, account: account); return Result(stored: result.stored)
        }
        #endif
        guard let url = URL(string: credentials.url) else { return Result(stored: 0) }
        let client = HAClient(base: url, clientID: credentials.clientID)
        let token = try await client.access(refresh: credentials.refreshToken)
        if refreshInventory || credentials.lastSync == nil || credentials.lastSync! < Date().addingTimeInterval(-6 * 3600) {
            try await uploadInventory(account: account, building: building, client: client, token: token)
        }
        let overview: HAOverview = try await account.request("buildings/\(building)/home-assistant")
        let selected = Set(overview.entities.filter(\.selected).map(\.entity_id))
        guard overview.link?.mode == "app", !selected.isEmpty else { return Result(stored: 0) }
        let now = Date(), start = max(credentials.lastSync?.addingTimeInterval(-3600) ?? .distantPast, now.addingTimeInterval(-7 * 86400))
        let sensors = selected.filter { $0.hasPrefix("sensor.") }
        let history = sensors.isEmpty ? [] : (try await client.get("api/history/period/" + HAPayload.iso(start), query: [
            URLQueryItem(name: "filter_entity_id", value: selected.filter { $0.hasPrefix("sensor.") }.sorted().joined(separator: ",")), URLQueryItem(name: "end_time", value: HAPayload.iso(now)),
            URLQueryItem(name: "minimal_response", value: nil), URLQueryItem(name: "no_attributes", value: nil)], token: token) as? [[[String: Any]]]) ?? []
        let states = (try await client.get("api/states", token: token) as? [[String: Any]]) ?? []
        let points = HAPayload.buckets(history: history, selected: selected, now: now) + HAPayload.live(states: states, selected: selected)
        var stored = 0
        for chunk in stride(from: 0, to: points.count, by: 2000).map({ Array(points[$0..<min($0 + 2000, points.count)]) }) {
            let result: HASyncResponse = try await account.request("buildings/\(building)/home-assistant/samples", method: "POST", body: ["points": chunk], timeout: 40)
            stored += result.stored
        }
        let lights = HAPayload.lightStates(states: states, selected: selected)
        if !lights.isEmpty { let _: HASyncResponse = try await account.request("buildings/\(building)/home-assistant/samples", method: "POST", body: ["lights": lights]) }
        credentials.lastSync = now; try credentials.save(building, account: account)
        return Result(stored: stored)
    }

    /// Beim App-Start und beim Zurückkehren: alle Gebäude mit Zugang auf diesem iPhone still abgleichen.
    static func syncAll(account: AccountModel) async {
        for building in account.buildings where HACredentials.load(building.id, account: account) != nil {
            if let last = HACredentials.load(building.id, account: account)?.lastSync, last > Date().addingTimeInterval(-300) { continue }
            _ = try? await sync(account: account, building: building.id)
        }
    }

    /// Lampe schalten: Server prüft Rechte und Lichtlimit, dann schaltet das iPhone direkt in Home Assistant
    /// und meldet den neuen Zustand zurück.
    static func switchLight(account: AccountModel, building: Int, entity: String, on: Bool, brightness: Int? = nil, rgb: [Int]? = nil, kelvin: Int? = nil) async throws {
        var body: [String: Any] = ["on": on]
        if let brightness { body["brightness"] = brightness }; if let rgb { body["rgb"] = rgb }; if let kelvin { body["color_temp_kelvin"] = kelvin }
        let _: HALightPermit = try await account.request("buildings/\(building)/home-assistant/lights/\(entity)/command", method: "POST", body: body, headers: ["X-Request-ID": UUID().uuidString.lowercased()])
        #if DEBUG
        if WorkflowPreview.enabled {
            var state: [String: Any] = ["entity_id": entity, "available": true, "is_on": on]
            if let brightness { state["brightness"] = brightness }; if let rgb { state["rgb"] = rgb; state["color_temp_kelvin"] = NSNull() }; if let kelvin { state["color_temp_kelvin"] = kelvin; state["rgb"] = NSNull() }
            let _: HASyncResponse = try await account.request("buildings/\(building)/home-assistant/samples", method: "POST", body: ["lights": [state]]); return
        }
        #endif
        guard let credentials = HACredentials.load(building, account: account), let url = URL(string: credentials.url) else { throw HALocalError.message("Auf diesem iPhone ist Home Assistant nicht angemeldet.") }
        let client = HAClient(base: url, clientID: credentials.clientID)
        let token = try await client.access(refresh: credentials.refreshToken)
        var service: [String: Any] = ["entity_id": entity]
        if let brightness { service["brightness"] = brightness }; if let rgb { service["rgb_color"] = rgb }; if let kelvin { service["color_temp_kelvin"] = kelvin }
        _ = try await client.post("api/services/light/" + (on ? "turn_on" : "turn_off"), body: service, token: token)
        try? await Task.sleep(for: .milliseconds(600))
        let state = (try await client.get("api/states/" + entity, token: token) as? [String: Any]) ?? [:]
        let lights = HAPayload.lightStates(states: [state], selected: [entity])
        if !lights.isEmpty { let _: HASyncResponse = try await account.request("buildings/\(building)/home-assistant/samples", method: "POST", body: ["lights": lights]) }
    }

    static func disconnect(account: AccountModel, building: Int) async {
        if let credentials = HACredentials.load(building, account: account), let url = URL(string: credentials.url), credentials.refreshToken != "preview" {
            await HAClient(base: url, clientID: credentials.clientID).revoke(refresh: credentials.refreshToken)
        }
        HACredentials.remove(building, account: account)
    }
}

struct HASyncResponse: Decodable { let stored: Int; let ignored: Int }
struct HALightPermit: Decodable { let allowed: Bool }
