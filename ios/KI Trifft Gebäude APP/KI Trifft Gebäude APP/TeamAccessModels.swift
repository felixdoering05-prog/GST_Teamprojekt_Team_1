import Foundation

struct NativeTeam: Decodable, Identifiable {
    let id: Int
    let name: String
    let owner_id: Int
    let leader_name: String?
    let primary_color: String
    let accent_color: String
    let has_logo: Bool
    let is_owner: Bool
    let can_manage: Bool
    let can_manage_groups: Bool
    let buildings: [NativeTeamBuilding]
    var background_color: String? = nil
    var is_default: Bool? = nil
}

struct NativeOrganisationMember: Decodable, Identifiable {
    let id: Int
    let name: String
    let role: String
    let title: String?
    let status: String
}
struct NativeTeamTitle: Decodable, Identifiable { let id: Int; let name: String }

struct NativeTeamBuilding: Decodable, Identifiable {
    let id: Int
    let name: String
    let address: String?
    let owner_id: Int?
    let is_owner: Bool?
}

struct NativeBuildingGroup: Decodable, Identifiable {
    let id: Int
    let name: String
    let team_id: Int
    let buildings: [NativeTeamBuilding]
}

struct NativeBuildingRole: Decodable, Identifiable {
    let id: Int
    let name: String
    let role_key: String
    let sort_order: Int
    let permissions: [String: String]?
    let can_manage_members: Bool?
    let is_system: Bool
}

struct NativeActorRole: Decodable {
    let name: String
    let role_key: String
    let sort_order: Int
    let permissions: [String: String]?
}

struct NativeTeamMember: Decodable, Identifiable {
    let id: Int
    let name: String
    let status: String
    let role_id: Int?
    let role_name: String
    let role_key: String
    let sort_order: Int
}

struct NativeBuildingAccess: Decodable {
    let building_id: Int
    let is_owner: Bool
    let actor_role: NativeActorRole
    let can_manage_members: Bool
    let can_manage_roles: Bool
    let roles: [NativeBuildingRole]
    let members: [NativeTeamMember]

    var assignableRoles: [NativeBuildingRole] {
        guard can_manage_members else { return [] }
        return roles.filter { is_owner || $0.sort_order > actor_role.sort_order }
    }
    func canManage(_ member: NativeTeamMember, userID: Int?) -> Bool {
        can_manage_members && member.role_key != "owner" && member.id != userID
            && (is_owner || member.sort_order > actor_role.sort_order)
    }
    func allows(_ module: String, edit: Bool = false) -> Bool {
        is_owner || actor_role.permissions?[module] == "edit"
            || (!edit && actor_role.permissions?[module] == "read")
    }
}

struct NativeSchedule: Decodable, Identifiable {
    let id: Int
    let title: String
    let details: String
    let starts_at: String
    let ends_at: String?
    let created_by_name: String?
    var building_id: Int? = nil
    var kind: String? = nil
    var priority: String? = nil
    var interval_days: Int? = nil
    var reminder_days: Int? = nil
    var room_id: String? = nil
    var sensor_id: String? = nil
    var room_name: String? = nil
    var sensor_name: String? = nil
}
struct NativeScheduleOption: Decodable, Identifiable, Hashable { let id: String; let name: String }
struct NativeScheduleList: Decodable {
    let items: [NativeSchedule]
    let can_edit: Bool
    var rooms: [NativeScheduleOption]? = nil
    var sensors: [NativeScheduleOption]? = nil
}

let nativeTeamModules: [(key: String, title: String)] = [
    ("overview", "Übersicht"), ("buildings", "Gebäudeverwaltung"),
    ("structure", "Geschosse & Räume"), ("bim", "3D-Modell"), ("documents", "Dateien & Pläne"),
    ("sensors", "Sensoren & Geräte"), ("energy", "Energie"), ("analysis", "KI-Analyse"),
    ("assistant", "Gebäude-Assistent"), ("issues", "Mängel"), ("maintenance", "Wartung"),
    ("schedule", "Zeitplanung"), ("coordination", "Teamchat"), ("settings", "Einstellungen & Importe")
]

func nativeTeamDate(_ value: String) -> Date? {
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return parser.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}
