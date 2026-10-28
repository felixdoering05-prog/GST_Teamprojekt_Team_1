import SwiftUI

@main struct MyApp: App {
    // App-scoped state: shown once per process, never on a normal foreground return.
    @State private var showingIntro = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some Scene {
        WindowGroup {
            ZStack {
                if showingIntro {
                    LaunchIntroView()
                        .transition(.opacity)
                        .zIndex(1)
                } else {
                    ContentView()
                        .transition(.opacity)
                }
            }
            .task {
                guard showingIntro else { return }
                #if DEBUG
                // Allows a stable screenshot of the intro without changing release behavior.
                if ProcessInfo.processInfo.arguments.contains("-D21SplashPreview") { return }
                #endif
                do { try await Task.sleep(for: .milliseconds(1800)) }
                catch { return }
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) {
                    showingIntro = false
                }
            }
        }
    }
}

struct LaunchIntroView: View {
    private let ink = Color(red: 0.07, green: 0.17, blue: 0.29)
    private let accent = Color(red: 0.07, green: 0.49, blue: 0.51)

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                Spacer(minLength: 28)
                VStack(spacing: 30) {
                    Text("GST TEAMPROJEKT")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .tracking(2.5)
                        .foregroundStyle(accent)
                    Image("ProjectLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 330)
                        .accessibilityLabel("Projektlogo")
                    RoundedRectangle(cornerRadius: 2)
                        .fill(accent)
                        .frame(width: 44, height: 3)
                    Text("KI trifft Gebäude")
                        .font(.system(.title2, design: .rounded, weight: .semibold))
                        .foregroundStyle(ink)
                }
                .frame(maxWidth: 430)
                Spacer(minLength: 28)
                VStack(spacing: 6) {
                    Text("Ein Projekt der")
                        .font(.subheadline)
                        .foregroundStyle(ink.opacity(0.65))
                    Text("Hochschule Darmstadt")
                        .font(.headline)
                        .foregroundStyle(ink)
                }
                .multilineTextAlignment(.center)
                .padding(.bottom, max(28, geometry.size.height * 0.055))
            }
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white.ignoresSafeArea())
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview("Startbildschirm") {
    LaunchIntroView()
}
