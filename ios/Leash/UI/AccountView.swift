import CoreImage.CIFilterBuiltins
import SafariServices
import SwiftUI
import UserNotifications

/// The account this phone runs: its money, what this iPhone may do, every key on the account, alerts,
/// and the way out.
struct AccountView: View {
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav
    @State private var confirmUnlink = false
    @State private var alerts: UNAuthorizationStatus?
    @State private var keys: [(publicKey: String, permission: KeyPermission)]?
    @AppStorage("leash.appearance") private var appearance: Appearance = .system
    @State private var copied = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let s = model.snapshot, let linked = model.linked {
                    VStack(alignment: .leading, spacing: 30) {
                        account(s, linked)
                        thisPhone
                        keyList(s)
                        alertsRow
                        appearanceRow
                        unlink
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)
                }
            }
            .scrollIndicators(.hidden)
            .background(Ink.ground)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { nav.sheet = nil }.fontWeight(.semibold) } }
            .task {
                await readAlerts()
                keys = await model.accountKeys()
            }
        }
        .presentationDragIndicator(.visible)
        .sensoryFeedback(.success, trigger: copied)
    }

    private func account(_ s: Snapshot, _ linked: LinkedAccount) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 14) {
                Avatar(actor: .owner, size: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text(shortAccount(linked.account)).font(.system(size: 20, weight: .bold)).lineLimit(1).truncationMode(.middle)
                    Text("NEAR \(linked.network.rawValue)").font(.system(size: 14)).foregroundStyle(Ink.muted)
                }
                Spacer()
                Button {
                    UIPasteboard.general.string = linked.account
                    copied.toggle()
                } label: { RoundIcon(system: "doc.on.doc", size: 40) }
                .accessibilityLabel("Copy account name")
            }
            HStack(spacing: 10) {
                balance("In the vault", s.vault)
                balance("In your account", s.held)
            }
            HStack(spacing: 10) {
                Button("Add to vault") { nav.sheet = .topUp }.buttonStyle(.pill(.secondary))
                Button("Withdraw") { nav.sheet = .withdraw }.buttonStyle(.pill(.secondary))
            }
        }
    }

    private func balance(_ label: String, _ amount: Units) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 13)).foregroundStyle(Ink.muted)
            Text(Money.usd(amount)).font(.system(size: 20, weight: .bold)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.surface))
    }

    private var thisPhone: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "This iPhone")
            VStack(alignment: .leading, spacing: 12) {
                can("Approves and denies, with Face ID")
                can("Pauses every agent, even from the lock screen")
                if model.ownerKey != nil { can("Tops up, withdraws and adds agents, with Face ID") }
            }
            Text("Pairing code \(model.pairingCode)").font(.system(size: 13)).foregroundStyle(Ink.faint)
        }
    }

    private func can(_ text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.good)
            Text(text).font(.system(size: 15))
        }
    }

    @ViewBuilder private func keyList(_ s: Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: "Keys on your account") { if let keys { Text("\(keys.count)") } }
            if let keys {
                // This iPhone's first, then the sign-in, then agents by name.
                let order = { (k: (publicKey: String, permission: KeyPermission)) -> String in
                    if model.phoneKeys.contains(k.publicKey) { return "0" }
                    if k.permission == .fullAccess { return "1" }
                    return "2" + (s.agent(k.publicKey)?.name ?? "~")
                }
                ForEach(keys.sorted { order($0) < order($1) }, id: \.publicKey) { k in
                    let d = describeKey(k.publicKey, k.permission, s)
                    HStack(spacing: 14) {
                        Group {
                            if let agent = d.agent { AgentMark(name: agent, size: 42) }
                            else {
                                Image(systemName: d.symbol).font(.system(size: 16)).foregroundStyle(Ink.text)
                                    .frame(width: 42, height: 42).background(Circle().fill(Ink.surface))
                            }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(d.title).font(.system(size: 16, weight: .semibold))
                            Text(d.detail).font(.system(size: 13)).foregroundStyle(Ink.muted).lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Text(String(k.publicKey.dropFirst(8).prefix(6)) + "…").font(.system(size: 13, design: .monospaced)).foregroundStyle(Ink.faint)
                    }
                    .padding(.vertical, 6)
                }
            } else {
                ProgressView().tint(Ink.muted).frame(maxWidth: .infinity).padding(.vertical, 20)
            }
        }
    }

    private func describeKey(_ key: String, _ permission: KeyPermission, _ s: Snapshot) -> (title: String, detail: String, symbol: String, agent: String?) {
        let mine = model.phoneKeys.contains(key)
        switch permission {
        case .fullAccess:
            return mine ? ("This iPhone", "Full key, behind Face ID", "iphone", nil) : ("Your sign-in", "Full key, held by Google, Apple or your passkey", "person.badge.key", nil)
        case .functionCall(_, let methods, _):
            if let a = s.agent(key) { return (a.name, a.policy.active ? "Pays through Leash" : "Revoked on Leash", "", a.name) }
            if mine { return ("This iPhone", methods.contains("approve") ? "Decides what agents ask for" : "The brake: pause and deny", methods.contains("approve") ? "checkmark.shield" : "pause.circle", nil) }
            if methods.contains("approve") { return ("Another phone", "Decides what agents ask for", "iphone", nil) }
            if methods.sorted() == ["deny", "pause"] { return ("Another phone", "The brake: pause and deny", "pause.circle", nil) }
            return ("Limited key", methods.joined(separator: ", "), "key", nil)
        }
    }

    private var alertsRow: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Alerts")
            HStack(spacing: 14) {
                Image(systemName: "bell.badge").font(.system(size: 16)).frame(width: 42, height: 42).background(Circle().fill(Ink.surface))
                VStack(alignment: .leading, spacing: 2) {
                    Text("When an agent waits on you").font(.system(size: 16, weight: .semibold))
                    Text(alerts == .authorized ? "On" : alerts == .denied ? "Off in Settings" : "Not asked yet").font(.system(size: 13)).foregroundStyle(Ink.muted)
                }
                Spacer()
                if alerts != .authorized {
                    Button("Turn on") {
                        Task {
                            if alerts == .denied { await UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
                            else { await Alerts.shared.requestPermission(); await readAlerts() }
                        }
                    }
                    .buttonStyle(.pill(.primary, compact: true))
                }
            }
        }
    }

    private var appearanceRow: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Appearance")
            HStack(spacing: 4) {
                ForEach(Appearance.allCases) { option in
                    Button { withAnimation(.snappy) { appearance = option } } label: {
                        Text(option.label).font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(appearance == option ? Ink.inverse : Ink.muted)
                            .frame(maxWidth: .infinity).frame(height: 38)
                            .background(Capsule().fill(appearance == option ? Ink.text : .clear))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
            .background(Capsule().fill(Ink.raised))
        }
    }

    private var unlink: some View {
        VStack(spacing: 8) {
            Button(role: .destructive) { confirmUnlink = true } label: {
                HStack(spacing: 8) {
                    if model.busy == "unlink" { ProgressView().tint(Ink.danger) }
                    Text("Unlink this iPhone")
                }
            }
            .buttonStyle(.pill(.danger))
            .disabled(model.busy != nil)
            Text(model.ownerKey != nil ? "Takes this iPhone's keys off your account, then forgets them here." : "Forgets the keys on this iPhone. Remove them from your account in Settings on the web.")
                .font(.system(size: 13)).foregroundStyle(Ink.faint).multilineTextAlignment(.center)
        }
        .padding(.top, 8)
        .confirmationDialog("Unlink this iPhone?", isPresented: $confirmUnlink, titleVisibility: .visible) {
            Button("Unlink", role: .destructive) { Task { await model.unlink() } }
        }
    }

    private func readAlerts() async {
        alerts = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }
}

