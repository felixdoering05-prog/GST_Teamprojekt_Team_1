import Combine
import SwiftUI

/// Teamweite Gebäudeauswahl wie in der Web-App (#269, #273).
///
/// Die Auswahl ist entweder „Alle Gebäude“ des Teams, eine Gebäudegruppe oder ein
/// einzelnes Gebäude. Sie wird je Konto und Team auf dem iPhone gemerkt und hat
/// dieselben Werte wie im Web: `all`, `group:<id>` oder `building:<id>`.
/// Kann die Teamliste nicht geladen werden, filtert die App nicht und zeigt alle
/// Gebäude, damit niemand vor einer leeren Liste steht.
@MainActor final class BuildingScopeModel: ObservableObject {
    @Published private(set) var teams: [NativeTeam] = []
    @Published private(set) var groups: [NativeBuildingGroup] = []
    @Published private(set) var teamID: Int?
    @Published private(set) var selection = "all"
    private var accountID: Int?

    var team: NativeTeam? { teams.first { $0.id == teamID } }
    /// Leere Gruppen bieten keine Auswahl, wie im Web.
    var visibleGroups: [NativeBuildingGroup] { groups.filter { !$0.buildings.isEmpty } }

    private var teamKey: String { "nala.\(accountID ?? 0).selected-team" }
    private func scopeKey(_ team: Int) -> String { "nala.\(accountID ?? 0).building-scope.\(team)" }

    /// Gebäude-IDs der aktuellen Auswahl; `nil` heißt ungefiltert.
    var buildingIDs: Set<Int>? {
        guard let team else { return nil }
        let all = Set(team.buildings.map(\.id))
        if selection.hasPrefix("building:"), let id = Int(selection.dropFirst(9)), all.contains(id) { return [id] }
        if selection.hasPrefix("group:"), let id = Int(selection.dropFirst(6)), let group = visibleGroups.first(where: { $0.id == id }) {
            return all.intersection(group.buildings.map(\.id))
        }
        return all
    }

    /// Gültiger Auswahlwert; unbekannte Gruppen oder Gebäude fallen auf „all“ zurück.
    var value: String {
        guard let team else { return "all" }
        if selection.hasPrefix("building:"), let id = Int(selection.dropFirst(9)), team.buildings.contains(where: { $0.id == id }) { return selection }
        if selection.hasPrefix("group:"), let id = Int(selection.dropFirst(6)), visibleGroups.contains(where: { $0.id == id }) { return selection }
        return "all"
    }

    var label: String {
        let current = value
        if current.hasPrefix("building:"), let id = Int(current.dropFirst(9)) { return team?.buildings.first { $0.id == id }?.name ?? "Alle Gebäude" }
        if current.hasPrefix("group:"), let id = Int(current.dropFirst(6)) { return visibleGroups.first { $0.id == id }?.name ?? "Alle Gebäude" }
        return "Alle Gebäude"
    }

    var isFiltered: Bool { value != "all" }

    /// Teamfarbe als Akzent für die ganze App, wie `--primary` im Web.
    var brandTint: Color? { team.map { teamColor($0.primary_color) } }

    /// Optionaler Teamhintergrund. Er wird nur verwendet, wenn er zur gewählten
    /// Hell/Dunkel-Darstellung passt, damit Texte lesbar bleiben.
    func brandBackground(for scheme: ColorScheme) -> Color? {
        guard let hex = team?.background_color, let value = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) else { return nil }
        func channel(_ shift: UInt32) -> Double {
            let c = Double((value >> shift) & 255) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
        let fits = scheme == .dark ? luminance < 0.12 : luminance > 0.45
        return fits ? teamColor(hex) : nil
    }

    func filter(_ buildings: [Building]) -> [Building] {
        guard let ids = buildingIDs else { return buildings }
        return buildings.filter { ids.contains($0.id) }
    }

    /// Lädt Teams und Gruppen. Fehler lassen die Liste ungefiltert.
    func load(account: AccountModel) async {
        accountID = account.user?.id
        do {
            let list: [NativeTeam] = try await account.request("teams")
            let stored = UserDefaults.standard.integer(forKey: teamKey)
            let chosen = list.first { $0.id == stored } ?? list.first
            // Gruppen vor dem Umschalten laden, damit eine gemerkte Gruppe nicht kurz als „Alle Gebäude“ erscheint.
            var loadedGroups: [NativeBuildingGroup] = []
            if let chosen { loadedGroups = (try? await account.request("teams/\(chosen.id)/groups")) ?? [] }
            teams = list
            teamID = chosen?.id
            groups = loadedGroups
            selection = chosen.flatMap { UserDefaults.standard.string(forKey: scopeKey($0.id)) } ?? "all"
        } catch {
            teams = []; groups = []; teamID = nil; selection = "all"
        }
    }

