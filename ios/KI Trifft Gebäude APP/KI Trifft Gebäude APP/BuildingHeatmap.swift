import SwiftUI
import MapKit

private func weatherDate(_ value:String)->Date? {let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];if let d=f.date(from:value){return d};f.formatOptions=[.withInternetDateTime];return f.date(from:value)}
struct HeatPresentation:Codable {let temperature:Double?;let radiation:Double?;let hour:Double}
struct BuildingLocation:Decodable {let latitude:Double;let longitude:Double;let revision:Int;let source:String}
struct BuildingLocationReply:Decodable {let location:BuildingLocation?}
struct BuildingWeather:Decodable {
    struct Current:Decodable {let time:String;let temperature:Double?;let humidity:Double?;let cloud_cover:Double?;let wind_speed:Double?}
    struct Hour:Decodable {let time:String;let temperature:Double?;let radiation:Double?}
    let provider:String;let kind:String;let current:Current;let hourly:[Hour];let fetched_at:String;let attribution:String;let source_url:String
}
struct BuildingWeatherReply:Decodable {let location:BuildingLocation?;let weather:BuildingWeather?}
struct BuildingHeatmapHome:View {
    @ObservedObject var account:AccountModel
    @State private var selected:Int?
    private var building:Building? {account.buildings.first{$0.id==selected} ?? account.buildings.first}
    var body:some View {VStack(spacing:0){if let building {Picker("Gebäude",selection:Binding(get:{self.building?.id ?? 0},set:{selected=$0})){ForEach(account.buildings){Text($0.name).tag($0.id)}}.pickerStyle(.menu).padding(.horizontal);BuildingHeatmapView(account:account,building:building).id(building.id)}else{ContentUnavailableView("Noch kein Gebäude",systemImage:"thermometer.sun",description:Text("Lege ein Gebäude an oder nimm eine Einladung an."))}}.navigationTitle("Heatmap").navigationBarTitleDisplayMode(.inline)}
}
struct BuildingHeatmapView:View {
    @ObservedObject var account:AccountModel
    let building:Building
    @State private var data:BuildingWeatherReply?
    @State private var documents:[BuildingDocument]=[]
    @State private var modelID:Int?
    @State private var hour=0.0
    @State private var busy=false
    @State private var problem:String?
    @State private var locationSheet=false
    @State private var preview:DocumentPreview?
    @State private var previewDirectory:URL?
    private var sample:BuildingWeather.Hour? {guard let a=data?.weather?.hourly,!a.isEmpty else{return nil};return a[min(Int(hour),a.count-1)]}
    private func time(_ s:String)->String {guard let d=weatherDate(s) else{return s};return d.formatted(date:.abbreviated,time:.shortened)}
    var body:some View {
        List {
            Section {Text(building.name).font(.headline);Text("Regionale Wetterdaten als Grundlage. Die Einfärbung zeigt illustrative Oberflächentemperaturen, keine gemessenen Raumtemperaturen.").font(.footnote).foregroundStyle(.secondary)}
            Section("Standort") {
                if let p=data?.location {Label("Gebäudestandort hinterlegt",systemImage:"mappin.and.ellipse");Text("\(p.latitude,format:.number.precision(.fractionLength(4))), \(p.longitude,format:.number.precision(.fractionLength(4)))").font(.caption).foregroundStyle(.secondary)}else{Text("Für dieses Gebäude fehlt noch der Standort.")}
                if building.is_owner != false {Button("Standort auswählen",systemImage:"map"){locationSheet=true}.disabled(busy)}
            }
            Section("Wetter") {
                if let w=data?.weather {
                    LabeledContent("Lufttemperatur",value:w.current.temperature.map{String(format:"%.1f °C",$0)} ?? "Keine Angabe")
                    LabeledContent("Luftfeuchtigkeit",value:w.current.humidity.map{String(format:"%.0f %%",$0)} ?? "Keine Angabe")
                    LabeledContent("Wind",value:w.current.wind_speed.map{String(format:"%.1f km/h",$0)} ?? "Keine Angabe")
                    Text("Wettermodell: \(time(w.current.time))\nAbgerufen: \(time(w.fetched_at))").font(.caption).foregroundStyle(.secondary)
                    Link(w.attribution,destination:URL(string:"https://open-meteo.com/")!)
                }else{Text("Noch keine Wetterdaten geladen.").foregroundStyle(.secondary)}
                Button(busy ? "Wird geladen …" : "Wetterdaten laden",systemImage:"arrow.clockwise"){Task{await refresh()}}.disabled(busy || data?.location==nil)
                Text("Beim Laden wird der auf etwa 100 m gerundete Standort an Open-Meteo gesendet. Daten werden zwischengespeichert und mit dem Gebäudeteam geteilt. Keine IFC-Datei wird übertragen.").font(.caption).foregroundStyle(.secondary)
            }
            if let weather=data?.weather {
                Section("Wärmeverteilung im Modell") {
                    if !weather.hourly.isEmpty {Slider(value:$hour,in:0...Double(max(1,weather.hourly.count-1)),step:1);if let sample {Text(time(sample.time)).font(.subheadline);LabeledContent("Prognose Luft",value:sample.temperature.map{String(format:"%.1f °C",$0)} ?? "Kein Wert");LabeledContent("Sonneneinstrahlung",value:sample.radiation.map{String(format:"%.0f W/m²",$0)} ?? "Kein Wert")}}
                    if documents.isEmpty {Text("Lade ein IFC-Modell in diese Gebäudemappe, um die Flächen einzufärben.").foregroundStyle(.secondary)}else {
                        Picker("IFC-Modell",selection:$modelID){ForEach(documents){Text($0.name).tag(Optional($0.id))}}
                        Button("3D-Heatmap öffnen",systemImage:"cube.transparent"){Task{await openModel()}}.disabled(busy || modelID==nil)
                        if let id=modelID {NavigationLink("Weiße Karte & Platzierung prüfen"){ModelMapPlacementView(account:account,documentID:id)}}
                    }
                    LinearGradient(colors:[.blue,.cyan,.green,.yellow,.orange,.red],startPoint:.leading,endPoint:.trailing).frame(height:10).clipShape(Capsule());HStack{Text("−10 °C");Spacer();Text("50 °C")}.font(.caption)
                    Text("Feste Farbskala. Vereinfachte Erwärmung anhand Wettermodell, Sonneneinstrahlung und Flächenausrichtung; ohne reale Materialien oder Verschattungsprüfung.").font(.caption).foregroundStyle(.secondary)
                }
                Section("KI-Analyse") {NavigationLink{BuildingAssistantView(building:building,account:account,initialText:"Analysiere die gespeicherten Wetterdaten für dieses Gebäude. Nenne Quelle, Abrufzeit und Unsicherheiten. Welche allgemeinen Hinweise ergeben sich für Sonneneinstrahlung und Lüftung? Keine Raumtemperaturen oder Einsparungen erfinden.")}label:{Label("Wetter mit der KI besprechen",systemImage:"sparkles")};Text("Der private Gebäudeassistent erhält die zuletzt geladenen Wetterdaten nach deiner kontoweiten KI-Freigabe. Es werden keine eigenen Modelle trainiert.").font(.caption).foregroundStyle(.secondary)}
            }
            if let problem {Section{Text(problem).foregroundStyle(.red);Button("Erneut laden"){Task{await load()}}.disabled(busy)}}
        }
        .task{await load()}
        .refreshable{await load()}
        .sheet(isPresented:$locationSheet,onDismiss:{Task{await load()}}){BuildingLocationView(account:account,building:building,initial:data?.location)}
        .sheet(item:$preview,onDismiss:{if let previewDirectory {try? FileManager.default.removeItem(at:previewDirectory)};previewDirectory=nil;preview=nil}){item in
            heatModelView(item)
        }
    }
    private func heatModelView(_ item:DocumentPreview)->some View {
        NavigationStack {
            VStack(spacing:8) {
                if let weather=data?.weather, !weather.hourly.isEmpty {
                    if let sample {Text(time(sample.time)).font(.caption).foregroundStyle(.secondary)}
                    Slider(value:$hour,in:0...Double(max(1,weather.hourly.count-1)),step:1).padding(.horizontal)
                }
                IFCWebView(modelURL:item.url,heat:HeatPresentation(temperature:sample?.temperature,radiation:sample?.radiation,hour:Double(Calendar.current.component(.hour,from:weatherDate(sample?.time ?? "") ?? Date()))),account:account,buildingID:building.id,documentID:item.document.id)
            }
            .navigationTitle("Heatmap · \(building.name)").navigationBarTitleDisplayMode(.inline)
            .toolbar{Button("Fertig"){preview=nil}}
        }
    }
    private func load() async {guard !busy else{return};busy=true;defer{busy=false};do{let value:BuildingWeatherReply=try await account.request("buildings/\(building.id)/weather");let docs=try await account.documents(buildingID:building.id);guard !Task.isCancelled else{return};data=value;documents=docs.filter{$0.mime_type=="application/x-step"};if !documents.contains(where:{$0.id==modelID}){modelID=documents.first?.id};problem=nil}catch{problem=error.localizedDescription}}
    private func refresh() async {guard !busy else{return};busy=true;defer{busy=false};do{data=try await account.request("buildings/\(building.id)/weather/refresh",method:"POST",body:[:],timeout:25);hour=0;problem=nil}catch{problem=error.localizedDescription}}
    private func openModel() async {guard !busy,let doc=documents.first(where:{$0.id==modelID}) else{return};busy=true;defer{busy=false};do{let item=try await account.previewDocument(doc);guard !Task.isCancelled else{try? FileManager.default.removeItem(at:item.url.deletingLastPathComponent());return};previewDirectory=item.url.deletingLastPathComponent();preview=item}catch{problem=error.localizedDescription}}
}
struct BuildingLocationView:View {
    @ObservedObject var account:AccountModel;let building:Building;let initial:BuildingLocation?
    @Environment(\.dismiss) private var dismiss
    @State private var region=MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:49.86,longitude:8.64),span:MKCoordinateSpan(latitudeDelta:0.01,longitudeDelta:0.01))
    @State private var search="";@State private var busy=false;@State private var problem:String?
    var body:some View {NavigationStack{Form{Section("Gebäudemitte"){TextField("Adresse",text:$search);Button("Adresse suchen"){Task{await find()}}.disabled(busy || search.isEmpty);Map(coordinateRegion:$region).preferredColorScheme(.light).frame(height:280).overlay{Image(systemName:"plus.circle.fill").foregroundStyle(d21Accent).allowsHitTesting(false)};Text("Fadenkreuz auf die Gebäudemitte schieben. Der Standort wird auf dem Projektserver mit berechtigten Gebäudemitgliedern geteilt. Suchen verwendet Apple Karten; es werden keine Pläne übertragen.").font(.caption).foregroundStyle(.secondary);Button("Standort speichern"){Task{await save()}}.disabled(busy)};if let problem{Section{Text(problem).foregroundStyle(.red)}}}.navigationTitle("Gebäudestandort").toolbar{Button("Abbrechen"){dismiss()}.disabled(busy)}.task{search=building.address;if let initial{region.center=CLLocationCoordinate2D(latitude:initial.latitude,longitude:initial.longitude)}}}}
    private func find() async {busy=true;defer{busy=false};do{let q=MKLocalSearch.Request();q.naturalLanguageQuery=search;let r=try await MKLocalSearch(request:q).start();guard let p=r.mapItems.first else{throw APIError(status:0,message:"Adresse nicht gefunden.")};region.center=p.placemark.coordinate}catch{problem=error.localizedDescription}}
    private func save() async {busy=true;defer{busy=false};do{let _:BuildingLocationReply=try await account.request("buildings/\(building.id)/location",method:"PUT",body:["latitude":region.center.latitude,"longitude":region.center.longitude,"revision":initial?.revision ?? 0]);dismiss()}catch{problem=error.localizedDescription}}
}