/// Money between the account and the vault, both ways, like any deposit screen: the amount,
/// what is there to move, a keypad and Continue. A phone without its full key yet gets it on
/// Continue: one more sign-in, then the top up goes ahead.
struct MoveMoneySheet: View {
    enum Direction { case toVault, toAccount }
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav
    let direction: Direction
    @State private var entry = AmountEntry()
    @State private var working = false

    var body: some View {
        let available = (direction == .toVault ? model.snapshot?.held : model.snapshot?.vault) ?? 0
        let amount = entry.units
        let over = amount > available
        VStack(spacing: 0) {
            ZStack {
                Text(direction == .toVault ? "Top up" : "Withdraw").font(.system(size: 17, weight: .semibold))
                HStack {
                    Spacer()
                    Button { nav.sheet = nil } label: { RoundIcon(system: "xmark", size: 36) }.accessibilityLabel("Close")
                }
            }
            .padding(.top, 18)

            Spacer(minLength: 12)
            Text(entry.display)
                .font(.system(size: 64, weight: .bold)).tracking(-2)
                .foregroundStyle(entry.isEmpty ? Ink.faint : over ? Ink.danger : Ink.text)
                .monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.4)
                .contentTransition(.numericText())
                .animation(.snappy(duration: 0.15), value: entry.display)
                .modifier(Shake(amount: entry.rejected))
                .animation(.linear(duration: 0.3), value: entry.rejected)
            HStack(spacing: 8) {
                Text(over ? "More than you have" : "\(Money.usd(available)) \(direction == .toVault ? "in your account" : "in the vault")")
                    .foregroundStyle(over ? Ink.danger : Ink.muted)
                if available > 0 {
                    Button("Max") { entry = AmountEntry(units: available) }
                        .font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.text)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(Capsule().fill(Ink.surface))
                }
            }
            .font(.system(size: 15))
            .padding(.top, 10)
            Spacer(minLength: 12)