    private func loadGroups(account: AccountModel) async {
        guard let teamID else { groups = []; return }
        do {
            let list: [NativeBuildingGroup] = try await account.request("teams/\(teamID)/groups")
            if self.teamID == teamID { groups = list }
        } catch {
            if self.teamID == teamID { groups = [] }
        }
    }

    func chooseTeam(_ id: Int, account: AccountModel) async {
        guard teams.contains(where: { $0.id == id }) else { return }
        UserDefaults.standard.set(id, forKey: teamKey)
        teamID = id
        groups = []
        selection = UserDefaults.standard.string(forKey: scopeKey(id)) ?? "all"
        await loadGroups(account: account)
    }

    func choose(_ next: String) {
        guard let teamID else { return }
        UserDefaults.standard.set(next, forKey: scopeKey(teamID))
        selection = next
    }

    /// Ein Direktlink (Widget, Siri, später QR-Code) auf ein Gebäude außerhalb der
    /// Auswahl wechselt wie im Web auf dieses Gebäude und, falls nötig, dessen Team.
    func reveal(_ buildingID: Int, account: AccountModel) async {
        if buildingIDs?.contains(buildingID) ?? true { return }
        if team?.buildings.contains(where: { $0.id == buildingID }) != true,
           let owner = teams.first(where: { team in team.buildings.contains { $0.id == buildingID } }) {
            await chooseTeam(owner.id, account: account)
        }
        if team?.buildings.contains(where: { $0.id == buildingID }) == true { choose("building:\(buildingID)") }
    }
}

/// Auswahlknopf über der Gebäudeliste: Team, „Alle Gebäude“, Gruppen und einzelne Gebäude.
struct BuildingScopeBar: View {
    @ObservedObject var scope: BuildingScopeModel
    let account: AccountModel

    private var selection: Binding<String> {
        Binding(get: { scope.value }, set: { scope.choose($0) })
    }
    private var teamSelection: Binding<Int> {
        Binding(get: { scope.teamID ?? 0 }, set: { id in Task { await scope.chooseTeam(id, account: account) } })
    }

    var body: some View {
        if let team = scope.team {
            Menu {
                if scope.teams.count > 1 {
                    Picker("Team", selection: teamSelection) {
                        ForEach(scope.teams) { Text($0.name).tag($0.id) }
                    }.pickerStyle(.menu)
                }
                Picker("Gebäudeauswahl", selection: selection) {
                    Label("Alle Gebäude", systemImage: "square.grid.2x2").tag("all")
                }.pickerStyle(.inline)
                if !scope.visibleGroups.isEmpty {
                    Picker("Gebäudegruppen", selection: selection) {
                        ForEach(scope.visibleGroups) { group in
                            Label(group.name, systemImage: "folder").tag("group:\(group.id)")
                        }
                    }.pickerStyle(.inline)
                }
                if team.buildings.count > 1 {
                    Picker("Einzelne Gebäude", selection: selection) {
                        ForEach(team.buildings) { building in
                            Label(building.name, systemImage: "building.2").tag("building:\(building.id)")
                        }
                    }.pickerStyle(.inline)
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: scope.value.hasPrefix("group:") ? "folder.fill" : scope.value.hasPrefix("building:") ? "building.2.fill" : "square.grid.2x2.fill")
                        .foregroundStyle(.tint)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(scope.label).font(.headline).foregroundStyle(.primary).lineLimit(1)
                        Text(scope.teams.count > 1 ? "Team \(team.name)" : "Gebäudeauswahl").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.up.chevron.down").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Gebäudeauswahl: \(scope.label)" + (scope.teams.count > 1 ? ", Team \(team.name)" : ""))
            .accessibilityHint("Team, Gebäudegruppe oder einzelnes Gebäude auswählen")
        }
    }
}

/// Teamlogo oben links in der Gebäudeliste, sobald das Team eines hinterlegt hat.
struct TeamLogoBadge: View {
    @ObservedObject var scope: BuildingScopeModel
    let account: AccountModel
    var body: some View {
        if let team = scope.team, team.has_logo {
            NativeTeamMark(team: team, account: account, size: 38)
                .accessibilityElement().accessibilityLabel("Logo von Team \(team.name)")
        }
    }
}

extension View {
    /// Legt den optionalen Teamhintergrund hinter eine Liste; ohne Farbe bleibt alles wie gewohnt.
    @ViewBuilder func teamBackground(_ color: Color?) -> some View {
        if let color { scrollContentBackground(.hidden).background(color) } else { self }
    }
}

/// Gemeinsamer Kalender aller Gebäude der aktuellen Auswahl (#269).
struct ScopeCalendarButton: View {
    let buildings: [Building]
    let account: AccountModel
    @State private var open = false
    var body: some View {
        if !buildings.isEmpty {
            Button { open = true } label: { Image(systemName: "calendar") }
                .accessibilityLabel("Kalender der ausgewählten Gebäude")
                .sheet(isPresented: $open) {
                    NavigationStack {
                        NativeBuildingSchedules(buildings: buildings, account: account)
                            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { open = false } } }
                    }
                }
        }
    }
}
