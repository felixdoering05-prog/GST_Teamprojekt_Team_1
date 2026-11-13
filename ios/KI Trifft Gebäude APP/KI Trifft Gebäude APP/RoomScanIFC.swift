import Foundation
import simd

/// Geometry captured by a room scan, independent of RoomPlan so it can be tested on any platform.
/// Coordinates are RoomPlan/ARKit world space: metres, Y up, right-handed.
struct ScannedBuilding {
    struct Box { var transform: simd_float4x4; var width: Float; var height: Float; var depth: Float }
    struct Floor { var corners: [SIMD3<Float>]; var name: String }
    var walls: [Box] = []
    var doors: [Box] = []
    var windows: [Box] = []
    var floors: [Floor] = []
}

/// Writes a small, valid IFC4 file (IfcProject → Site → Building → Storey with walls, doors,
/// windows, floor slabs and IfcSpaces). Geometry uses simple extrusions; it is a draft, not a survey.
enum RoomScanIFC {
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
        let site = w.add("IFCSITE('\(guid())',$,'Grundstück',$,$,\(sitePlacement),$,$,.ELEMENT.,$,$,$,$,$)")
        let buildingPlacement = w.add("IFCLOCALPLACEMENT(\(sitePlacement),\(worldPlacement))")
        let building = w.add("IFCBUILDING('\(guid())',$,\(str(buildingName)),$,$,\(buildingPlacement),$,$,.ELEMENT.,$,$,$)")
        let storeyPlacement = w.add("IFCLOCALPLACEMENT(\(buildingPlacement),\(worldPlacement))")
        let storey = w.add("IFCBUILDINGSTOREY('\(guid())',$,\(str(storeyName)),$,$,\(storeyPlacement),$,$,.ELEMENT.,0.)")
        w.add("IFCRELAGGREGATES('\(guid())',$,$,$,\(project),(\(site)))")
        w.add("IFCRELAGGREGATES('\(guid())',$,$,$,\(site),(\(building)))")
        w.add("IFCRELAGGREGATES('\(guid())',$,$,$,\(building),(\(storey)))")

        var elements: [String] = []
        /// Places a box (centre transform) as an extruded rectangle standing on its bottom face.
        func box(_ b: ScannedBuilding.Box, thickness: Float, entity: (String, String) -> String) {
            let t = b.transform
            let centre = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
            let up = SIMD3<Float>(0, 1, 0)
            let bottom = ifc(centre - up * (b.height / 2))
            var dir = ifc(SIMD3(t.columns.0.x, t.columns.0.y, t.columns.0.z) + centre) - ifc(centre)
            dir.z = 0
            let length = simd_length(dir)
            guard length > 1e-6, b.width > 0.01, b.height > 0.01 else { return }
            dir /= length
            let location = w.add("IFCCARTESIANPOINT((\(num(bottom.x)),\(num(bottom.y)),\(num(bottom.z))))")
            let ref = w.add("IFCDIRECTION((\(num(dir.x)),\(num(dir.y)),0.))")
            let axes = w.add("IFCAXIS2PLACEMENT3D(\(location),\(zAxis),\(ref))")
            let placement = w.add("IFCLOCALPLACEMENT(\(storeyPlacement),\(axes))")
            let profileAxes = w.add("IFCAXIS2PLACEMENT2D(\(w.add("IFCCARTESIANPOINT((0.,0.))")),$)")
            let profile = w.add("IFCRECTANGLEPROFILEDEF(.AREA.,$,\(profileAxes),\(num(Double(b.width))),\(num(Double(max(thickness, 0.02)))))")
            let solid = w.add("IFCEXTRUDEDAREASOLID(\(profile),\(worldPlacement),\(zAxis),\(num(Double(b.height))))")
            let shape = w.add("IFCSHAPEREPRESENTATION(\(context),'Body','SweptSolid',(\(solid)))")
            let product = w.add("IFCPRODUCTDEFINITIONSHAPE($,$,(\(shape)))")
            elements.append(w.add(entity(placement, product)))
        }
        for (i, wall) in scan.walls.enumerated() {
            box(wall, thickness: wall.depth > 0.05 ? wall.depth : 0.2) { "IFCWALL('\(guid())',$,\(str("Wand \(i + 1)")),$,$,\($0),\($1),$,.STANDARD.)" }
        }
        for (i, door) in scan.doors.enumerated() {
            box(door, thickness: 0.06) { "IFCDOOR('\(guid())',$,\(str("Tür \(i + 1)")),$,$,\($0),\($1),$,\(num(Double(door.height))),\(num(Double(door.width))),.DOOR.,.SINGLE_SWING_LEFT.,$)" }
        }
        for (i, window) in scan.windows.enumerated() {
            box(window, thickness: 0.06) { "IFCWINDOW('\(guid())',$,\(str("Fenster \(i + 1)")),$,$,\($0),\($1),$,\(num(Double(window.height))),\(num(Double(window.width))),.WINDOW.,.SINGLE_PANEL.,$)" }
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