            Keypad { entry.press($0) }
                .padding(.bottom, 18)

            Button {
                working = true
                Task {
                    defer { working = false }
                    if direction == .toVault {
                        guard await model.ensureOwnerKey() else { return }
                        if await model.topUp(amount) { nav.sheet = nil }
                    } else if await model.withdraw(amount) {
                        nav.sheet = nil
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if working { ProgressView().tint(Ink.inverse) }
                    Text("Continue")
                }
            }
            .buttonStyle(.pill(.primary))
            .disabled(amount <= 0 || over || working)
            if let problem = model.linkProblem, direction == .toVault {
                Text(problem).font(.system(size: 13)).foregroundStyle(Ink.danger).padding(.top, 8)
            }
        }
        .padding(.horizontal, 20).padding(.bottom, 12)
        .background(Ink.ground)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .sensoryFeedback(.impact(weight: .light), trigger: entry.text)
        .sensoryFeedback(.error, trigger: entry.rejected)
    }
}

/// What has been typed, kept to an amount a person means: at most seven dollar digits and two
/// cents digits, one point, no leading zeros. A key past those limits shakes instead.
struct AmountEntry: Equatable {
    private(set) var text = ""
    private(set) var rejected = 0

    init() {}
    init(units: Units) {
        let cents = units / 10_000
        text = cents % 100 == 0 ? "\(cents / 100)" : String(format: "%lld.%02lld", cents / 100, cents % 100)
    }

    var isEmpty: Bool { text.isEmpty }
    var units: Units { Money.parse(text) ?? 0 }

    /// "$1,250.5" as typed, grouped; "$0" before anything.
    var display: String {
        guard !text.isEmpty else { return "$0" }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        let whole = Units(parts[0]).map { $0.formatted(.number.grouping(.automatic)) } ?? "0"
        return "$" + whole + (parts.count > 1 ? "." + parts[1] : "")
    }

    mutating func press(_ key: Keypad.Key) {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        switch key {
        case .delete:
            if text.isEmpty { rejected += 1 } else { text.removeLast() }
        case .point:
            if text.contains(".") { rejected += 1 } else { text = (text.isEmpty ? "0" : text) + "." }
        case .digit(let d):
            if parts.count == 2 {
                if parts[1].count >= 2 { rejected += 1 } else { text += "\(d)" }
            } else if text == "0" {
                text = "\(d)"
            } else if text.count >= 7 {
                rejected += 1
            } else {
                text += "\(d)"
            }
        }
    }
}

