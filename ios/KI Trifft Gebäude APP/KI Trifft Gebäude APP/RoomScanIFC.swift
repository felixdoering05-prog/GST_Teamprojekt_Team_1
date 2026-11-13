import Foundation
import simd

/// Geometry captured by a room scan, independent of RoomPlan so it can be tested on any platform.
/// Coordinates are RoomPlan/ARKit world space: metres, Y up, right-handed.
nonisolated struct ScannedBuilding {
    struct Box { var transform: simd_float4x4; var width: Float; var height: Float; var depth: Float }
    struct Floor { var corners: [SIMD3<Float>]; var name: String }
    /// Furniture and fixtures; `category` uses RoomPlan's names (table, chair, sofa, bed, storage, sink, …).
    struct Object { var box: Box; var category: String }
    var walls: [Box] = []
    var objects: [Object] = []
    var doors: [Box] = []
    var windows: [Box] = []
    var floors: [Floor] = []
}

/// Writes a small, valid IFC4 file (IfcProject → Site → Building → Storey with walls, doors,
/// windows, floor slabs and IfcSpaces). Geometry uses simple extrusions; it is a draft, not a survey.
nonisolated enum RoomScanIFC {
    static func make(_ scan: ScannedBuilding, buildingName: String, storeyName: String = "Erdgeschoss", date: Date = Date()) -> String {
        var w = Writer()
        // RoomPlan (x, y up, z) → IFC (x, -z, y up); floors start at elevation 0.
        let floorLevel = scan.floors.flatMap { $0.corners.map(\.y) }.min() ?? scan.walls.map { $0.transform.columns.3.y - $0.height / 2 }.min() ?? 0
        func ifc(_ p: SIMD3<Float>) -> SIMD3<Double> { SIMD3(Double(p.x), Double(-p.z), Double(p.y - floorLevel)) }

        let origin = w.add("IFCCARTESIANPOINT((0.,0.,0.))")
        let zAxis = w.add("IFCDIRECTION((0.,0.,1.))"), xAxis = w.add("IFCDIRECTION((1.,0.,0.))")
        let worldPlacement = w.add("IFCAXIS2PLACEMENT3D(\(origin),\(zAxis),\(xAxis))")
        let context = w.add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,\(worldPlacement),$)")
        let lengthUnit = w.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")
        let areaUnit = w.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")
        let volumeUnit = w.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")
        let angleUnit = w.add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")
        let units = w.add("IFCUNITASSIGNMENT((\(lengthUnit),\(areaUnit),\(volumeUnit),\(angleUnit)))")
        let project = w.add("IFCPROJECT('\(guid())',$,\(str(buildingName)),'LiDAR-Raumscan (Entwurf)',$,$,$,(\(context)),\(units))")
        let sitePlacement = w.add("IFCLOCALPLACEMENT($,\(worldPlacement))")
        let site = w.add("IFCSITE('\(guid())',$,\(str("Grundstück")),$,$,\(sitePlacement),$,$,.ELEMENT.,$,$,$,$,$)")
        let buildingPlacement = w.add("IFCLOCALPLACEMENT(\(sitePlacement),\(worldPlacement))")
        let building = w.add("IFCBUILDING('\(guid())',$,\(str(buildingName)),$,$,\(buildingPlacement),$,$,.ELEMENT.,$,$,$)")
        let storeyPlacement = w.add("IFCLOCALPLACEMENT(\(buildingPlacement),\(worldPlacement))")
        let storey = w.add("IFCBUILDINGSTOREY('\(guid())',$,\(str(storeyName)),$,$,\(storeyPlacement),$,$,.ELEMENT.,0.)")
        w.add("IFCRELAGGREGATES('\(guid())',$,$,$,\(project),(\(site)))")
        w.add("IFCRELAGGREGATES('\(guid())',$,$,$,\(site),(\(building)))")
        w.add("IFCRELAGGREGATES('\(guid())',$,$,$,\(building),(\(storey)))")

        var elements: [String] = []
        let profileOrigin = w.add("IFCAXIS2PLACEMENT2D(\(w.add("IFCCARTESIANPOINT((0.,0.))")),$)")
        /// Extruded rectangle: bottom centre in RoomPlan space, horizontal direction of the width (x/z), size.
        func solid(bottom: SIMD3<Float>, dir: SIMD2<Float>, width: Float, depth: Float, height: Float) -> (placement: String, product: String)? {
            guard width > 0.01, height > 0.01, simd_length(dir) > 1e-6 else { return nil }
            let d = simd_normalize(dir), p = ifc(bottom)
            let location = w.add("IFCCARTESIANPOINT((\(num(p.x)),\(num(p.y)),\(num(p.z))))")
            let ref = w.add("IFCDIRECTION((\(num(Double(d.x))),\(num(Double(-d.y))),0.))")
            let axes = w.add("IFCAXIS2PLACEMENT3D(\(location),\(zAxis),\(ref))")
            let placement = w.add("IFCLOCALPLACEMENT(\(storeyPlacement),\(axes))")
            let profile = w.add("IFCRECTANGLEPROFILEDEF(.AREA.,$,\(profileOrigin),\(num(Double(width))),\(num(Double(max(depth, 0.02)))))")
            let body = w.add("IFCEXTRUDEDAREASOLID(\(profile),\(worldPlacement),\(zAxis),\(num(Double(height))))")
            let shape = w.add("IFCSHAPEREPRESENTATION(\(context),'Body','SweptSolid',(\(body)))")
            return (placement, w.add("IFCPRODUCTDEFINITIONSHAPE($,$,(\(shape)))"))
        }
        func centre(_ b: ScannedBuilding.Box) -> SIMD3<Float> { SIMD3(b.transform.columns.3.x, b.transform.columns.3.y, b.transform.columns.3.z) }
        func axisX(_ b: ScannedBuilding.Box) -> SIMD2<Float> { SIMD2(b.transform.columns.0.x, b.transform.columns.0.z) }

        // Walls: RoomPlan measures the inner surface. Shift each wall outwards by half its thickness so the
        // room-side face matches the scan instead of the wall centre.
        let roomCentres: [SIMD2<Float>] = scan.floors.isEmpty
            ? [scan.walls.reduce(SIMD2<Float>.zero) { $0 + SIMD2(centre($1).x, centre($1).z) } / Float(max(scan.walls.count, 1))]
            : scan.floors.map { f in f.corners.reduce(SIMD2<Float>.zero) { $0 + SIMD2($1.x, $1.z) } / Float(max(f.corners.count, 1)) }
        struct PlacedWall { let id: String; let scanCentre: SIMD3<Float>; let dir: SIMD2<Float>; let normal: SIMD2<Float>; let width: Float; let thickness: Float }
        var placedWalls: [PlacedWall] = []
        for (i, wall) in scan.walls.enumerated() {
            let c = centre(wall), dir = axisX(wall)
            guard simd_length(dir) > 1e-6 else { continue }
            let thickness: Float = wall.depth > 0.05 ? wall.depth : 0.17
            var normal = SIMD2<Float>(-simd_normalize(dir).y, simd_normalize(dir).x)
            let c2 = SIMD2(c.x, c.z)
            if let room = roomCentres.min(by: { simd_distance($0, c2) < simd_distance($1, c2) }), simd_dot(normal, room - c2) > 0 { normal = -normal }
            let shifted = c + SIMD3(normal.x, 0, normal.y) * (thickness / 2)
            guard let g = solid(bottom: shifted - SIMD3(0, wall.height / 2, 0), dir: dir, width: wall.width, depth: thickness, height: wall.height) else { continue }
            let id = w.add("IFCWALL('\(guid())',$,\(str("Wand \(i + 1)")),$,$,\(g.placement),\(g.product),$,.STANDARD.)")
            elements.append(id)
            placedWalls.append(PlacedWall(id: id, scanCentre: c, dir: simd_normalize(dir), normal: normal, width: wall.width, thickness: thickness))
        }

        // Doors and windows: real openings in the host wall (IfcOpeningElement + voids/fills).
        func hostWall(_ p: SIMD3<Float>) -> PlacedWall? {
            let p2 = SIMD2(p.x, p.z)
            return placedWalls.filter { w in
                let rel = p2 - SIMD2(w.scanCentre.x, w.scanCentre.z)
                return abs(simd_dot(rel, w.normal)) < 0.3 && abs(simd_dot(rel, w.dir)) < w.width / 2 + 0.15
            }.min { abs(simd_dot(p2 - SIMD2($0.scanCentre.x, $0.scanCentre.z), $0.normal)) < abs(simd_dot(p2 - SIMD2($1.scanCentre.x, $1.scanCentre.z), $1.normal)) }
        }
        func filling(_ b: ScannedBuilding.Box, entity: (String, String) -> String) {
            var c = centre(b)
            let host = hostWall(c)
            if let host {
                // Move onto the wall's centre line and cut the wall.
                let rel = SIMD2(c.x, c.z) - SIMD2(host.scanCentre.x, host.scanCentre.z)
                let onPlane = SIMD2(host.scanCentre.x, host.scanCentre.z) + host.dir * simd_dot(rel, host.dir) + host.normal * (host.thickness / 2)
                c = SIMD3(onPlane.x, c.y, onPlane.y)
                if let o = solid(bottom: c - SIMD3(0, b.height / 2, 0), dir: host.dir, width: b.width, depth: host.thickness + 0.1, height: b.height) {
                    let opening = w.add("IFCOPENINGELEMENT('\(guid())',$,'Oeffnung',$,$,\(o.placement),\(o.product),$,.OPENING.)")
                    w.add("IFCRELVOIDSELEMENT('\(guid())',$,$,$,\(host.id),\(opening))")
                    guard let g = solid(bottom: c - SIMD3(0, b.height / 2, 0), dir: host.dir, width: b.width, depth: 0.05, height: b.height) else { return }
                    let element = w.add(entity(g.placement, g.product))
                    w.add("IFCRELFILLSELEMENT('\(guid())',$,$,$,\(opening),\(element))")
                    elements.append(element)
                    return
                }
            }
            guard let g = solid(bottom: c - SIMD3(0, b.height / 2, 0), dir: axisX(b), width: b.width, depth: 0.05, height: b.height) else { return }
            elements.append(w.add(entity(g.placement, g.product)))
        }
        for (i, door) in scan.doors.enumerated() {
            filling(door) { "IFCDOOR('\(guid())',$,\(str("Tür \(i + 1)")),$,$,\($0),\($1),$,\(num(Double(door.height))),\(num(Double(door.width))),.DOOR.,.SINGLE_SWING_LEFT.,$)" }
        }
        for (i, window) in scan.windows.enumerated() {
            filling(window) { "IFCWINDOW('\(guid())',$,\(str("Fenster \(i + 1)")),$,$,\($0),\($1),$,\(num(Double(window.height))),\(num(Double(window.width))),.WINDOW.,.SINGLE_PANEL.,$)" }
        }

        // Furniture and fixtures as boxes with the matching IFC class.
        var counts: [String: Int] = [:]
        for object in scan.objects {
            let b = object.box
            guard let g = solid(bottom: centre(b) - SIMD3(0, b.height / 2, 0), dir: axisX(b), width: b.width, depth: b.depth, height: b.height) else { continue }
            let kind = Self.objectClass(object.category)
            counts[kind.name, default: 0] += 1
            let name = str("\(kind.name) \(counts[kind.name]!)")
            let objectType = kind.objectType.map(str) ?? "$"
            elements.append(w.add("\(kind.entity)('\(guid())',$,\(name),$,\(objectType),\(g.placement),\(g.product),$,.\(kind.type).)"))
        }

        // Rooms: floor polygon as slab and as IfcSpace extruded to the typical wall height.
        let roomHeight = Double(scan.walls.map(\.height).sorted().dropFirst(scan.walls.count / 2).first ?? 2.5)
        var spaces: [String] = []
        for floor in scan.floors {
            var points = floor.corners.map { ifc($0) }
            guard points.count >= 3 else { continue }
            if signedArea(points) < 0 { points.reverse() }
            let refs = points.map { w.add("IFCCARTESIANPOINT((\(num($0.x)),\(num($0.y))))") }
            let polyline = w.add("IFCPOLYLINE((\((refs + [refs[0]]).joined(separator: ","))))")
            let profile = w.add("IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,\(polyline))")
            let level = points.map(\.z).min() ?? 0
            let location = w.add("IFCCARTESIANPOINT((0.,0.,\(num(level))))")
            let axes = w.add("IFCAXIS2PLACEMENT3D(\(location),\(zAxis),\(xAxis))")
            let spacePlacement = w.add("IFCLOCALPLACEMENT(\(storeyPlacement),\(axes))")
            let spaceSolid = w.add("IFCEXTRUDEDAREASOLID(\(profile),\(worldPlacement),\(zAxis),\(num(roomHeight)))")
            let spaceShape = w.add("IFCSHAPEREPRESENTATION(\(context),'Body','SweptSolid',(\(spaceSolid)))")
            let spaceProduct = w.add("IFCPRODUCTDEFINITIONSHAPE($,$,(\(spaceShape)))")
            spaces.append(w.add("IFCSPACE('\(guid())',$,\(str(floor.name)),$,$,\(spacePlacement),\(spaceProduct),$,.ELEMENT.,.INTERNAL.,$)"))
            let slabAxes = w.add("IFCAXIS2PLACEMENT3D(\(w.add("IFCCARTESIANPOINT((0.,0.,\(num(level - 0.15))))")),\(zAxis),\(xAxis))")
            let slabPlacement = w.add("IFCLOCALPLACEMENT(\(storeyPlacement),\(slabAxes))")
            let slabSolid = w.add("IFCEXTRUDEDAREASOLID(\(profile),\(worldPlacement),\(zAxis),0.15)")
            let slabShape = w.add("IFCSHAPEREPRESENTATION(\(context),'Body','SweptSolid',(\(slabSolid)))")
            let slabProduct = w.add("IFCPRODUCTDEFINITIONSHAPE($,$,(\(slabShape)))")
            elements.append(w.add("IFCSLAB('\(guid())',$,\(str("Boden " + floor.name)),$,$,\(slabPlacement),\(slabProduct),$,.FLOOR.)"))
        }
        if !elements.isEmpty { w.add("IFCRELCONTAINEDINSPATIALSTRUCTURE('\(guid())',$,$,$,(\(elements.joined(separator: ","))),\(storey))") }
        if !spaces.isEmpty { w.add("IFCRELAGGREGATES('\(guid())',$,$,$,\(storey),(\(spaces.joined(separator: ","))))") }

        let stamp = ISO8601DateFormatter().string(from: date).replacingOccurrences(of: "Z", with: "")
        return """
        ISO-10303-21;
        HEADER;
        FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]','LiDAR-Raumscan, vorlaeufiger Entwurf'),'2;1');
        FILE_NAME(\(str(buildingName + ".ifc")),'\(stamp)',('KI trifft Gebaeude'),('Hochschule Darmstadt'),'KI trifft Gebaeude RoomScan','iOS RoomPlan','');
        FILE_SCHEMA(('IFC4'));
        ENDSEC;
        DATA;
        \(w.lines.joined(separator: "\n"))
        ENDSEC;
        END-ISO-10303-21;

        """
    }

    /// RoomPlan object category → IFC4 class, predefined type and German name.
    static func objectClass(_ category: String) -> (entity: String, type: String, name: String, objectType: String?) {
        switch category {
        case "table": ("IFCFURNITURE", "TABLE", "Tisch", nil)
        case "chair": ("IFCFURNITURE", "CHAIR", "Stuhl", nil)
        case "sofa": ("IFCFURNITURE", "SOFA", "Sofa", nil)
        case "bed": ("IFCFURNITURE", "BED", "Bett", nil)
        case "storage": ("IFCFURNITURE", "SHELF", "Schrank", nil)
        case "fireplace": ("IFCFURNITURE", "USERDEFINED", "Kamin", "Kamin")
        case "television": ("IFCELECTRICAPPLIANCE", "USERDEFINED", "Fernseher", "Fernseher")
        case "refrigerator": ("IFCELECTRICAPPLIANCE", "REFRIGERATOR", "Kühlschrank", nil)
        case "stove": ("IFCELECTRICAPPLIANCE", "ELECTRICCOOKER", "Herd", nil)
        case "oven": ("IFCELECTRICAPPLIANCE", "USERDEFINED", "Backofen", "Backofen")
        case "dishwasher": ("IFCELECTRICAPPLIANCE", "DISHWASHER", "Spülmaschine", nil)
        case "washerDryer": ("IFCELECTRICAPPLIANCE", "WASHINGMACHINE", "Waschmaschine", nil)
        case "sink": ("IFCSANITARYTERMINAL", "SINK", "Spüle", nil)
        case "toilet": ("IFCSANITARYTERMINAL", "TOILETPAN", "WC", nil)
        case "bathtub": ("IFCSANITARYTERMINAL", "BATH", "Badewanne", nil)
        case "stairs": ("IFCSTAIR", "NOTDEFINED", "Treppe", nil)
        default: ("IFCFURNITURE", "NOTDEFINED", "Objekt", nil)
        }
    }

    private struct Writer {
        var lines: [String] = []
        @discardableResult mutating func add(_ entity: String) -> String {
            let id = "#\(lines.count + 1)"
            lines.append("\(id)=\(entity);")
            return id
        }
    }

    private static func signedArea(_ p: [SIMD3<Double>]) -> Double {
        var a = 0.0
        for i in p.indices { let j = (i + 1) % p.count; a += p[i].x * p[j].y - p[j].x * p[i].y }
        return a / 2
    }

    static func num(_ v: Double) -> String {
        let r = (v * 10_000).rounded() / 10_000
        let s = String(format: "%.4f", r == 0 ? 0 : r)
        let trimmed = s.contains(".") ? String(s.reversed().drop { $0 == "0" }.reversed()) : s
        return trimmed.hasSuffix(".") ? trimmed : trimmed
    }

    /// STEP string literal with IFC escaping for non-ASCII characters (\X2\…\X0\).
    static func str(_ s: String) -> String {
        var out = ""
        for scalar in s.prefix(120).unicodeScalars {
            switch scalar {
            case "'": out += "''"
            case "\\": out += "\\\\"
            case _ where scalar.value < 0x20: continue
            case _ where scalar.value < 0x80: out.unicodeScalars.append(scalar)
            default: out += "\\X2\\" + String(format: "%04X", scalar.value & 0xFFFF) + "\\X0\\"
            }
        }
        return "'" + out + "'"
    }

    /// IFC GlobalId: 128-bit UUID in the 22-character IFC base64 alphabet.
    static func guid() -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$")
        let u = UUID().uuid
        let bytes = [u.0, u.1, u.2, u.3, u.4, u.5, u.6, u.7, u.8, u.9, u.10, u.11, u.12, u.13, u.14, u.15]
        var value = bytes.reduce((hi: UInt64(0), lo: UInt64(0))) { acc, b in (acc.hi << 8 | acc.lo >> 56, acc.lo << 8 | UInt64(b)) }
        var result = [Character](repeating: "0", count: 22)
        for i in stride(from: 21, through: 0, by: -1) {
            let digit = Int(value.lo & 63)
            result[i] = chars[digit]
            value.lo = (value.lo >> 6) | (value.hi << 58); value.hi >>= 6
        }
        result[0] = chars[Int(bytes[0] >> 6) & 3]
        return String(result)
    }
}
