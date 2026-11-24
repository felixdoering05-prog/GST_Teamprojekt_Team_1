#if DEBUG
import Foundation

// Served only by WorkflowPreviewProtocol, using its existing lock; no network traffic.
enum NativeTeamsPreview {
    static var groups: [[String: Any]] = [["id":1,"team_id":1,"name":"Campus Darmstadt","buildings":[["id":901,"name":"Gebäude D21"]]]]
    static var schedules: [[String: Any]] = [["id":1,"title":"Gemeinsame Gebäudebegehung","details":"Sensoren und Räume prüfen, Treffpunkt Haupteingang.","starts_at":"2026-11-20T09:00:00.000Z","ends_at":"2026-11-20T10:00:00.000Z","created_by_name":"Benjamin"]]
    static var teamName = "Nala Projektteam"
    static var primary = "#167d87"
    static var accent = "#b8e9df"
    static var background: String?
    static var titles: [[String:Any]] = [["id":1,"name":"Projektleitung"],["id":2,"name":"Sensorik"]]
    static var people: [[String:Any]] = [["id":999999,"name":"Felix","role":"Leitung","title":NSNull(),"status":"accepted"],["id":2,"name":"Benjamin","role":"Employee","title":"Sensorik","status":"accepted"]]
    static var nextID = 20
    static var contact: [String:Any] = ["phone":"","email":"","share_with_team":false]
    static var owner: Bool { !ProcessInfo.processInfo.arguments.contains("-D21TeamReadOnlyPreview") }
    static var roles: [[String: Any]] {
        ["Management", "Employee", "Maintenance"].enumerated().map { i, name in
            ["id":10+i,"role_key":name.lowercased(),"name":name,"sort_order":i,"is_system":true,"can_manage_members":i == 0,"permissions":Dictionary(uniqueKeysWithValues: nativeTeamModules.map { ($0.key, i == 2 ? ($0.key == "maintenance" ? "none" : "read") : "edit") })]
        }
    }
    static func response(_ path: String, method: String, object: [String: Any]) -> (Int, Any)? {
        if path.hasSuffix("/profile/team-contact") {
            if method == "PATCH" { contact = ["phone":object["phone"] ?? "","email":object["email"] ?? "","share_with_team":object["share_with_team"] ?? false] }
            return (200,contact)
        }
        if path.contains("/teams/1/members/") && path.hasSuffix("/contact") {
            return path.contains("/members/2/") ? (200,["phone":"+49 6151 123456","email":"benjamin@team.example"]) : (200,["phone":"","email":""])
        }
        if path.contains("/teams/1/titles/") && method == "DELETE" {
            let id = Int(path.split(separator: "/").last ?? ""); titles.removeAll { $0["id"] as? Int == id }; return (200,["ok":true])
        }
        if path.hasSuffix("/teams/1") && method == "DELETE" { return (200,["ok":true]) }
        if path.contains("/buildings/") && path.hasSuffix("/members") && method == "POST" { return (200,["ok":true]) }
        if path.hasSuffix("/teams") {
            if ProcessInfo.processInfo.arguments.contains("-D21TeamsErrorPreview") { return (503,["error":"Teamdaten vorübergehend nicht erreichbar."]) }
            if method == "POST" { teamName = object["name"] as? String ?? teamName }
            let value: [String: Any] = ["id":1,"name":teamName,"owner_id":999999,"leader_name":"Felix · Vorschau","primary_color":primary,"accent_color":accent,"background_color":background as Any? ?? NSNull(),"has_logo":false,"is_owner":owner,"can_manage":owner,"can_manage_groups":owner,"buildings":WorkflowPreview.buildings.map { b -> [String:Any] in var x=b; x["owner_id"]=999999; x["is_owner"]=owner; return x }]
            return (method == "POST" ? 201 : 200, method == "POST" ? value as Any : [value] as Any)
        }
        if path.hasSuffix("/teams/1") && method == "PATCH" {
            teamName = object["name"] as? String ?? teamName; primary = object["primary_color"] as? String ?? primary; accent = object["accent_color"] as? String ?? accent
            background = object["background_color"] as? String
            return response(path + "/../teams", method: "POST", object: ["name":teamName])
        }
        if path.hasSuffix("/teams/1/members") { return (200,people) }
        if path.hasSuffix("/teams/1/titles") {
            if method == "GET" { return (200,titles) }
            let item: [String:Any] = ["id":nextID,"name":object["name"] ?? "Titel"]; nextID += 1; titles.append(item); return (201,item)
        }
        if path.contains("/teams/1/members/") && path.hasSuffix("/title") {
            if let user = Int(path.split(separator:"/").dropLast().last ?? ""), let index = people.firstIndex(where: { $0["id"] as? Int == user }) { people[index]["title"] = titles.first(where: { $0["id"] as? Int == object["title_id"] as? Int })?["name"] ?? NSNull() }
            return (200,["ok":true])
        }
        if path.contains("/teams/1/buildings/") { return (200,["id":901]) }
        if path.contains("/teams/1/groups") {
            if path.hasSuffix("/assign") { return owner ? (200,["ok":true]) : (403,["error":"Keine Mitgliederverwaltung."]) }
            if method == "GET" { return (200, groups) }
            if !owner { return (403,["error":"Keine Gruppenverwaltung."]) }
            let id = Int(path.split(separator: "/").last ?? "")
            if method == "DELETE" { groups.removeAll { $0["id"] as? Int == id }; return (200,["ok":true]) }
            let new: [String:Any] = ["id":id ?? nextID,"team_id":1,"name":object["name"] ?? "Gruppe","buildings":WorkflowPreview.buildings.filter { (object["building_ids"] as? [Int] ?? []).contains($0["id"] as? Int ?? -1) }]
            if method == "PATCH" { groups.removeAll { $0["id"] as? Int == id } }; groups.append(new); nextID += 1
            return (method == "POST" ? 201 : 200,new)
        }
        if path.hasSuffix("/team-access") {
            let members: [[String:Any]] = [["id":999999,"name":"Felix","status":"owner","role_id":NSNull(),"role_name":"Eigentümer","role_key":"owner","sort_order":-1],["id":2,"name":"Benjamin","status":"accepted","role_id":11,"role_name":"Employee","role_key":"employee","sort_order":1]]
            let shown = owner ? roles : roles.map { $0.filter { !["permissions","can_manage_members"].contains($0.key) } }
            return (200,["building_id":901,"is_owner":owner,"actor_role":["name":owner ? "Eigentümer":"Maintenance","role_key":owner ? "owner":"maintenance","sort_order":owner ? -1:2,"permissions":Dictionary(uniqueKeysWithValues:nativeTeamModules.map { ($0.key,"read") })],"can_manage_members":owner,"can_manage_roles":owner,"roles":shown,"members":members])
        }
        if path.contains("/team-access/") {
            if !owner { return (403,["error":"Keine Mitgliederverwaltung."]) }
            if path.contains("/roles") && !path.hasSuffix("/order") && method != "DELETE" { var r=roles[0]; r["name"]=object["name"]; r["permissions"]=object["permissions"]; r["can_manage_members"]=object["can_manage_members"]; return (200,r) }
            return (200,["ok":true])
        }
        if path.contains("/schedules") {
            if method == "GET" { return (200,["items":schedules,"can_edit":owner]) }
            if !owner { return (403,["error":"Keine Schreibrechte für Zeitpläne."]) }
            let id = Int(path.split(separator: "/").last ?? "")
            if method == "DELETE" { schedules.removeAll { $0["id"] as? Int == id }; return (200,["ok":true]) }
            var item=object; item["id"]=id ?? nextID; item["created_by_name"]="Felix"
            if method == "PATCH" { schedules.removeAll { $0["id"] as? Int == id } }; schedules.append(item); nextID += 1
            return (method == "POST" ? 201:200,item)
        }
        return nil
    }
}
#endif
