import SwiftUI
import UIKit

struct LampLocation: Codable { let building_id: Int; let room: String; let document_id: Int?; let space_id: Int?; let revision: Int }
struct ConnectedLamp: Decodable, Identifiable {
    let key: String; let name: String; let room: String; let available: Bool; let is_on: Bool?
    let supports_rgb: Bool?; let rgb: [Int]?; let brightness: Int?; let location: LampLocation?
    var id: String { key }
}
struct ConnectedLampList: Decodable { let configured: Bool; let lights: [ConnectedLamp] }
struct ConnectedLampCommand: Decodable { let confirmed: Bool; let light: ConnectedLamp; let message: String }
struct ModelRoom: Decodable, Identifiable { let id: Int; let name: String }
struct ModelRoomList: Decodable { let rooms: [ModelRoom] }
func lightRGB(_ color: Color) -> [Int] { var r: CGFloat=0,g: CGFloat=0,b: CGFloat=0,a: CGFloat=0; UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a); return [r,g,b].map { max(0,min(255,Int(($0*255).rounded()))) } }
func lightColor(_ rgb: [Int]?) -> Color { guard let rgb, rgb.count==3 else { return .white }; return Color(red:Double(rgb[0])/255,green:Double(rgb[1])/255,blue:Double(rgb[2])/255) }

