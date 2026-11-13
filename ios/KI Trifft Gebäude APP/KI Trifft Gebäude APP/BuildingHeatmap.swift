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
    var body:some View {VStack(spacing:0){if let building {if account.buildings.count > 1 {Picker("Gebäude",selection:Binding(get:{self.building?.id ?? 0},set:{selected=$0})){ForEach(account.buildings){Text($0.name).tag($0.id)}}.pickerStyle(.menu).tint(d21Accent).padding(.horizontal)};BuildingHeatmapView(account:account,building:building).id(building.id)}else{ContentUnavailableView("Noch kein Gebäude",systemImage:"thermometer.sun",description:Text("Lege ein Gebäude an oder nimm eine Einladung an."))}}.navigationTitle("Heatmap").navigationBarTitleDisplayMode(.inline)}
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
    private var isOwner: Bool { building.is_owner != false }
    private func symbol(_ w: BuildingWeather) -> String {
        let cloud = w.current.cloud_cover ?? 50
        return cloud < 20 ? "sun.max.fill" : cloud < 60 ? "cloud.sun.fill" : "cloud.fill"
    }
    private func hourLabel(_ s: String) -> String { weatherDate(s)?.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute()) ?? s }

    var body:some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if data?.location == nil && !busy {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Standort fehlt", systemImage: "mappin.slash").font(.headline)
                        Text("Für Wetter und Wärmeansicht braucht dein Gebäude einen Standort.").font(.subheadline).foregroundStyle(.secondary)
                        if isOwner { Button { locationSheet = true } label: { Label("Standort festlegen", systemImage: "map") }.buttonStyle(.borderedProminent).tint(d21Accent) }
                    }.padding(18).frame(maxWidth: .infinity, alignment: .leading).d21Card(cornerRadius: 22)
                } else {
                    weatherCard
                    if let hours = data?.weather?.hourly, !hours.isEmpty { hourStrip(hours) }
                    openButton
                    legend
                    HStack(spacing: 10) {
                        NavigationLink { BuildingAssistantView(building: building, account: account, initialText: "Analysiere die gespeicherten Wetterdaten für dieses Gebäude. Nenne Quelle, Abrufzeit und Unsicherheiten. Welche allgemeinen Hinweise ergeben sich für Sonneneinstrahlung und Lüftung? Keine Raumtemperaturen oder Einsparungen erfinden.") } label: {
                            tile("sparkles", "Mit KI besprechen", d21Accent)
                        }.buttonStyle(BuildingTileButtonStyle()).disabled(data?.weather == nil)
                        if isOwner { Button { locationSheet = true } label: { tile("mappin.and.ellipse", "Standort ändern", .orange) }.buttonStyle(BuildingTileButtonStyle()) }
                    }
                }
                if let problem {
                    HStack { Image(systemName: "exclamationmark.icloud").foregroundStyle(.orange); Text(problem).font(.footnote); Spacer(); Button("Neu laden") { Task { await load() } }.font(.footnote.weight(.semibold)) }
                        .padding(14).d21Card(cornerRadius: 18)
                }
                DisclosureGroup("Hinweise & Datenquelle") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Regionale Wetterdaten von Open-Meteo. Beim Aktualisieren wird der auf etwa 100 m gerundete Standort gesendet; die Daten werden zwischengespeichert und mit dem Gebäudeteam geteilt. Keine IFC-Datei wird übertragen.")
                        Text("Die Einfärbung zeigt illustrative Oberflächentemperaturen aus Wetter, Sonneneinstrahlung und Flächenausrichtung – keine gemessenen Raumtemperaturen, keine echten Materialien, keine Verschattungsprüfung.")
                        if let w = data?.weather { Link(w.attribution, destination: URL(string: "https://open-meteo.com/")!) }
                    }.font(.caption).foregroundStyle(.secondary).padding(.top, 6)
                }.font(.subheadline).tint(.secondary).padding(14).d21Card(cornerRadius: 18)
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .task{await load()}
        .refreshable{await load()}
        .sheet(isPresented:$locationSheet,onDismiss:{Task{await load()}}){BuildingLocationView(account:account,building:building,initial:data?.location)}
        .fullScreenCover(item:$preview,onDismiss:{if let previewDirectory {try? FileManager.default.removeItem(at:previewDirectory)};previewDirectory=nil;preview=nil}){item in
            heatModelView(item)
        }
    }

    private var weatherCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(building.name).font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.8))
                    if let t = data?.weather?.current.temperature {
                        Text(t.formatted(.number.precision(.fractionLength(0))) + "°").font(.system(size: 64, weight: .thin, design: .rounded))
                    } else { Text("–").font(.system(size: 64, weight: .thin, design: .rounded)) }
                }
                Spacer()
                if let w = data?.weather { Image(systemName: symbol(w)).symbolRenderingMode(.multicolor).font(.system(size: 44)) }
            }
            HStack(spacing: 8) {
                if let h = data?.weather?.current.humidity { chip("humidity.fill", "\(Int(h)) %") }
                if let v = data?.weather?.current.wind_speed { chip("wind", v.formatted(.number.precision(.fractionLength(0))) + " km/h") }
                Spacer(minLength: 0)
                Button { Task { await refresh() } } label: {
                    Label(busy ? "Lädt …" : "Aktualisieren", systemImage: "arrow.clockwise").font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6).background(.white.opacity(0.2), in: Capsule())
                }.buttonStyle(.plain).disabled(busy || data?.location == nil)
            }
            if let w = data?.weather { Text("Wettermodell · " + time(w.current.time)).font(.caption2).foregroundStyle(.white.opacity(0.7)) }
            else { Text("Tippe auf „Aktualisieren“, um Wetterdaten zu laden.").font(.caption).foregroundStyle(.white.opacity(0.85)) }
        }
        .foregroundStyle(.white).padding(20)
        .background(LinearGradient(colors: [Color(red: 0.13, green: 0.42, blue: 0.75), Color(red: 0.36, green: 0.62, blue: 0.86)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private func hourStrip(_ hours: [BuildingWeather.Hour]) -> some View {
        let maxRadiation = max(hours.compactMap(\.radiation).max() ?? 1, 1)
        return VStack(alignment: .leading, spacing: 8) {
            Text("Zeitpunkt für die Wärmeansicht").font(.subheadline.weight(.semibold))
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(hours.prefix(48).enumerated()), id: \.offset) { index, h in
                            let selected = Int(hour) == index
                            Button { hour = Double(index) } label: {
                                VStack(spacing: 6) {
                                    Text(hourLabel(h.time)).font(.caption2.weight(.semibold))
                                    Text(h.temperature.map { $0.formatted(.number.precision(.fractionLength(0))) + "°" } ?? "–").font(.subheadline.weight(.bold))
                                    Capsule().fill(Color.orange.opacity(0.85)).frame(width: 6, height: 4 + 26 * CGFloat((h.radiation ?? 0) / maxRadiation)).frame(height: 30, alignment: .bottom)
                                }
                                .frame(width: 52).padding(.vertical, 10)
                                .foregroundStyle(selected ? .white : .primary)
                                .background(selected ? AnyShapeStyle(d21Accent.gradient) : AnyShapeStyle(Color(uiColor: .secondarySystemGroupedBackground)), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }.buttonStyle(.plain).id(index).accessibilityLabel("\(hourLabel(h.time)), \(h.temperature.map { String(Int($0)) } ?? "kein Wert") Grad")
                        }
                    }
                }.onAppear { proxy.scrollTo(Int(hour), anchor: .center) }
            }
            Label("Balken = Sonneneinstrahlung", systemImage: "sun.max").font(.caption2).foregroundStyle(.secondary)
        }
    }

    private var openButton: some View {
        Button { Task { await openModel() } } label: {
            HStack(spacing: 14) {
                Image(systemName: "cube.transparent.fill").font(.title2).foregroundStyle(.white).frame(width: 50, height: 50)
                    .background(LinearGradient(colors: [.blue, .orange, .red], startPoint: .bottomLeading, endPoint: .topTrailing), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("3D-Wärmeansicht öffnen").font(.headline)
                    Text(documents.isEmpty ? "Lade zuerst ein IFC-Modell in die Gebäudemappe" : (documents.first { $0.id == modelID }?.name ?? "")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                if busy { ProgressView() } else { Image(systemName: "chevron.right").foregroundStyle(.tertiary) }
            }.padding(14).d21Card(cornerRadius: 22)
        }
        .buttonStyle(BuildingTileButtonStyle()).foregroundStyle(.primary)
        .disabled(busy || modelID == nil || data?.weather == nil)
        .contextMenu { if documents.count > 1 { ForEach(documents) { d in Button(d.name) { modelID = d.id } } } }
    }

    private var legend: some View {
        VStack(alignment: .leading, spacing: 6) {
            LinearGradient(colors:[.blue,.cyan,.green,.yellow,.orange,.red],startPoint:.leading,endPoint:.trailing).frame(height:8).clipShape(Capsule())
            HStack { Text("−10 °C"); Spacer(); Text("Oberflächen, illustrativ"); Spacer(); Text("50 °C") }.font(.caption2).foregroundStyle(.secondary)
        }.padding(.horizontal, 4)
    }

    private func chip(_ symbol: String, _ text: String) -> some View {
        Label(text, systemImage: symbol).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6).background(.white.opacity(0.18), in: Capsule())
    }
    private func tile(_ symbol: String, _ title: String, _ color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: symbol).font(.body.weight(.semibold)).foregroundStyle(color).frame(width: 36, height: 36).background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            Text(title).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }.padding(12).frame(maxWidth: .infinity).d21Card(cornerRadius: 18).foregroundStyle(.primary)
    }

    private func heatModelView(_ item:DocumentPreview)->some View {
        NavigationStack {
            IFCWebView(modelURL:item.url,heat:HeatPresentation(temperature:sample?.temperature,radiation:sample?.radiation,hour:Double(Calendar.current.component(.hour,from:weatherDate(sample?.time ?? "") ?? Date()))),account:account,buildingID:building.id,documentID:item.document.id)
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .bottom) {
                    if let weather = data?.weather, !weather.hourly.isEmpty {
                        VStack(spacing: 8) {
                            HStack {
                                if let sample { Label(time(sample.time), systemImage: "clock").font(.caption.weight(.semibold)) }
                                Spacer()
                                if let t = sample?.temperature { Text(t.formatted(.number.precision(.fractionLength(1))) + " °C").font(.caption.weight(.bold)) }
                                if let r = sample?.radiation { Label(Int(r).formatted() + " W/m²", systemImage: "sun.max.fill").font(.caption.weight(.semibold)).foregroundStyle(.orange) }
                            }
                            Slider(value:$hour,in:0...Double(max(1,weather.hourly.count-1)),step:1).tint(.orange)
                            LinearGradient(colors:[.blue,.cyan,.green,.yellow,.orange,.red],startPoint:.leading,endPoint:.trailing).frame(height:5).clipShape(Capsule())
                        }
                        .padding(14).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous)).padding(.horizontal, 14).padding(.bottom, 20)
                    }
                }
                .navigationTitle(building.name).navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.confirmationAction){Button("Fertig"){preview=nil}}}
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
