import SwiftUI

enum AppTheme: String, Codable, CaseIterable, Identifiable {
    case system, light, dark
    var id: Self { self }
    var title: String {
        switch self { case .system: "System"; case .light: "Hell"; case .dark: "Dunkel" }
    }
    var colorScheme: ColorScheme? {
        switch self { case .system: nil; case .light: .light; case .dark: .dark }
    }
}

enum AppFontScale: Int, Codable, CaseIterable, Identifiable {
    case small = 90, standard = 100, large = 115, largest = 130
    var id: Self { self }
    var title: String {
        switch self { case .small: "Klein"; case .standard: "Standard"; case .large: "Groß"; case .largest: "Sehr groß" }
    }

    func applying(to system: DynamicTypeSize) -> DynamicTypeSize {
        let sizes: [DynamicTypeSize] = [.xSmall, .small, .medium, .large, .xLarge, .xxLarge, .xxxLarge,
                                        .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5]
        guard let index = sizes.firstIndex(of: system) else { return system }
        let step: Int = switch self { case .small: -1; case .standard: 0; case .large: 1; case .largest: 2 }
        let minimum = system.isAccessibilitySize ? sizes.firstIndex(where: \.isAccessibilitySize) ?? index : 0
        return sizes[min(max(index + step, minimum), sizes.count - 1)]
    }
}

struct AppAppearance: Codable {
    var theme: AppTheme = .system
    var scale: AppFontScale = .standard
    var pendingRevision: Int? = nil
}
