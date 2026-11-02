import SwiftUI

/// Which tab is showing, and which sheet is open over it. Shared so a tapped alert, or a card on
/// one screen, can move the owner to the right place.
@MainActor
@Observable
final class Navigator {
    enum Screen: String, CaseIterable { case overview, agents, approvals }
    var screen: Screen
    var request: PayRequest?
    var ask: Proposal?
    var sheet: Sheet?

    enum Sheet: String, Identifiable { case topUp, withdraw, receive, connect, settings; var id: String { rawValue } }

    init() { screen = Screen(rawValue: UserDefaults.standard.string(forKey: "leash.tab") ?? "") ?? .overview }

    /// Opens the first thing waiting, as a sheet over whatever is on screen.
    func openWaiting(_ s: Snapshot) {
        if let r = s.requests.first { request = r } else if let p = s.proposals.first { ask = p }
    }
}

/// Home, laid out like the web dashboard on a phone: the account and its network on the left, Settings
/// on the right, the vault balance centred with how it moved, the chart, two actions, anything
/// waiting on the owner, then what happened lately. The brake lives on Agents.
struct OverviewView: View {
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav
    @AppStorage("leash.hideBalance") private var hidden = false
    @AppStorage("leash.chartDays") private var days = 7
    @State private var scrub: Date?

    var body: some View {
        let s = model.snapshot
        let history = s?.balanceHistory(days: days) ?? []
        let picked = scrub.flatMap { date in history.first { Calendar.current.isDate($0.day, inSameDayAs: date) } }
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    accountMenu
                    Spacer()
                    Button { nav.sheet = .settings } label: { RoundIcon(system: "gearshape") }.accessibilityLabel("Settings")
                }
                .padding(.top, 8)