struct ConnectedLampCard: View {
    let lamp: ConnectedLamp
    @ObservedObject var account: AccountModel
    let assign: () -> Void
    let changed: () async -> Void
    @State private var color = Color.white
    @State private var level = 100.0
    @State private var busy = false
    @State private var problem: String?
    var body: some View {
        VStack(alignment:.leading,spacing:12) {
            Label(lamp.name,systemImage:lamp.available && lamp.is_on == true ? "lightbulb.fill" : "lightbulb").font(.headline).foregroundStyle(.primary)
            Text((lamp.location?.room.isEmpty == false ? lamp.location!.room : "Noch keinem Raum zugeordnet") + " · " + (lamp.available ? lamp.is_on == true ? "Ein" : "Aus" : "Nicht erreichbar")).font(.subheadline).foregroundStyle(.secondary)
            Button(lamp.is_on == true ? "Ausschalten" : "Einschalten",systemImage:"power") { Task { await command(["on":lamp.is_on != true]) } }.buttonStyle(.bordered).disabled(!lamp.available || busy)
            if lamp.supports_rgb == true {
                ColorPicker("Lichtfarbe",selection:$color,supportsOpacity:false).disabled(busy || !lamp.available)
                Slider(value:$level,in:1...100,step:1) { Text("Helligkeit") }.disabled(busy || !lamp.available)
                Button("Farbe anwenden und einschalten") { Task { await command(["on":true,"rgb":lightRGB(color),"brightness":Int((level*255/100).rounded())]) } }.disabled(busy || !lamp.available)
            }
            Button("Gebäude & Raum",systemImage:"building.2.crop.circle") { assign() }.disabled(busy)
            Text("Echtes Gerät · Status vom Projektserver bestätigt").font(.caption).foregroundStyle(.secondary)
            if busy { ProgressView("Lichtauftrag …") }
            if let problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
        }.padding(.vertical,6)
        .task(id:(lamp.rgb?.description ?? "") + String(lamp.brightness ?? -1)) { if !busy { color=lightColor(lamp.rgb);level=Double(lamp.brightness ?? 255)*100/255 } }
    }
    private func command(_ body:[String:Any]) async {
        guard !busy else { return };busy=true;defer {busy=false}
        do { let result:ConnectedLampCommand=try await account.request("integrations/home-assistant/lights/\(lamp.key)/command",method:"POST",body:body,headers:["X-Request-ID":UUID().uuidString],timeout:30);problem=result.confirmed ? nil : result.message;await changed() }
        catch {problem=error.localizedDescription+" Bitte Status neu laden, bevor du erneut schaltest.";await changed()}
    }
}
struct AvailableLampPicker: View {
    @ObservedObject var account:AccountModel
    let building:Building
    let saved:() -> Void
    @State private var lamps:[ConnectedLamp]=[]
    @State private var problem:String?
    @State private var loading=true
    var body:some View {
        NavigationStack {
            List {
                Text("Wähle ein freigegebenes Gerät und ordne es deinem Gebäude und Raum zu.").font(.footnote).foregroundStyle(.secondary)
                ForEach(lamps) { lamp in NavigationLink { EquipmentAssignmentView(account:account,building:building,lamp:lamp,saved:saved) } label: { Label(lamp.name,systemImage:"lightbulb");Text(lamp.location == nil ? "Nicht zugeordnet" : "Zuordnung ändern").font(.caption).foregroundStyle(.secondary) } }
                if loading {ProgressView("Geräte werden geladen …")}
                if !loading && lamps.isEmpty {Text("Für dein Konto sind noch keine Geräte auf dem Projektserver freigegeben.")}
                if let problem {Text(problem).foregroundStyle(.red)}
            }.navigationTitle("Gerät verbinden")
            .task {do {let result:ConnectedLampList=try await account.request("integrations/home-assistant/lights");lamps=result.lights} catch {problem=error.localizedDescription};loading=false}
        }
    }
}
struct EquipmentAssignmentView: View {
    @ObservedObject var account:AccountModel
    let building:Building
    var lamp:ConnectedLamp? = nil
    var device:BuildingDevice? = nil
    let saved:() -> Void
    @State private var destination=0
    @State private var documents:[BuildingDocument]=[]
    @State private var document:Int?
    @State private var rooms:[ModelRoom]=[]
    @State private var space:Int?
    @State private var room=""
    @State private var busy=false
    @State private var problem:String?
    var body:some View {
        Form {
            Section("Zuordnung") {
                Picker("Gebäude",selection:$destination) {ForEach(account.buildings.filter {$0.is_owner != false}) {Text($0.name).tag($0.id)}}.disabled(busy)
                Picker("Raum aus Modell",selection:$document) {Text("Raumname eingeben").tag(Optional<Int>.none);ForEach(documents){Text($0.name).tag(Optional($0.id))}}.disabled(busy)
                if document != nil {Picker("IFC-Raum",selection:$space){Text("Raum auswählen").tag(Optional<Int>.none);ForEach(rooms){Text($0.name).tag(Optional($0.id))}}.disabled(busy)}
                else {TextField("Raumname",text:$room).disabled(busy)}
                Text(document == nil ? "Mit einem Raumnamen kannst du sofort beginnen. Für die farbige Anzeige im 3D-Modell verknüpfe später einen vorhandenen IFC-Raum." : "Der ausgewählte Raum leuchtet im 3D-Modell passend zum bestätigten Gerätezustand. Mehrere Lampen werden als vereinfachte Mischfarbe dargestellt.").font(.footnote).foregroundStyle(.secondary)
            }
            if lamp != nil {Section{Text("Die echte Lampe bleibt nur für dein freigegebenes Konto bedienbar. Andere Gebäudemitglieder erhalten dadurch keinen Zugriff auf dein Zuhause.").font(.footnote).foregroundStyle(.secondary)}}
            Section{Button(busy ? "Wird gespeichert …" : "Zuordnung speichern"){Task{await save()}}.disabled(busy || destination==0 || document != nil && space==nil || room.count>100)}
            if let problem {Section{Text(problem).foregroundStyle(.red)}}
        }.navigationTitle(lamp?.name ?? device?.name ?? "Gerät zuordnen")
        .task {destination=lamp?.location?.building_id ?? device?.building_id ?? building.id;document=lamp?.location?.document_id ?? device?.document_id;space=lamp?.location?.space_id ?? device?.space_id;room=lamp?.location?.room ?? device?.room ?? "";await loadDocuments()}
        .onChange(of:destination){old,_ in if old != 0 {document=nil;space=nil;Task{await loadDocuments()}}}
        .onChange(of:document){_,_ in Task{await loadRooms()}}
    }
    private func loadDocuments() async {do {let target=destination;let docs=try await account.documents(buildingID:target).filter{$0.mime_type=="application/x-step"};guard !Task.isCancelled,target==destination else{return};documents=docs;await loadRooms()} catch {problem=error.localizedDescription}}
    private func loadRooms() async {guard let id=document else{rooms=[];space=nil;return};do {let value:ModelRoomList=try await account.request("documents/\(id)/model-rooms");guard document==id else{return};rooms=value.rooms;if let selected=space,!rooms.contains(where:{$0.id==selected}){space=nil}} catch {problem=error.localizedDescription}}
    private func save() async {
        guard !busy else{return};busy=true;defer{busy=false}
        let body:[String:Any]=["building_id":destination,"room":room,"document_id":document.map{$0 as Any} ?? NSNull(),"space_id":space.map{$0 as Any} ?? NSNull(),"revision":lamp?.location?.revision ?? device?.revision ?? 0]
        do {if let lamp {let _:LampLocation=try await account.request("integrations/home-assistant/lights/\(lamp.key)/location",method:"PUT",body:body)} else if let device {let _:BuildingDevice=try await account.request("buildings/\(device.building_id)/devices/\(device.id)/location",method:"PUT",body:body)};saved()} catch {problem=error.localizedDescription}
    }
}

struct SimulatedLampColor: View {
    @ObservedObject var account:AccountModel
    let device:BuildingDevice
    let changed:() async -> Void
    @State private var color=Color.white
    @State private var busy=false
    @State private var problem:String?
    var body:some View {
        VStack(alignment:.leading) {
            ColorPicker("Simulierte Lichtfarbe",selection:$color,supportsOpacity:false).disabled(busy)
            Button("Farbe in der Simulation anwenden") {Task{busy=true;defer{busy=false};do{let _:BuildingDevice=try await account.request("buildings/\(device.building_id)/devices/\(device.id)",method:"PATCH",body:["is_on":true,"revision":device.revision,"rgb":lightRGB(color)]);problem=nil;await changed()}catch{problem=error.localizedDescription;await changed()}}}.disabled(busy)
            if let problem {Text(problem).font(.caption).foregroundStyle(.red)}
        }.task(id:device.revision){color=lightColor(device.rgb)}
    }
}
