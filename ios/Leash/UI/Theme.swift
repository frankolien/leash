import SwiftUI

/// Two looks, both quiet. Light: Tether's warm off-white, a ground that deepens from #FAFAF9 to
/// #F1F0EE down the screen (sampled from its app), with warm grey cards and pills and true black
/// ink. Dark: the web dashboard's
/// near-black ground, #171717 cards, #242424 controls and white ink. Colour only where it means
/// something. `inverse` is what sits on an `text`-filled shape, like a primary pill's label.
enum Ink {
    static let ground = adaptive(0xF6F6F4, 0x0B0B0B)
    /// The ground's bottom edge, for bars pinned to the bottom so no seam shows.
    static let groundEnd = adaptive(0xF1F0EE, 0x0B0B0B)
    static let surface = adaptive(0xEDECE9, 0x171717)
    static let raised = adaptive(0xE7E6E2, 0x242424)
    static let edge = adaptive(0xDCDBD6, 0x2B2B2B)
    static let line = adaptive(0xE4E3DF, 0x222222)
    static let text = adaptive(0x000000, 0xFFFFFF)
    static let inverse = adaptive(0xFFFFFF, 0x000000)
    static let muted = adaptive(0x7B7B7B, 0x858585)
    static let faint = adaptive(0xA6A6A6, 0x5E5E5E)
    static let disc = adaptive(0xDDDCD7, 0x3A3A3A)
    static let danger = adaptive(0xE5484D, 0xF2726B)
    static let good = adaptive(0x1F9D55, 0x6AD09D)

    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

/// Behind every screen: Tether's gradient in light, flat near-black in dark.
struct Ground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        if scheme == .dark {
            Color(hex: 0x0B0B0B)
        } else {
            LinearGradient(colors: [Color(hex: 0xFAFAF9), Color(hex: 0xF1F0EE)], startPoint: .top, endPoint: .bottom)
        }
    }
}

extension View {
    func groundBackground() -> some View { background { Ground().ignoresSafeArea() } }
}

/// The owner's choice in Settings. System follows the phone.
enum Appearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var scheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
    var label: String { rawValue.capitalized }
    var style: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
    }
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
                case .light: Capsule().fill(Ink.inverse)
                case .glass: Capsule().fill(.ultraThinMaterial).environment(\.colorScheme, .dark)
                }
            }
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var foreground: Color {
        switch kind {
        case .primary: Ink.inverse
        case .glass: .white
        case .light: Ink.text
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

/// The balance numeral, bold and tight like PayBox's. The cents sit smaller and grey, the way a
/// bank's app sets them, so the dollars read first.
struct BigAmount: View {
    let units: Units
    var size: CGFloat = 50
    var hidden = false
    /// Home's centred balance: a light-weight figure between a faint dollar sign and faint cents.
    var display = false
    var body: some View {
        let text = Money.usd(units)
        let cut = text.lastIndex(of: ".") ?? text.endIndex
        let start = text.hasPrefix("$") ? text.index(after: text.startIndex) : text.startIndex
        Group {
            if hidden {
                Text("$••••")
            } else if display {
                Text("$ ").font(.system(size: size * 0.55, weight: .regular)).foregroundColor(Ink.muted)
                    + Text(text[start..<cut])
                    + Text(text[cut...]).font(.system(size: size * 0.6, weight: .regular)).foregroundColor(Ink.faint)
            } else {
                Text(text[..<cut]) + Text(text[cut...]).font(.system(size: size * 0.62, weight: .semibold)).foregroundColor(Ink.faint)
            }
        }
        .font(.system(size: size, weight: display ? .regular : .bold)).tracking(display ? -size * 0.02 : -size * 0.035)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .contentTransition(.numericText())
    }
}

/// Who an activity line is about: the agent's mark, or the Leash mark for the owner.
struct Avatar: View {
    let actor: FeedLine.Actor
    var size: CGFloat = 46

    var body: some View {
        switch actor {
        case .agent(let name): AgentMark(name: name, size: size)
        case .owner:
            ZStack {
                Circle().fill(Ink.raised)
                Image("mark").resizable().renderingMode(.template).foregroundStyle(Ink.text).frame(width: size * 0.42, height: size * 0.42)
            }
            .frame(width: size, height: size)
        }
    }
}

/// A screen section's heading, with an optional link on the right.
struct SectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 20, weight: .semibold)).tracking(-0.4)
            Spacer()
            trailing.font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.muted)
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(title: String) { self.init(title: title) { EmptyView() } }
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
            Text(notice.text).font(.subheadline.weight(.medium)).foregroundStyle(Ink.inverse).lineLimit(3)
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .background(Capsule().fill(Ink.text))
        .padding(.horizontal, 16)
    }
}
