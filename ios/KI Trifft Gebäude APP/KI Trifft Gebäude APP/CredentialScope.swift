import Foundation
/// Security boundary: normalized HTTPS scheme, host and effective port.
enum CredentialScope {
 static func origin(_ raw:String)->String? {
  let text=raw.trimmingCharacters(in:.whitespacesAndNewlines)
  guard var parts=URLComponents(string:text),parts.scheme?.lowercased()=="https",let url=parts.url,let host=url.host,!host.isEmpty,parts.user==nil,parts.password==nil,parts.query==nil,parts.fragment==nil,(parts.path.isEmpty || parts.path=="/"),parts.port.map({$0>0 && $0<=65535}) ?? true else{return nil}
  parts.scheme="https";parts.host=host.lowercased();parts.path="";if parts.port==443{parts.port=nil};return parts.string
 }
 static func key(_ kind:String,origin:String)->String {kind+"@"+origin}
 static func permits(tokenOrigin:String?,destination:String)->Bool {guard let bound=tokenOrigin,let a=origin(bound),let b=origin(destination) else{return false};return a==b}
}

extension CredentialScope {
 static func authorize(_ request: inout URLRequest, origin boundOrigin: String, username: String?, password: String?, token: String?, tokenOrigin: String?) {
  // One shared boundary for JSON and binary uploads/downloads.
  request.setValue(nil, forHTTPHeaderField: "Authorization")
  request.setValue(nil, forHTTPHeaderField: "X-D21-Session")
  guard let url = request.url, var target = URLComponents(url: url, resolvingAgainstBaseURL: false),
        target.user == nil, target.password == nil else { return }
  target.path = ""; target.query = nil; target.fragment = nil
  guard let destination = target.string, permits(tokenOrigin: boundOrigin, destination: destination) else { return }
  if let username, !username.isEmpty, let password {
   request.setValue("Basic " + Data("\(username):\(password)".utf8).base64EncodedString(), forHTTPHeaderField: "Authorization")
  }
  if let token, permits(tokenOrigin: tokenOrigin, destination: destination) { request.setValue(token, forHTTPHeaderField: "X-D21-Session") }
 }
}