                HStack(spacing: 8) {
                    Text(picked.map { Self.dayLabel($0.day) } ?? "Vault balance").font(.system(size: 16)).foregroundStyle(Ink.muted)
                        .contentTransition(.opacity)
                    if picked == nil {
                        Button { hidden.toggle() } label: {
                            Image(systemName: hidden ? "eye.slash" : "eye").font(.system(size: 15)).foregroundStyle(Ink.muted)
                        }
                        .accessibilityLabel(hidden ? "Show balance" : "Hide balance")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 34)
                BigAmount(units: picked?.balance ?? s?.vault ?? 0, size: 76, hidden: hidden && picked == nil, display: true)
                    .redacted(reason: s == nil ? .placeholder : [])
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                    .animation(.snappy(duration: 0.2), value: picked?.balance)
                change(history).frame(maxWidth: .infinity).padding(.top, 12)

                if history.count > 1 {
                    BalanceChart(points: history, selected: $scrub)
                        .frame(height: 170)
                        .padding(.top, 26)
                        .opacity(hidden ? 0 : 1)
                    rangeRow(history).padding(.top, 12)
                }

                HStack(spacing: 8) {
                    Button("Top up") { nav.sheet = .topUp }.buttonStyle(.pill(.primary))
                    Button("Receive USDC") { nav.sheet = .receive }.buttonStyle(.pill(.secondary))
                }
                .padding(.top, 24)

                if let s {
                    if s.paused { PausedCard().padding(.top, 20) }
                    if s.waiting > 0 { WaitingCard(snapshot: s) { nav.openWaiting(s) }.padding(.top, 20) }

                    SectionHeader(title: "Recent activity") {
                        if !s.log.isEmpty { NavigationLink("See all") { ActivityView() } }
                    }
                    .padding(.top, 34)
                    if s.log.isEmpty {
                        EmptyCard(system: "clock", title: "Nothing yet", line: "When an agent pays or asks, it shows up here.", action: s.activeAgents.isEmpty ? "Connect an agent" : nil) { nav.sheet = .connect }
                            .padding(.top, 14)
                    } else {
                        FeedList(feed: s.feed(limit: 8))
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.refresh() }
    }

    /// How the vault moved over the range shown, as a chip under the balance.
    @ViewBuilder private func change(_ history: [(day: Date, balance: Units)]) -> some View {
        if let first = history.first, let last = history.last, !hidden {
            let delta = last.balance - first.balance
            let range = days == 7 ? "this week" : "this month"
            HStack(spacing: 6) {
                if delta != 0 {
                    Image(systemName: delta > 0 ? "arrow.up.right" : "arrow.down.right").font(.system(size: 12, weight: .bold))
                        .foregroundStyle(delta > 0 ? Ink.good : Ink.muted)
                    Text(Money.usd(abs(delta))).fontWeight(.semibold).foregroundStyle(delta > 0 ? Ink.good : Ink.text)
                    Text(delta > 0 ? "added \(range)" : "out \(range)").foregroundStyle(Ink.muted)
                } else {
                    Text("No change \(range)").foregroundStyle(Ink.muted)
                }
            }
            .font(.system(size: 15))
            .monospacedDigit()
            .padding(.horizontal, 14).frame(height: 36)
            .background(Capsule().fill(Ink.surface))
        }
    }

    /// The range's first and last day either side of the 1W / 1M switch.
    private func rangeRow(_ history: [(day: Date, balance: Units)]) -> some View {
        HStack {
            Text(history.first.map { Self.edge($0.day) } ?? "").frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 4) {
                ForEach([(7, "1W"), (30, "1M")], id: \.0) { value, label in
                    Button { withAnimation(.snappy) { days = value } } label: {
                        Text(label).font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(days == value ? Ink.inverse : Ink.muted)
                            .frame(width: 50, height: 32)
                            .background(Capsule().fill(days == value ? Ink.text : .clear))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
            .background(Capsule().fill(Ink.surface))
            Text(history.last.map { Self.edge($0.day) } ?? "").frame(maxWidth: .infinity, alignment: .trailing)
        }
        .font(.system(size: 14))
        .foregroundStyle(Ink.muted)
    }

    static func edge(_ day: Date) -> String { day.formatted(.dateTime.day().month(.abbreviated)) }

    static func dayLabel(_ day: Date) -> String {
        Calendar.current.isDateInToday(day) ? "Now" : "End of " + day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    /// The account, with the network it is on. Tapping it picks the network.
    private var accountMenu: some View {
        Menu {
            Section("NEAR network") {
                let current = model.linked?.network ?? .testnet
                Button {} label: { if current == .testnet { Label("Testnet", systemImage: "checkmark") } else { Text("Testnet") } }
                // Leash's contract is only on testnet so far; this opens once it is on mainnet.
                Button {} label: { Text("Mainnet"); Text("Not live yet") }.disabled(true)
            }
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(Ink.disc)
                    Image("mark").resizable().foregroundStyle(Ink.text).frame(width: 19, height: 19)
                }
                .frame(width: 35, height: 35)
                Text(shortAccount(model.linked?.account ?? "")).font(.system(size: 16, weight: .semibold)).foregroundStyle(Ink.text).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(Ink.muted)
            }
            .padding(.leading, 6).padding(.trailing, 16)
            .frame(height: 46)
            .background(Capsule().fill(Ink.raised))
            .overlay(Capsule().stroke(Ink.edge, lineWidth: 0.7))
        }
    }
}

/// What waits on the owner, in black so it is the first thing seen. Tapping opens the request
/// itself, over Home.
struct WaitingCard: View {
    let snapshot: Snapshot
    let open: () -> Void

    var body: some View {
        let s = snapshot
        Button(action: open) {
            HStack(spacing: 14) {
                if let r = s.requests.first {
                    Avatar(actor: .agent(s.name(of: r.key)))
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(s.name(of: r.key)) wants to pay \(Money.usd(units(r.amount)))").font(.system(size: 16, weight: .semibold)).lineLimit(1)
                        Text(s.waiting > 1 ? "\(r.to) and \(s.waiting - 1) more" : "\(r.to) · \(untilText(r.expires_at.nanoDate)) left")
                            .font(.system(size: 14)).foregroundStyle(Ink.inverse.opacity(0.6)).lineLimit(1)
                    }
                } else if let p = s.proposals.first {
                    Avatar(actor: .agent(s.name(of: p.key)))
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(s.name(of: p.key)) asks for more").font(.system(size: 16, weight: .semibold)).lineLimit(1)
                        Text(p.note).font(.system(size: 14)).foregroundStyle(Ink.inverse.opacity(0.6)).lineLimit(1)
                    }
                }
                Spacer(minLength: 6)
                Text("Review").font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.text)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(Capsule().fill(Ink.inverse))
            }
            .foregroundStyle(Ink.inverse)
            .padding(.horizontal, 16).padding(.vertical, 16)
            .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Ink.text))
        }
        .buttonStyle(PressStyle())
    }
}

