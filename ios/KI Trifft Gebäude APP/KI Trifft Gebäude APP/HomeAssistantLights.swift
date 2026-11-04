import SwiftUI

private struct HomeAssistantLamp: Decodable, Identifiable {
    let key: String; let name: String; let room: String; let available: Bool; let is_on: Bool?
    var id: String { key }
}
private struct HomeAssistantLights: Decodable { let configured: Bool; let lights: [HomeAssistantLamp] }
private struct HomeAssistantCommand: Decodable { let confirmed: Bool; let light: HomeAssistantLamp; let message: String }
struct HomeAssistantLightsSection: View {
    @ObservedObject var account: AccountModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var lamps: [HomeAssistantLamp] = []
    @State private var configured = false
    @State private var loading = false
    @State private var busy = false
    @State private var problem: String?
    @State private var result: String?
    var body: some View {
        Section("Home Assistant") {
            if configured {
                    ForEach(lamps) { lamp in
                        VStack(alignment: .leading, spacing: 10) {
                            Label(lamp.name, systemImage: lamp.is_on == true && lamp.available ? "lightbulb.fill" : "lightbulb").font(.headline)
                            Text(lamp.room + " · " + (lamp.available ? lamp.is_on == true ? "Ein" : "Aus" : "Nicht erreichbar")).font(.subheadline).foregroundStyle(.secondary)
                            Button(lamp.is_on == true ? "Ausschalten" : "Einschalten", systemImage: "power") { Task { await command(lamp) } }.buttonStyle(.bordered).tint(d21Accent).disabled(!lamp.available || lamp.is_on == nil || busy || loading)
                        }.padding(.vertical, 6)
                    }
                    if busy { ProgressView("Auftrag an Home Assistant …") }
                    if let result { Text(result).font(.footnote).foregroundStyle(.secondary) }
                    if let problem { Text(problem).font(.footnote).foregroundStyle(.red) }
                    Button("Lampenstatus aktualisieren", systemImage: "arrow.clockwise") { Task { await reload() } }.disabled(busy || loading)
                    Text("Echte Gerätebedienung. Diese private Demo ist nur für dein freigegebenes Konto sichtbar und noch keinem Projektgebäude oder IFC-Raum zugeordnet. KI und Sprachassistent haben darauf noch keinen Zugriff.").font(.caption).foregroundStyle(.secondary)
            } else {
                Text(loading ? "Freigegebene Lampen werden geladen …" : "Für dieses Konto ist noch keine private Lampe freigegeben.").font(.footnote).foregroundStyle(.secondary)
                if let problem { Text(problem).font(.footnote).foregroundStyle(.red) }
            }
        }
        .task {
            await reload()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(20)) } catch { return }
                if scenePhase == .active && !busy { await reload() }
            }
        }
    }
    private func reload() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        let owner = account.user?.id
        do { let response: HomeAssistantLights = try await account.request("integrations/home-assistant/lights"); guard !Task.isCancelled, owner == account.user?.id else { return }; configured = response.configured; lamps = response.lights; problem = nil }
        catch { if !Task.isCancelled { problem = error.localizedDescription; lamps = [] } }
    }
    private func command(_ lamp: HomeAssistantLamp) async {
        guard !busy, lamp.available, let current = lamp.is_on else { return }; busy = true; result = nil; defer { busy = false }
        do {
            let response: HomeAssistantCommand = try await account.request("integrations/home-assistant/lights/\(lamp.key)/command", method: "POST", body: ["on":!current], headers: ["X-Request-ID":UUID().uuidString], timeout: 25)
            if let index = lamps.firstIndex(where: { $0.key == lamp.key }) { lamps[index] = response.light }
            result = response.message; problem = nil
        } catch {
            let message = error.localizedDescription
            await reload(); problem = message + " Bitte den Status prüfen, bevor du einen neuen Auftrag startest."
        }
    }
}
