import SwiftUI
import MapKit

struct ModelMapSettings: Decodable {
    let latitude:Double;let longitude:Double;let heading:Double;let meters_per_unit:Double;let revision:Int;let loaded_at:String?;var area_width_m:Int?=nil
}
struct ModelMapSettingsReply: Decodable {let map_view:ModelMapSettings?;var building_location:BuildingLocation?=nil}
struct PlacementAssessment:Decodable {let notes:[String];let footprint_at_anchor:Bool;let has_projected_georeference:Bool;let site_distance_m:Int?}
struct GeoreferenceMetadata:Decodable {let document:BuildingDocument;let can_edit:Bool;let address:String}
struct GeoreferenceProposal:Decodable {let latitude:Double?;let longitude:Double?;let heading:Double;let meters_per_unit:Double;let source:String;let confidence:String;let warnings:[String];let can_apply:Bool}
struct ModelMapPlacementView: View {
    @ObservedObject var account:AccountModel
    let documentID:Int
    @Environment(\.dismiss) private var dismiss
    @State private var region=MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:50.9,longitude:10.4),span:MKCoordinateSpan(latitudeDelta:6,longitudeDelta:6))
    @State private var search=""
    @State private var originalSearch=""
    @State private var heading=0.0
    @State private var scale=1.0
    @State private var revision=0
    @State private var busy=false
    @State private var problem:String?
    @State private var result:String?
    @State private var assessment:PlacementAssessment?
    @State private var preview:DocumentPreview?
    @State private var geometry:PlacementGeometry?
    @State private var proposal:GeoreferenceProposal?
    @State private var hasLocation=false
    @State private var canEdit=false
    @State private var preparing=true
    var body:some View {
        NavigationStack {
            Form {
                Section("Automatische Platzierung") {
                    if preparing {ProgressView("IFC-Georeferenz wird geprüft …")}
                    if let proposal {Label(proposal.source,systemImage:"location.north.circle");ForEach(proposal.warnings,id:\.self){Text($0).font(.footnote).foregroundStyle(.secondary)}}
                    if proposal?.confidence != "georeferenced" {TextField("Adresse des Gebäudes",text:$search)}
                    Map(coordinateRegion:$region,interactionModes:.all).preferredColorScheme(.light).frame(height:210).overlay{Image(systemName:"plus.circle.fill").foregroundStyle(d21Accent).allowsHitTesting(false)}
                    Button(busy ? "Wird platziert …" : "Automatisch platzieren & Karte laden",systemImage:"sparkles"){Task{await autoPlace()}}.disabled(busy || preparing || !canEdit)
                    Text("IFC-Standort und Nordrichtung werden bevorzugt. Sonst wird ein passender Kartengrundriss geprüft. Der Kartenpunkt wird mit dem Team geteilt. Beim Laden wird ein 100 × 100 m großer Ausschnitt an OpenStreetMap/Overpass (ovp.dresel.systems) übertragen, keine IFC-Datei.").font(.footnote).foregroundStyle(.secondary)
                }
                Section {DisclosureGroup("Details / manuell korrigieren") {
                    TextField("Breitengrad",value:$region.center.latitude,format:.number.precision(.fractionLength(6))).keyboardType(.numbersAndPunctuation)
                    TextField("Längengrad",value:$region.center.longitude,format:.number.precision(.fractionLength(6))).keyboardType(.numbersAndPunctuation)
                    LabeledContent("Drehung",value:"\(Int(heading))°")
                    Slider(value:$heading,in:0...359,step:1)
                    TextField("Meter pro Modelleinheit",value:$scale,format:.number).keyboardType(.decimalPad)
                    Button("Manuelle Platzierung speichern"){Task{await save()}}
                }}.disabled(busy || !canEdit)
                if let result {Section{Text(result).foregroundStyle(d21Accent)}}
                if let problem {Section{Text(problem).foregroundStyle(.red)}}
            }.navigationTitle("Modell auf Karte").navigationBarTitleDisplayMode(.inline)
            .toolbar{Button("Fertig"){dismiss()}.disabled(busy)}
            .interactiveDismissDisabled(busy)
            .background {if let preview {PlacementProbe(url:preview.url){value in geometry=value;self.preview=nil;try? FileManager.default.removeItem(at:preview.url.deletingLastPathComponent());Task{await updateProposal();preparing=false}}.frame(width:1,height:1).opacity(0)}}
            .onDisappear{if let preview{try? FileManager.default.removeItem(at:preview.url.deletingLastPathComponent())}}
            .task {busy=true;defer{busy=false};do {
                let meta:GeoreferenceMetadata=try await account.request("documents/\(documentID)/georeference");canEdit=meta.can_edit;search=meta.address;originalSearch=meta.address
                let value:ModelMapSettingsReply=try await account.request("documents/\(documentID)/map-view")
                if let view=value.map_view {region.center=CLLocationCoordinate2D(latitude:view.latitude,longitude:view.longitude);heading=view.heading;scale=view.meters_per_unit;revision=view.revision;hasLocation=true}
                else if let point=value.building_location {region.center=CLLocationCoordinate2D(latitude:point.latitude,longitude:point.longitude);hasLocation=true}
                if hasLocation {region.span=MKCoordinateSpan(latitudeDelta:0.002,longitudeDelta:0.002)}
                if canEdit {preview=try await account.previewDocument(meta.document)}else{preparing=false}
            }catch{problem=error.localizedDescription;preparing=false}}

        }
    }
    private func updateProposal() async {
        guard let geometry else {problem="IFC konnte nicht automatisch vermessen werden. Die manuelle Platzierung bleibt verfügbar.";return}
        do {let data=try JSONEncoder().encode(geometry);var body:[String:Any]=["geometry":try JSONSerialization.jsonObject(with:data)];if hasLocation{body["latitude"]=region.center.latitude;body["longitude"]=region.center.longitude}
            let value:GeoreferenceProposal=try await account.request("documents/\(documentID)/georeference/proposal",method:"POST",body:body);proposal=value
            if value.can_apply,let lat=value.latitude,let lon=value.longitude {region=MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:lat,longitude:lon),span:MKCoordinateSpan(latitudeDelta:0.002,longitudeDelta:0.002));heading=value.heading;scale=value.meters_per_unit;hasLocation=true}
        }catch{problem=error.localizedDescription}
    }
    private func autoPlace() async {
        guard !busy else{return}
        if proposal?.confidence != "georeferenced",!search.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,(!hasLocation || search != originalSearch) {await findPlace();guard problem == nil else{return};hasLocation=true;originalSearch=search;await updateProposal()}
        guard hasLocation else{problem="Bitte einmal die Gebäudeadresse eingeben.";return}
        await save()
        if problem == nil,proposal?.confidence != "georeferenced",geometry != nil {await updateProposal();if proposal?.can_apply == true {await save()}}
    }
    private func checkPlacement() async {guard !busy else{return};busy=true;defer{busy=false};do{assessment=try await account.request("documents/\(documentID)/placement-check?latitude=\(region.center.latitude)&longitude=\(region.center.longitude)");problem=nil}catch{problem=error.localizedDescription}}
    private func findPlace() async {
        guard !busy else{return};busy=true;defer{busy=false}
        do {let request=MKLocalSearch.Request();request.naturalLanguageQuery=search;let response=try await MKLocalSearch(request:request).start();guard let place=response.mapItems.first else{throw APIError(status:0,message:"Kein passender Ort gefunden.")};region=MKCoordinateRegion(center:place.placemark.coordinate,span:MKCoordinateSpan(latitudeDelta:0.002,longitudeDelta:0.002));problem=nil;hasLocation=true} catch {problem=error.localizedDescription}
    }
    private func save() async {
        guard !busy else{return};busy=true;problem=nil;result=nil;defer{busy=false}
        do {
            let saved:ModelMapSettingsReply=try await account.request("documents/\(documentID)/map-view",method:"PUT",body:["latitude":region.center.latitude,"longitude":region.center.longitude,"heading":heading,"meters_per_unit":scale,"revision":revision]);revision=saved.map_view?.revision ?? revision
            assessment=try await account.request("documents/\(documentID)/placement-check")
            if saved.map_view?.loaded_at != nil && saved.map_view?.area_width_m == 100 { result="Ausrichtung und Maßstab gespeichert. Die vorhandenen Kartendaten werden weiterverwendet.";return }
            let loaded:ModelMapSettingsReply=try await account.request("documents/\(documentID)/map-view/load",method:"POST",body:["revision":revision],timeout:30);revision=loaded.map_view?.revision ?? revision;assessment=try await account.request("documents/\(documentID)/placement-check");result="Gespeichert. Die Kartenumgebung wird im 3D-Modell beim nächsten Abgleich eingeblendet."
        }catch {problem=error.localizedDescription}
    }
}