/// A label's icon before its title, sized for a pill button.
struct PillLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            configuration.icon.font(.system(size: 15, weight: .semibold))
            configuration.title
        }
    }
}

/// A gentle press for cards that act as buttons.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// The agents list, like PayBox's: title and count, search, one card per agent. The brake sits
/// beside the + so stopping every agent is always one tap from here.
struct AgentsView: View {
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav
    @State private var query = ""
    @State private var confirmPause = false

    var body: some View {
        let s = model.snapshot
        let agents = (s?.agents ?? []).filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.policy.allowlist.contains { $0.localizedCaseInsensitiveContains(query) } }
            .sorted { ($0.policy.active ? 0 : 1, $0.name) < ($1.policy.active ? 0 : 1, $1.name) }
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ScreenTitle(title: "Agents", subtitle: subtitle(s)) {
                    HStack(spacing: 10) {
                        if s?.paused == true {
                            Button { Task { await model.resume() } } label: { RoundIcon(system: "play.fill") }.accessibilityLabel("Resume all")
                        } else {
                            Button { confirmPause = true } label: { RoundIcon(system: "pause.fill") }.accessibilityLabel("Pause all")
                                .confirmationDialog("Pause every agent?", isPresented: $confirmPause, titleVisibility: .visible) {
                                    Button("Pause all agents", role: .destructive) { Task { await model.pauseAll() } }
                                } message: { Text("No agent can pay until you resume. Requests already waiting stay waiting.") }
                        }
                        Button { nav.sheet = .connect } label: { RoundIcon(system: "plus") }.accessibilityLabel("Connect agent")
                    }
                }
                .padding(.top, 20)

                SearchField(text: $query, prompt: "Search agents").padding(.top, 30)

                VStack(spacing: 12) {
                    if s?.paused == true { PausedCard() }
                    ForEach(agents) { agent in
                        NavigationLink(value: agent.id) {
                            RowCard(title: agent.name, subtitle: line(agent, paused: s?.paused == true)) {
                                AgentMark(name: agent.name, off: !agent.policy.active)
                            } trailing: {
                                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.text)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if s != nil, agents.isEmpty {
                        EmptyCard(system: "person.2", title: query.isEmpty ? "No agents yet" : "No match", line: query.isEmpty ? "Connect Claude or ChatGPT and give it a daily limit." : "Try another name or recipient.", action: query.isEmpty ? "Connect agent" : nil) { nav.sheet = .connect }
                    }
                }
                .padding(.top, 24)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.refresh() }
    }

    private func subtitle(_ s: Snapshot?) -> String {
        guard let s else { return " " }
        if s.paused { return "All paused" }
        let revoked = s.agents.count - s.activeAgents.count
        return "\(s.activeAgents.count) active" + (revoked > 0 ? ", \(revoked) revoked" : "")
    }

    private func line(_ a: Agent, paused: Bool) -> String {
        guard a.policy.active else { return "Revoked" }
        let spent = "\(Money.usd(a.spentToday)) of \(Money.short(a.dailyCap)) today"
        if paused { return "Paused · \(spent)" }
        guard a.policy.last_paid_at > 0 else { return "\(spent) · never paid" }
        return "\(spent) · paid \(relative(a.policy.last_paid_at.nanoDate).lowercased())"
    }
}

