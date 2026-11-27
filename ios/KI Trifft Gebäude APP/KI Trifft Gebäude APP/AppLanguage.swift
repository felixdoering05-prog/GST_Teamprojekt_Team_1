import Combine
import SwiftUI

/// Sprache der App (Deutsch / Englisch), wie in der Web-App (#257).
///
/// Die Texte stehen im String Catalog `Localizable.xcstrings` (Quelle Deutsch,
/// Übersetzung Englisch). Die Wahl gilt pro Konto (`language` in
/// `profile/ui`) und wird zusätzlich auf dem iPhone gemerkt:
/// - sofort über die SwiftUI-Umgebung (`\.locale`) für alle Oberflächentexte,
/// - ab dem nächsten Start auch für Systemtexte über `AppleLanguages`.
/// Ohne Kontoeinstellung bleibt die Sprache des iPhones maßgeblich.
@MainActor final class AppLanguage: ObservableObject {
    static let shared = AppLanguage()
    static let options: [(code: String, label: String)] = [("de", "Deutsch"), ("en", "English")]
    private static let key = "nala-language"

    /// `de`, `en` oder `nil` (Gerätesprache).
    @Published private(set) var code: String? = UserDefaults.standard.string(forKey: key)

    /// Tatsächlich angezeigte Sprache, auch wenn nichts gewählt wurde.
    var effective: String {
        if let code { return code }
        return Locale.preferredLanguages.first?.hasPrefix("de") == true ? "de" : "en"
    }

    /// Locale für die SwiftUI-Umgebung; ohne Wahl die des Geräts.
    var locale: Locale { code.map { Locale(identifier: $0 == "en" ? "en" : "de_DE") } ?? .autoupdatingCurrent }

    /// Übernimmt eine Sprache vom Konto oder aus den Einstellungen.
    func apply(_ next: String?) {
        guard next == nil || next == "de" || next == "en", next != code else { return }
        code = next
        let defaults = UserDefaults.standard
        if let next {
            defaults.set(next, forKey: Self.key)
            defaults.set([next], forKey: "AppleLanguages")
        } else {
            defaults.removeObject(forKey: Self.key)
            defaults.removeObject(forKey: "AppleLanguages")
        }
    }
}

/// Auswahl im Profil. Speichert ins Konto, damit Web und iPhone dieselbe Sprache nutzen.
struct AppLanguagePicker: View {
    @ObservedObject var account: AccountModel
    @ObservedObject private var language = AppLanguage.shared
    @State private var saving = false

    var body: some View {
        Picker(selection: Binding(get: { language.effective }, set: { next in
            Task { saving = true; defer { saving = false }; await account.saveLanguage(next) }
        })) {
            ForEach(AppLanguage.options, id: \.code) { option in Text(verbatim: option.label).tag(option.code) }
        } label: {
            Label("Sprache", systemImage: "globe")
        }
        .disabled(saving)
    }
}

/// Übersetzt Texte, die als `String` weitergereicht werden (Hinweise, Titel in
/// Hilfsfunktionen). Das Literal landet automatisch im String Catalog und wird
/// in der gewählten App-Sprache aufgelöst, auch ohne Neustart.
func tr(_ resource: LocalizedStringResource) -> String {
    var resource = resource
    if let code = UserDefaults.standard.string(forKey: "nala-language") {
        resource.locale = Locale(identifier: code == "en" ? "en" : "de_DE")
    }
    return String(localized: resource)
}
