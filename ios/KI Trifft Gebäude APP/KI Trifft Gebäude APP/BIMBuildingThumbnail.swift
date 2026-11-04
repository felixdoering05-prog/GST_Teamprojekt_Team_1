import SwiftUI
import WebKit

@MainActor private enum BIMPreviewCache {static let images:NSCache<NSString,UIImage>={let c=NSCache<NSString,UIImage>();c.totalCostLimit=16*1024*1024;return c}()}
struct BIMBuildingThumbnail:View {
    let building:Building
    @EnvironmentObject private var account:AccountModel
    @Environment(\.colorScheme) private var scheme
    @State private var image:UIImage?
    @State private var preview:DocumentPreview?
    @State private var loading=false
    private var key:String {account.serverURL+"#\(account.user?.id ?? -1)#\(building.model_document_id ?? -1)#\(scheme == .dark ? "dark" : "light")"}
    var body:some View {
        ZStack {
            (scheme == .dark ? Color(red:0.07,green:0.13,blue:0.22) : Color(red:0.92,green:0.95,blue:0.99))
            if let image {Image(uiImage:image).resizable().scaledToFit()}
            else if let preview {BIMSnapshotWebView(url:preview.url,dark:scheme == .dark){value in
                image=value
                if let value {BIMPreviewCache.images.setObject(value,forKey:key as NSString,cost:(value.cgImage?.bytesPerRow ?? 1000)*(value.cgImage?.height ?? 300))}
                self.preview=nil;try? FileManager.default.removeItem(at:preview.url.deletingLastPathComponent());loading=false
            }}
            else if loading {ProgressView("BIM-Vorschau …").font(.caption)}
            else {VStack(spacing:8){Image(systemName:"cube.transparent").font(.system(size:36));Text(building.model_document_id == nil ? "Noch kein BIM-Modell" : "Modellvorschau nicht verfügbar").font(.caption)}.foregroundStyle(scheme == .dark ? Color(red:0.6,green:0.78,blue:1) : Color(red:0.09,green:0.28,blue:0.5))}
        }
        .task(id:key){image=nil;if let preview {try? FileManager.default.removeItem(at:preview.url.deletingLastPathComponent());self.preview=nil};guard let id=building.model_document_id else{return};if let cached=BIMPreviewCache.images.object(forKey:key as NSString){image=cached;return};loading=true
            do {let document=try await account.documents(buildingID:building.id).first{$0.id==id};guard let document,!Task.isCancelled else{loading=false;return};let item=try await account.previewDocument(document);if Task.isCancelled {try? FileManager.default.removeItem(at:item.url.deletingLastPathComponent());loading=false;return};preview=item} catch{loading=false}
        }
        .onDisappear{if let preview {try? FileManager.default.removeItem(at:preview.url.deletingLastPathComponent());self.preview=nil};loading=false}
        .accessibilityLabel(building.model_document_id == nil ? "Noch kein BIM-Modell hinterlegt" : "BIM-Vorschau von \(building.name)")
    }
}
private struct BIMSnapshotWebView:UIViewRepresentable {
    let url:URL;let dark:Bool;let done:(UIImage?) -> Void
    func makeCoordinator()->Coordinator {Coordinator(url:url,done:done)}
    func makeUIView(context:Context)->WKWebView {
        let config=WKWebViewConfiguration();config.websiteDataStore = .nonPersistent();config.setURLSchemeHandler(context.coordinator.assets,forURLScheme:"d21ifc");config.userContentController.add(context.coordinator,name:"ifcState")
        let web=WKWebView(frame:.zero,configuration:config);context.coordinator.web=web;web.navigationDelegate=context.coordinator.assets;web.isUserInteractionEnabled=false;web.scrollView.isScrollEnabled=false;web.load(URLRequest(url:URL(string:"d21ifc://viewer/index.html?preview=true&theme="+(dark ? "dark" : "light"))!));context.coordinator.deadline=Task{try? await Task.sleep(for:.seconds(25));if !Task.isCancelled {context.coordinator.finish(nil)}};return web
    }
    func updateUIView(_ web:WKWebView,context:Context){}
    static func dismantleUIView(_ web:WKWebView,coordinator:Coordinator){coordinator.deadline?.cancel();web.configuration.userContentController.removeScriptMessageHandler(forName:"ifcState");web.stopLoading();web.loadHTMLString("",baseURL:nil)}
    @MainActor final class Coordinator:NSObject,WKScriptMessageHandler {
        let assets:IFCWebView.Coordinator;let done:(UIImage?)->Void;weak var web:WKWebView?;var completed=false;var deadline:Task<Void,Never>?
        init(url:URL,done:@escaping(UIImage?)->Void){assets=IFCWebView.Coordinator(modelURL:url,account:nil,buildingID:nil,documentID:nil);self.done=done}
        func finish(_ image:UIImage?){guard !completed else{return};completed=true;deadline?.cancel();done(image)}
        func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){guard message.frameInfo.isMainFrame,let value=message.body as? String else{return};if value.hasPrefix("error:"){finish(nil)}else if value.hasPrefix("ready:"){Task{try? await Task.sleep(for:.milliseconds(180));guard !Task.isCancelled,let web=self.web,!self.completed else{return};web.takeSnapshot(with:nil){image,_ in self.finish(image)}}}}
    }
}
