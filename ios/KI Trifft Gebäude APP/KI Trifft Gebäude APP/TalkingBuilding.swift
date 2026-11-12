import SwiftUI

/// A friendly animated building character for the voice conversation.
/// Mouth, windows and bounce follow the real playback/microphone level passed in;
/// while waiting for the server it only "thinks" (no fake speech). Reduce Motion keeps it still.
struct TalkingBuilding: View {
    let mode: VoiceOrb.Mode
    let level: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let live = mode == .speaking || mode == .listening ? min(1, max(0, level)) : 0
            let bob = reduceMotion ? 0 : sin(t * (mode == .idle ? 1.6 : 2.4)) * (mode == .idle ? 3 : 4)
            let squash = reduceMotion ? 1 : 1 + (mode == .speaking ? live * 0.06 : 0)
            let blinking = !reduceMotion && t.truncatingRemainder(dividingBy: 4.2) < 0.14
            ZStack {
                // Ground shadow
                Ellipse().fill(.black.opacity(scheme == .dark ? 0.35 : 0.12))
                    .frame(width: 150 - bob * 3, height: 18).offset(y: 128).blur(radius: 4)
                // Listening ripples around the building (real mic level only)
                if mode == .listening && !reduceMotion {
                    ForEach(0..<2) { i in
                        let p = (t * 0.7 + Double(i) / 2).truncatingRemainder(dividingBy: 1)
                        RoundedRectangle(cornerRadius: 40, style: .continuous)
                            .stroke(d21Accent.opacity((1 - p) * 0.35 * (0.25 + live)), lineWidth: 2)
                            .frame(width: 180 + p * 60, height: 220 + p * 60)
                    }
                }
                character(t: t, live: live, blinking: blinking)
                    .scaleEffect(x: 2 - squash, y: squash, anchor: .bottom)
                    .offset(y: -bob)
                if mode == .waiting { thoughtBubble(t: t).offset(x: 92, y: -118 - bob) }
                if mode == .speaking { soundWaves(t: t, live: live).offset(x: 112, y: 20 - bob) }
            }
            .frame(width: 280, height: 290)
        }
    }

    private func character(t: Double, live: Double, blinking: Bool) -> some View {
        ZStack(alignment: .top) {
            // Antenna with status light
            VStack(spacing: 0) {
                Circle().fill(mode == .idle ? Color.gray.opacity(0.5) : (Int(t * 2) % 2 == 0 || reduceMotion ? Color.red : Color.red.opacity(0.35)))
                    .frame(width: 12, height: 12).shadow(color: .red.opacity(mode == .idle ? 0 : 0.6), radius: 6)
                Rectangle().fill(Color.gray.opacity(0.6)).frame(width: 3, height: 20)
            }.offset(y: -30)
            // Body
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(LinearGradient(colors: [Color(red: 0.16, green: 0.62, blue: 0.66), Color(red: 0.09, green: 0.36, blue: 0.55)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(LinearGradient(colors: [.white.opacity(0.25), .clear], startPoint: .top, endPoint: .center)))
                .frame(width: 170, height: 210)
                .shadow(color: d21Accent.opacity(0.35), radius: 18, y: 10)
            VStack(spacing: 14) {
                windows(t: t, live: live)
                face(t: t, live: live, blinking: blinking)
                // Door
                UnevenRoundedRectangle(topLeadingRadius: 14, topTrailingRadius: 14)
                    .fill(Color(red: 0.05, green: 0.2, blue: 0.32).opacity(0.85))
                    .frame(width: 38, height: 30)
                    .overlay(Circle().fill(.yellow.opacity(0.8)).frame(width: 4, height: 4).offset(x: 9))
            }.padding(.top, 20)
        }
        .frame(width: 170, height: 210, alignment: .top)
    }

    private func windows(t: Double, live: Double) -> some View {
        let lit: Int = {
            switch mode {
            case .idle: return 2
            case .waiting: return Int(t * 3) % 6 + 1
            case .listening: return max(1, Int((live * 6).rounded()))
            case .speaking: return 6
            }
        }()
        return LazyVGrid(columns: Array(repeating: GridItem(.fixed(30), spacing: 12), count: 3), spacing: 8) {
            ForEach(0..<6, id: \.self) { i in
                let on = i < lit
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(on ? Color.yellow.opacity(mode == .speaking ? 0.55 + live * 0.45 : 0.85) : Color.white.opacity(0.18))
                    .frame(width: 30, height: 18)
                    .shadow(color: on ? .yellow.opacity(0.5) : .clear, radius: 5)
            }
        }.frame(width: 126)
    }

    private func face(t: Double, live: Double, blinking: Bool) -> some View {
        let look: CGSize = mode == .waiting ? CGSize(width: 3, height: -3) : (reduceMotion ? .zero : CGSize(width: sin(t * 0.7) * 2, height: 0))
        return VStack(spacing: 8) {
            HStack(spacing: 26) {
                ForEach(0..<2, id: \.self) { _ in
                    ZStack {
                        Ellipse().fill(.white).frame(width: 26, height: blinking ? 3 : 28)
                        if !blinking { Circle().fill(Color(red: 0.06, green: 0.14, blue: 0.24)).frame(width: 13, height: 13).offset(look)
                            Circle().fill(.white).frame(width: 4, height: 4).offset(x: look.width + 3, y: look.height - 3) }
                    }
                }
            }
            HStack(spacing: 72) { Circle().fill(.pink.opacity(0.45)).frame(width: 14, height: 9); Circle().fill(.pink.opacity(0.45)).frame(width: 14, height: 9) }
                .offset(y: -10)
            mouth(live: live).offset(y: -14)
        }
    }

    @ViewBuilder private func mouth(live: Double) -> some View {
        switch mode {
        case .speaking:
            Capsule().fill(Color(red: 0.35, green: 0.05, blue: 0.12))
                .overlay(alignment: .bottom) { Capsule().fill(.pink.opacity(0.8)).frame(width: 18, height: 6).padding(.bottom, 2) }
                .frame(width: 30 + live * 8, height: 6 + live * 26)
        case .listening:
            Circle().fill(Color(red: 0.35, green: 0.05, blue: 0.12)).frame(width: 12, height: 12)
        case .waiting:
            Capsule().fill(Color(red: 0.06, green: 0.14, blue: 0.24)).frame(width: 22, height: 4)
        case .idle:
            Smile().stroke(Color(red: 0.06, green: 0.14, blue: 0.24), style: StrokeStyle(lineWidth: 4, lineCap: .round)).frame(width: 36, height: 14)
        }
    }

    private func thoughtBubble(t: Double) -> some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Circle().fill(Color.secondary).frame(width: 8, height: 8)
                    .opacity(reduceMotion ? 1 : 0.35 + 0.65 * max(0, sin(t * 4 - Double(i) * 0.8)))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.regularMaterial, in: Capsule())
    }

    private func soundWaves(t: Double, live: Double) -> some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                Arc().stroke(d21Accent.opacity(0.25 + live * 0.6 - Double(i) * 0.15), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: 18 + Double(i) * 14, height: 30 + Double(i) * 18)
                    .scaleEffect(reduceMotion ? 1 : 1 + live * 0.15)
            }
        }
    }
}

private struct Smile: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path(); p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY), control: CGPoint(x: rect.midX, y: rect.maxY * 1.6)); return p
    }
}

private struct Arc: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path(); p.addArc(center: CGPoint(x: rect.minX, y: rect.midY), radius: rect.width, startAngle: .degrees(-40), endAngle: .degrees(40), clockwise: false); return p
    }
}
