import SwiftUI
import WebKit
struct PlacementGeometry:Codable {let center:[Double];let outline:[[Double]]}
struct PlacementProbe:UIViewRepresentable {
 let url:URL;let done:(PlacementGeometry?)->Void
 func makeCoordinator()->Coordinator{Coordinator(url:url,done:done)}
 func makeUIView(context:Context)->WKWebView{let c=WKWebViewConfiguration();c.websiteDataStore = .nonPersistent();c.setURLSchemeHandler(context.coordinator.assets,forURLScheme:"d21ifc");for n in ["ifcState","ifcPlacement"]{c.userContentController.add(context.coordinator,name:n)};let w=WKWebView(frame:.zero,configuration:c);w.navigationDelegate=context.coordinator.assets;w.load(URLRequest(url:URL(string:"d21ifc://viewer/index.html?placement=true")!));context.coordinator.deadline=Task{try? await Task.sleep(for:.seconds(30));if !Task.isCancelled{context.coordinator.finish(nil)}};return w}
 func updateUIView(_ view:WKWebView,context:Context){}
 static func dismantleUIView(_ view:WKWebView,coordinator:Coordinator){coordinator.deadline?.cancel();for n in ["ifcState","ifcPlacement"]{view.configuration.userContentController.removeScriptMessageHandler(forName:n)};view.stopLoading()}
 @MainActor final class Coordinator:NSObject,WKScriptMessageHandler {
 let assets:IFCWebView.Coordinator;let done:(PlacementGeometry?)->Void;var completed=false;var deadline:Task<Void,Never>?
 init(url:URL,done:@escaping(PlacementGeometry?)->Void){assets=IFCWebView.Coordinator(modelURL:url,account:nil,buildingID:nil,documentID:nil);self.done=done}
 func finish(_ value:PlacementGeometry?){guard !completed else{return};completed=true;deadline?.cancel();done(value)}
 func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){guard message.frameInfo.isMainFrame else{return};if message.name=="ifcPlacement",let data=try? JSONSerialization.data(withJSONObject:message.body),let geometry=try? JSONDecoder().decode(PlacementGeometry.self,from:data){finish(geometry)}else if let text=message.body as? String,text.hasPrefix("error:"){finish(nil)}}
 }
}
