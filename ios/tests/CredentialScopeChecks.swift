import Foundation
@main struct CredentialScopeChecks {
 static func main() {
  precondition(CredentialScope.origin(" HTTPS://EXAMPLE.COM:443/ ")=="https://example.com")
  precondition(CredentialScope.origin("https://example.com:8443")=="https://example.com:8443")
  for url in ["http://example.com","https://u:p@example.com","https://example.com/path","https://example.com?x=1","https://example.com#x","https://example.com:0"] { precondition(CredentialScope.origin(url)==nil) }
  precondition(CredentialScope.key("gateway",origin:"https://a.test") != CredentialScope.key("gateway",origin:"https://b.test"))
  for path in ["/api/v1/auth/me","/api/v1/buildings/1/documents"] {
   var good=URLRequest(url:URL(string:"https://EXAMPLE.COM:443"+path)!)
   CredentialScope.authorize(&good,origin:"https://example.com",username:"alice",password:"test-only",token:"session-a",tokenOrigin:"https://example.com")
   precondition(good.value(forHTTPHeaderField:"Authorization")=="Basic "+Data("alice:test-only".utf8).base64EncodedString())
   precondition(good.value(forHTTPHeaderField:"X-D21-Session")=="session-a")
   for host in ["https://other.test","https://example.com:8443","http://example.com"] {
    var wrong=URLRequest(url:URL(string:host+path)!)
    wrong.setValue("old",forHTTPHeaderField:"Authorization");wrong.setValue("old",forHTTPHeaderField:"X-D21-Session")
    CredentialScope.authorize(&wrong,origin:"https://example.com",username:"alice",password:"test-only",token:"session-a",tokenOrigin:"https://example.com")
    precondition(wrong.value(forHTTPHeaderField:"Authorization")==nil && wrong.value(forHTTPHeaderField:"X-D21-Session")==nil)
   }
   for bound in [nil,"https://other.test","https://example.com:8443"] as [String?] {
    var request=URLRequest(url:URL(string:"https://example.com"+path)!)
    CredentialScope.authorize(&request,origin:"https://example.com",username:nil,password:nil,token:"old-token",tokenOrigin:bound)
    precondition(request.value(forHTTPHeaderField:"X-D21-Session")==nil)
   }
  }
  print("Credential origin and JSON/file request-header isolation checks passed")
 }
}
