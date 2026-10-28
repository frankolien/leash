import SwiftUI

/// PayBox's restraint, measured from its app: a white ground, #F6F6F6 cards, #EBEBEB pills and
/// circles with a hairline edge. Ink is true black, not PayBox's #191919, which reads grey on a
/// phone. Colour only where it means something.
enum Ink {
    static let ground = Color.white
    static let surface = Color(hex: 0xF6F6F6)
    static let raised = Color(hex: 0xEBEBEB)
    static let edge = Color(hex: 0xDDDDDD)
    static let line = Color(hex: 0xE6E6E6)
    static let text = Color.black
    static let muted = Color(hex: 0x7B7B7B)
    static let faint = Color(hex: 0xA6A6A6)
    static let danger = Color(hex: 0xE5484D)
    static let good = Color(hex: 0x1F9D55)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
    }
}

struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, glass, light, danger }
    var kind: Kind = .primary
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 15 : 17, weight: .semibold))
            .frame(maxWidth: compact ? nil : .infinity, minHeight: compact ? 40 : 55)
            .padding(.horizontal, compact ? 18 : 16)
            .foregroundStyle(foreground)
            .background {
                switch kind {
                case .primary: Capsule().fill(Ink.text)
                case .secondary, .danger: Capsule().fill(Ink.raised)
                case .light: Capsule().fill(Color.white)
                case .glass: Capsule().fill(.ultraThinMaterial).environment(\.colorScheme, .dark)
                }
            }
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var foreground: Color {
        switch kind {
        case .primary, .glass: .white
        case .light: .black
        case .secondary: Ink.text
        case .danger: Ink.danger
        }
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    static var pill: PillButtonStyle { .init() }
    static func pill(_ kind: PillButtonStyle.Kind, compact: Bool = false) -> PillButtonStyle { .init(kind: kind, compact: compact) }
}

/// The 46pt grey circle PayBox uses for settings and +.
struct RoundIcon: View {
    let system: String
    var tint: Color = Ink.text
    var size: CGFloat = 46
    var body: some View {
        Image(systemName: system)
            .font(.system(size: size * 0.43, weight: .regular))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(Circle().fill(Ink.raised))
            .overlay(Circle().stroke(Ink.edge, lineWidth: 0.7))
    }
}

/// Large title over a grey status line, as on PayBox's list screens.
struct ScreenTitle<Trailing: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.system(size: 28, weight: .bold)).tracking(-0.8)
                Text(subtitle).font(.system(size: 15)).foregroundStyle(Ink.muted)
            }
            Spacer()
            trailing
        }
    }
}

struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Ink.surface))
    }
}

/// A row card: a 46pt circle, a title over a grey line, and whatever sits on the right.
struct RowCard<Leading: View, Trailing: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(spacing: 12) {
            leading
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 17, weight: .semibold)).lineLimit(1)
                Text(subtitle).font(.system(size: 14)).foregroundStyle(Ink.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 88)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Ink.surface))
        .contentShape(Rectangle())
    }
}

/// An agent's mark: the product's own logo when it is named after one, else its initial.
struct AgentMark: View {
    let name: String
    var size: CGFloat = 46
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
                Image("brand-\(brand)").resizable().scaledToFit().foregroundStyle(Ink.text).frame(width: size * 0.48, height: size * 0.48)
            } else {
                Text(name.prefix(1).uppercased()).font(.system(size: size * 0.4, weight: .semibold))
            }
        }
        .frame(width: size, height: size)
        .saturation(off ? 0 : 1)
        .opacity(off ? 0.45 : 1)
    }
}

/// A thin spent-of-limit bar.
struct Meter: View {
    let value: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Ink.raised)
                Capsule().fill(Ink.text).frame(width: max(value > 0 ? 4 : 0, geo.size.width * min(1, max(0, value))))
            }
        }
        .frame(height: 4)
    }
}

/// The balance numeral, bold and tight like PayBox's.
struct BigAmount: View {
    let units: Units
    var size: CGFloat = 50
    var hidden = false
    var body: some View {
        Text(hidden ? "$••••" : Money.usd(units))
            .font(.system(size: size, weight: .bold)).tracking(-size * 0.035)
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
            Text(text).font(.system(size: 19, weight: .semibold)).tracking(-0.3)
            Spacer()
            if let trailing { Text(trailing).font(.system(size: 14)).foregroundStyle(Ink.muted) }
        }
    }
}

struct Toast: View {
    let notice: AppModel.Notice
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: notice.failed ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                .foregroundStyle(notice.failed ? Ink.danger : Ink.good)
            Text(notice.text).font(.subheadline.weight(.medium)).foregroundStyle(.white).lineLimit(3)
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .background(Capsule().fill(Ink.text))
        .padding(.horizontal, 16)
    }
}
