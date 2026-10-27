import SwiftUI

/// Plain black and white, like the web app: colour only where it means something (a brand mark,
/// a warning). Surfaces step up in grey; the one primary action on a screen is a white pill.
enum Ink {
    static let ground = Color.black
    static let surface = Color(white: 0.09)
    static let raised = Color(white: 0.14)
    static let line = Color(white: 0.17)
    static let text = Color.white
    static let muted = Color(white: 0.56)
    static let faint = Color(white: 0.36)
    static let danger = Color(red: 0.95, green: 0.45, blue: 0.42)
}

struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, glass, danger }
    var kind: Kind = .primary
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 15 : 17, weight: .semibold))
            .frame(maxWidth: compact ? nil : .infinity, minHeight: compact ? 40 : 54)
            .padding(.horizontal, compact ? 18 : 20)
            .foregroundStyle(kind == .primary ? Color.black : kind == .danger ? Ink.danger : Color.white)
            .background {
                switch kind {
                case .primary: Capsule().fill(Color.white)
                case .secondary, .danger: Capsule().fill(Ink.raised)
                case .glass: Capsule().fill(.ultraThinMaterial).environment(\.colorScheme, .dark)
                }
            }
            .opacity(configuration.isPressed ? 0.75 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    static var pill: PillButtonStyle { .init() }
    static func pill(_ kind: PillButtonStyle.Kind, compact: Bool = false) -> PillButtonStyle { .init(kind: kind, compact: compact) }
}

/// A round icon button, the kind PayBox and the web use for + and settings.
struct RoundIcon: View {
    let system: String
    var filled = false
    var body: some View {
        Image(systemName: system)
            .font(.system(size: 16, weight: .semibold))
            .frame(width: 42, height: 42)
            .foregroundStyle(filled ? Color.black : Color.white)
            .background(Circle().fill(filled ? Color.white : Ink.raised))
    }
}

struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Ink.surface))
    }
}

/// An agent's mark: the product's own logo when it is named after one, else its initial.
struct AgentMark: View {
    let name: String
    var size: CGFloat = 44
    var off = false

    static func brand(of name: String) -> String? {
        let n = name.lowercased()
        return ["claude", "codex", "cursor", "gemini", "copilot", "chatgpt"].first { n.contains($0) }
            ?? (n.contains("openai") || n.contains("gpt") ? "chatgpt" : nil)
    }

    var body: some View {
        ZStack {
            Circle().fill(Ink.raised)
            if let brand = Self.brand(of: name) {
                Image("brand-\(brand)").resizable().scaledToFit().foregroundStyle(.white).frame(width: size * 0.5, height: size * 0.5)
            } else {
                Text(name.prefix(1).uppercased()).font(.system(size: size * 0.4, weight: .semibold))
            }
        }
        .frame(width: size, height: size)
        .saturation(off ? 0 : 1)
        .opacity(off ? 0.5 : 1)
    }
}

/// A thin spent-of-limit bar.
struct Meter: View {
    let value: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Ink.line)
                Capsule().fill(Color.white).frame(width: max(value > 0 ? 4 : 0, geo.size.width * min(1, max(0, value))))
            }
        }
        .frame(height: 4)
    }
}

/// The balance numeral with small cents, like a bank app.
struct BigAmount: View {
    let units: Units
    var size: CGFloat = 52
    var body: some View {
        let text = Money.usd(units)
        let parts = text.split(separator: ".", maxSplits: 1)
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(parts[0]).font(.system(size: size, weight: .bold)).tracking(-1.5)
            if parts.count > 1 { Text("." + parts[1]).font(.system(size: size * 0.55, weight: .bold)).foregroundStyle(Ink.muted) }
        }
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.5)
    }
}

struct SectionTitle: View {
    let text: String
    var trailing: String? = nil
    var body: some View {
        HStack {
            Text(text).font(.system(size: 20, weight: .bold))
            Spacer()
            if let trailing { Text(trailing).font(.subheadline).foregroundStyle(Ink.muted) }
        }
    }
}

struct Toast: View {
    let notice: AppModel.Notice
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: notice.failed ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                .foregroundStyle(notice.failed ? Ink.danger : .white)
            Text(notice.text).font(.subheadline.weight(.medium)).lineLimit(3)
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .background(Capsule().fill(Ink.raised))
        .padding(.horizontal, 16)
    }
}