/// A phone keypad for amounts: digits, a point and delete, set large and bare.
struct Keypad: View {
    enum Key: Hashable { case digit(Int), point, delete }
    let press: (Key) -> Void

    var body: some View {
        let rows: [[Key]] = [[.digit(1), .digit(2), .digit(3)], [.digit(4), .digit(5), .digit(6)], [.digit(7), .digit(8), .digit(9)], [.point, .digit(0), .delete]]
        Grid(horizontalSpacing: 0, verticalSpacing: 4) {
            ForEach(rows, id: \.self) { row in
                GridRow {
                    ForEach(row, id: \.self) { key in
                        Button { press(key) } label: {
                            Group {
                                switch key {
                                case .digit(let d): Text("\(d)")
                                case .point: Text(".")
                                case .delete: Image(systemName: "delete.left").font(.system(size: 22, weight: .medium))
                                }
                            }
                            .font(.system(size: 30, weight: .medium))
                            .foregroundStyle(Ink.text)
                            .frame(maxWidth: .infinity, minHeight: 60)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(KeyStyle())
                        .accessibilityLabel({ if case .digit(let d) = key { return "\(d)" }; return key == .delete ? "Delete" : "Point" }())
                    }
                }
            }
        }
    }
}

/// A key lights a soft circle under the finger, as the phone's own keypad does.
private struct KeyStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Circle().fill(Ink.surface).frame(width: 64, height: 64).opacity(configuration.isPressed ? 1 : 0))
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// A quick side-to-side shake each time `amount` goes up.
struct Shake: GeometryEffect {
    var amount: Int
    var animatableData: CGFloat
    init(amount: Int) { self.amount = amount; animatableData = CGFloat(amount) }
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 8 * sin(animatableData * .pi * 4), y: 0))
    }
}

/// Where to send USDC: the account's own name, as text and as a QR code.
struct AddMoneySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav
    @State private var copied = false
    @State private var qr: UIImage?
    @State private var faucet = false

    var body: some View {
        let account = model.linked?.account ?? ""
        VStack(spacing: 20) {
            Text("Add money").font(.title2.bold()).padding(.top, 28)
            Text("Send USDC on NEAR to your account. Then move it into the vault, where your agents spend from.")
                .font(.subheadline).foregroundStyle(Ink.muted).multilineTextAlignment(.center).padding(.horizontal, 12)
            Group {
                if let qr {
                    Image(uiImage: qr).interpolation(.none).resizable().scaledToFit()
                } else {
                    ProgressView().tint(Ink.muted)
                }
            }
            .frame(width: 200, height: 200).padding(16)
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Ink.edge, lineWidth: 0.7))
            // Drawn once, away from the main thread: the screen redraws on every balance refresh.
            .task(id: account) { qr = await QR.render(account) }
            Button {
                UIPasteboard.general.string = account
                copied = true
            } label: {
                HStack(spacing: 8) {
                    Text(account).font(.headline).lineLimit(1).truncationMode(.middle)
                    Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.subheadline)
                }
            }
            .buttonStyle(.pill(.secondary, compact: true))
            Spacer()
            Button("Move it into the vault") { nav.sheet = .topUp }.buttonStyle(.pill(.primary))
            if model.linked?.network == .testnet {
                Button("Test USDC comes from Circle's faucet") { faucet = true }.font(.footnote).foregroundStyle(Ink.faint)
            }
        }
        .padding(20)
        .background(Ink.ground)
        .presentationDragIndicator(.visible)
        .sensoryFeedback(.success, trigger: copied)
        .sheet(isPresented: $faucet) { SafariView(url: URL(string: "https://faucet.circle.com")!).ignoresSafeArea() }
    }
}

/// A page from another site, opened over the app instead of out to Safari.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

enum QR {
    /// One renderer for the app; making a Core Image context is slow on a device.
    private static let context = CIContext()

    static func render(_ text: String) async -> UIImage? {
        await Task.detached(priority: .userInitiated) { image(text) }.value
    }

    static func image(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: .init(scaleX: 10, y: 10)),
              let cg = context.createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
