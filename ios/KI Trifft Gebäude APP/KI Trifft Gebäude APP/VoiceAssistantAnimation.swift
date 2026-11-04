import SwiftUI

// Wave geometry adapted from Michele Volpato's SpeechWaveAnimation (MIT).
// Full attribution and license: ThirdPartyNotices.txt.
private struct AssistantWave: Shape {
    var phase: Double
    var amplitude: Double
    var animatableData: AnimatablePair<Double,Double> {
        get { AnimatablePair(phase, amplitude) }
        set { phase = newValue.first; amplitude = newValue.second }
    }
    func path(in rect: CGRect) -> Path {
        var result = Path()
        guard rect.width > 0 else { return result }
        let middle = rect.width / 2
        for x in stride(from: 0.0, through: rect.width, by: 1.5) {
            let envelope = 1 - pow((x - middle) / middle, 2)
            let y = rect.midY + envelope * rect.height / 2 * amplitude * sin(2 * .pi * 1.5 * x / rect.width + phase)
            if x == 0 { result.move(to: CGPoint(x:x, y:y)) } else { result.addLine(to: CGPoint(x:x, y:y)) }
        }
        return result
    }
}
struct VoiceAssistantAnimation: View {
    let active: Bool
    let speaking: Bool
    let level: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !active || reduceMotion)) { context in
            let time = reduceMotion || !active ? 0 : context.date.timeIntervalSinceReferenceDate
            let amplitude = !active || reduceMotion ? 0.08 : speaking ? 0.3 + 0.12 * sin(time * 4) : 0.06 + level * 0.6
            ZStack {
                Circle().fill(RadialGradient(colors: [d21Accent.opacity(0.18), Color.cyan.opacity(0.04), .clear], center: .center, startRadius: 12, endRadius: 110)).frame(width: 220, height: 220)
                Circle().stroke(d21Accent.opacity(0.14), lineWidth: 1).frame(width: 156, height: 156)
                ForEach(0..<5) { index in
                    AssistantWave(phase: time * (speaking ? 4 : 2) + Double(index) * 0.7, amplitude: amplitude * (1 - Double(index) * 0.13))
                        .stroke(d21Accent.opacity(1 - Double(index) * 0.17), style: StrokeStyle(lineWidth: index == 0 ? 2.8 : 1.2, lineCap: .round))
                        .frame(width: 190, height: 120)
                }
            }.frame(maxWidth: .infinity)
        }
    }
}
