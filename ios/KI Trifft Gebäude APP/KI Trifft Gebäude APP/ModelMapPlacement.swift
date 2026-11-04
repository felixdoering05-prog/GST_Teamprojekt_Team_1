import SwiftUI
import MapKit

struct ModelMapSettings: Decodable {
    let latitude:Double;let longitude:Double;let heading:Double;let meters_per_unit:Double;let revision:Int;let loaded_at:String?
}
struct ModelMapSettingsReply: Decodable {let map_view:ModelMapSettings?}
struct ModelMapPlacementView: View {
    @ObservedObject var account:AccountModel
    let documentID:Int
    @Environment(\.dismiss) private var dismiss
    @State private var region=MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:50.9,longitude:10.4),span:MKCoordinateSpan(latitudeDelta:6,longitudeDelta:6))
    @State private var search=""
    @State private var heading=0.0
    @State private var scale=1.0
    @State private var revision=0
    @State private var busy=false
    @State private var problem:String?
    @State private var result:String?
    var body:some View {
        NavigationStack {
            Form {
                Section("Gebäudemitte auswählen") {
                    TextField("Adresse oder Ort suchen",text:$search)
                    Button("In Apple Karten suchen",systemImage:"magnifyingglass") {Task{await findPlace()}}.disabled(busy || search.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                    Map(coordinateRegion:$region,interactionModes:.all).frame(height:240).overlay {Image(systemName:"plus.circle.fill").font(.title).foregroundStyle(d21Accent).allowsHitTesting(false)}
                    Text("Verschiebe und zoome die Karte, bis das Fadenkreuz auf der Gebäudemitte liegt. Diese Position wird dem Mittelpunkt des IFC-Modells zugeordnet und mit dem Gebäudeteam geteilt.").font(.footnote).foregroundStyle(.secondary)
                    TextField("Breitengrad",value:$region.center.latitude,format:.number.precision(.fractionLength(6))).keyboardType(.numbersAndPunctuation)
                    TextField("Längengrad",value:$region.center.longitude,format:.number.precision(.fractionLength(6))).keyboardType(.numbersAndPunctuation)
                }.disabled(busy)
                Section("Ausrichtung und Maßstab") {
                    LabeledContent("Modelldrehung",value:"\(Int(heading))° im Uhrzeigersinn")
                    Slider(value:$heading,in:0...359,step:1)
                    TextField("Meter pro Modelleinheit",value:$scale,format:.number).keyboardType(.decimalPad)
                    Text("Standard: 1 Modelleinheit = 1 Meter. Position, Drehung und Maßstab werden manuell eingestellt; es erfolgt keine vermessungsgerechte automatische Georeferenzierung.").font(.footnote).foregroundStyle(.secondary)
                }.disabled(busy)
                Section {
                    Button(busy ? "Wird vorbereitet …" : "Speichern & Straßen laden") {Task{await save()}}.disabled(busy)
                    Text("Lädt etwa 200 Meter Umgebung aus OpenStreetMap/Overpass. Dabei wird der gewählte Kartenausschnitt an ovp.dresel.systems (Europa-Daten) übertragen; keine IFC-Datei. Im Modell erscheinen Straßen und vereinfachte Nachbargebäude in heller BIM-Optik. Fehlende Gebäudehöhen werden geschätzt.").font(.footnote).foregroundStyle(.secondary)
                }
                if let result {Section{Text(result).foregroundStyle(d21Accent)}}
                if let problem {Section{Text(problem).foregroundStyle(.red)}}
            }.navigationTitle("Modell auf Karte").navigationBarTitleDisplayMode(.inline)
            .toolbar{Button("Fertig"){dismiss()}.disabled(busy)}
            .interactiveDismissDisabled(busy)
            .task {busy=true;defer{busy=false};do{let value:ModelMapSettingsReply=try await account.request("documents/\(documentID)/map-view");if let view=value.map_view{region=MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:view.latitude,longitude:view.longitude),span:MKCoordinateSpan(latitudeDelta:0.002,longitudeDelta:0.002));heading=view.heading;scale=view.meters_per_unit;revision=view.revision}}catch{problem=error.localizedDescription}}
        }
    }
    private func findPlace() async {
        guard !busy else{return};busy=true;defer{busy=false}
        do {let request=MKLocalSearch.Request();request.naturalLanguageQuery=search;let response=try await MKLocalSearch(request:request).start();guard let place=response.mapItems.first else{throw APIError(status:0,message:"Kein passender Ort gefunden.")};region=MKCoordinateRegion(center:place.placemark.coordinate,span:MKCoordinateSpan(latitudeDelta:0.002,longitudeDelta:0.002));problem=nil} catch {problem=error.localizedDescription}
    }
    private func save() async {
        guard !busy else{return};busy=true;problem=nil;result=nil;defer{busy=false}
        do {
            let saved:ModelMapSettingsReply=try await account.request("documents/\(documentID)/map-view",method:"PUT",body:["latitude":region.center.latitude,"longitude":region.center.longitude,"heading":heading,"meters_per_unit":scale,"revision":revision]);revision=saved.map_view?.revision ?? revision
            if saved.map_view?.loaded_at != nil { result="Ausrichtung und Maßstab gespeichert. Die vorhandenen Kartendaten werden weiterverwendet.";return }
            let loaded:ModelMapSettingsReply=try await account.request("documents/\(documentID)/map-view/load",method:"POST",body:["revision":revision],timeout:30);revision=loaded.map_view?.revision ?? revision;result="Gespeichert. Die Kartenumgebung wird im 3D-Modell beim nächsten Abgleich eingeblendet."
        }catch {problem=error.localizedDescription}
    }
}
