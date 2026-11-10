import SwiftUI
struct PrivacyNoticeView: View {
    private var notice: String {
        Bundle.main.url(forResource: "PrivacyNotice", withExtension: "txt").flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? "Datenschutzhinweise konnten nicht geladen werden. Support: felix.doering@stud.h-da.de"
    }
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 18) {
            Text(notice).textSelection(.enabled)
            Link("Support kontaktieren", destination: URL(string: "mailto:felix.doering@stud.h-da.de")!)
        }.padding() }.navigationTitle("Datenschutz und Support").navigationBarTitleDisplayMode(.inline)
    }
}