/// What agents are waiting on: payments over their limits and asks for more.
struct ApprovalsView: View {
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav

    var body: some View {
        let s = model.snapshot
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ScreenTitle(title: "Approvals", subtitle: (s?.waiting ?? 0) == 0 ? "All caught up" : "\(s!.waiting) waiting") {
                    ZStack {
                        Circle().fill(Ink.raised)
                        Image(systemName: (s?.waiting ?? 0) == 0 ? "checkmark" : "hand.raised")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle((s?.waiting ?? 0) == 0 ? Ink.good : Ink.text)
                    }
                    .frame(width: 46, height: 46)
                    .overlay(Circle().stroke(Ink.edge, lineWidth: 0.7))
                }
                .padding(.top, 20)

                VStack(spacing: 12) {
                    if let s {
                        if s.waiting == 0 {
                            VStack(spacing: 8) {
                                Image(systemName: "checkmark").font(.system(size: 20, weight: .medium)).foregroundStyle(Ink.good)
                                Text("Nothing waiting").font(.system(size: 17, weight: .semibold)).padding(.top, 6)
                                Text("New requests will appear here.").font(.system(size: 14)).foregroundStyle(Ink.muted)
                            }
                            .frame(maxWidth: .infinity).frame(height: 200)
                            .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Ink.surface))
                        }
                        ForEach(s.requests) { r in
                            Button { nav.request = r } label: {
                                RowCard(title: "\(s.name(of: r.key)) wants to pay", subtitle: "\(r.to) · expires in \(untilText(r.expires_at.nanoDate))") {
                                    AgentMark(name: s.name(of: r.key))
                                } trailing: {
                                    Text(Money.usd(units(r.amount))).font(.system(size: 17, weight: .semibold)).monospacedDigit()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        ForEach(s.proposals) { p in
                            Button { nav.ask = p } label: {
                                RowCard(title: "\(s.name(of: p.key)) asks for more", subtitle: p.note) {
                                    AgentMark(name: s.name(of: p.key))
                                } trailing: {
                                    Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.text)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.top, 30)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.refresh() }
    }
}

struct PausedCard: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        RowCard(title: "Every agent is paused", subtitle: "Nothing can be paid until you resume.") {
            ZStack { Circle().fill(Ink.text); Image(systemName: "pause.fill").foregroundStyle(Ink.inverse) }.frame(width: 46, height: 46)
        } trailing: {
            Button("Resume") { Task { await model.resume() } }.buttonStyle(.pill(.primary, compact: true))
        }
    }
}

struct SearchField: View {
    @Binding var text: String
    let prompt: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass").font(.system(size: 19)).foregroundStyle(Ink.muted)
            TextField(prompt, text: $text).font(.system(size: 17)).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        .padding(.horizontal, 18)
        .frame(height: 48)
        .background(Capsule().fill(Ink.raised))
    }
}

struct EmptyCard: View {
    let system: String
    let title: String
    let line: String
    var action: String?
    var run: () -> Void = {}
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: system).font(.system(size: 18, weight: .medium)).foregroundStyle(Ink.muted)
                .frame(width: 46, height: 46).background(Circle().fill(Ink.raised))
            Text(title).font(.system(size: 17, weight: .semibold)).padding(.top, 4)
            Text(line).font(.system(size: 14)).foregroundStyle(Ink.muted).multilineTextAlignment(.center)
            if let action { Button(action, action: run).buttonStyle(.pill(.primary, compact: true)).padding(.top, 8) }
        }
        .frame(maxWidth: .infinity).padding(28)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Ink.surface))
    }
}

extension Notification.Name {
    /// A tapped alert names the request to open.
    static let leashOpenRequest = Notification.Name("leash.openRequest")
}
