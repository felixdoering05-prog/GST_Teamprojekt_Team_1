import Foundation

@main struct TeamContractSmoke {
    static func main() throws {
        let roles: [[String: Any]] = [
            ["id":10,"name":"Management","role_key":"management","sort_order":0,"permissions":["coordination":"edit"],"can_manage_members":true,"is_system":true],
            ["id":11,"name":"Employee","role_key":"employee","sort_order":1,"permissions":["coordination":"read"],"can_manage_members":false,"is_system":true],
            ["id":12,"name":"Maintenance","role_key":"maintenance","sort_order":2,"permissions":["maintenance":"none","coordination":"edit"],"can_manage_members":false,"is_system":true]
        ]
        let members: [[String: Any]] = [
            ["id":1,"name":"Owner","status":"owner","role_id":NSNull(),"role_name":"Eigentümer","role_key":"owner","sort_order":-1],
            ["id":2,"name":"Manager","status":"accepted","role_id":10,"role_name":"Management","role_key":"management","sort_order":0],
            ["id":3,"name":"Kollegin","status":"pending","role_id":11,"role_name":"Employee","role_key":"employee","sort_order":1]
        ]
        func access(owner: Bool, manages: Bool = true, rank: Int = 0, permissions: [String: String] = [:], roleRows: [[String: Any]]? = nil) throws -> NativeBuildingAccess {
            let body: [String: Any] = ["building_id":901,"is_owner":owner,"actor_role":["name":owner ? "Eigentümer":"Management","role_key":owner ? "owner":"management","sort_order":rank,"permissions":permissions],"can_manage_members":manages,"can_manage_roles":owner,"roles":roleRows ?? roles,"members":members]
            return try JSONDecoder().decode(NativeBuildingAccess.self, from: JSONSerialization.data(withJSONObject: body))
        }
        let owner = try access(owner: true)
        precondition(owner.assignableRoles.count == 3)
        precondition(!owner.canManage(owner.members[0], userID: 1))
        precondition(owner.canManage(owner.members[1], userID: 1))
        precondition(owner.allows("maintenance", edit: true))
        let manager = try access(owner: false)
        precondition(manager.assignableRoles.map(\.id) == [11,12])
        precondition(!manager.canManage(manager.members[1], userID: 99)) // peer rank
        precondition(!manager.canManage(manager.members[2], userID: 3)) // oneself
        precondition(manager.canManage(manager.members[2], userID: 2))
        let redacted = roles.map { row in row.filter { !["permissions","can_manage_members"].contains($0.key) } }
        let readOnly = try access(owner: false, manages: false, rank: 2, permissions: ["coordination":"read","maintenance":"none"], roleRows: redacted)
        precondition(readOnly.assignableRoles.isEmpty)
        precondition(!readOnly.canManage(readOnly.members[2], userID: 4))
        precondition(readOnly.allows("coordination") && !readOnly.allows("coordination", edit: true))
        precondition(!readOnly.allows("maintenance"))
        let team = try JSONDecoder().decode(NativeTeam.self, from: Data(##"{"id":1,"name":"Nala","owner_id":1,"primary_color":"#596b3d","accent_color":"#cbd5a3","has_logo":false,"is_owner":false,"can_manage":false,"can_manage_groups":false,"buildings":[{"id":901,"name":"D21","address":"Campus","owner_id":1,"is_owner":false}]}"##.utf8))
        precondition(team.buildings.count == 1 && !team.can_manage)
        precondition(team.background_color == nil)
        let person = try JSONDecoder().decode(NativeOrganisationMember.self, from: Data(##"{"id":2,"name":"Benjamin","role":"Employee, Maintenance","title":null,"status":"accepted"}"##.utf8))
        precondition(person.title == nil && person.role.contains("Employee"))
        let title = try JSONDecoder().decode(NativeTeamTitle.self, from: Data(##"{"id":1,"name":"Sensorik"}"##.utf8))
        precondition(title.name == "Sensorik")
        let group = try JSONDecoder().decode(NativeBuildingGroup.self, from: Data(##"{"id":4,"team_id":1,"name":"Campus","buildings":[{"id":901,"name":"D21"}]}"##.utf8))
        precondition(group.buildings[0].address == nil)
        precondition(Set(nativeTeamModules.map(\.key)).count == 14)
        print("Team contract and authorization presentation checks passed.")
    }
}
