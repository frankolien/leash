import SwiftUI

/// Which screen the floating tab bar shows, and which sheet is open over it. Shared so a tapped
/// alert, or a card on one screen, can move the owner to the right place.
@MainActor
@Observable
final class Navigator {
    enum Screen: String, CaseIterable { case overview, agents, approvals, activity }
    var screen: Screen
    var request: PayRequest?
    var ask: Proposal?
    var sheet: Sheet?

    enum Sheet: String, Identifiable { case topUp, receive, connect, settings; var id: String { rawValue } }

    init() { screen = Screen(rawValue: UserDefaults.standard.string(forKey: "leash.tab") ?? "") ?? .overview }
}

/// Overview, laid out like PayBox's: the account and settings on top, the vault balance, two
/// actions, then the agents where PayBox lists assets.
struct OverviewView: View {
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav
    @AppStorage("leash.hideBalance") private var hidden = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    accountMenu
                    Spacer()
                    Button { nav.sheet = .settings } label: { RoundIcon(system: "gearshape") }
                        .accessibilityLabel("Settings")
                }
                .padding(.top, 12)

                HStack(spacing: 8) {
                    Text("Balance").font(.system(size: 16)).foregroundStyle(Ink.muted)
                    Button { hidden.toggle() } label: {
                        Image(systemName: hidden ? "eye.slash" : "eye").font(.system(size: 16)).foregroundStyle(Ink.muted)
                    }
                    .accessibilityLabel(hidden ? "Show balance" : "Hide balance")
                }
                .padding(.top, 30)
                BigAmount(units: model.snapshot?.vault ?? 0, hidden: hidden)
                    .redacted(reason: model.snapshot == nil ? .placeholder : [])
                    .padding(.top, 4)

                HStack(spacing: 8) {
                    Button("Top up") { nav.sheet = .topUp }.buttonStyle(.pill(.primary))
                    Button("Receive USDC") { nav.sheet = .receive }.buttonStyle(.pill(.primary))
                }
                .padding(.top, 24)

                if let s = model.snapshot {
                    if s.paused { PausedCard().padding(.top, 24) }
                    if s.waiting > 0 {
                        Button { nav.screen = .approvals } label: {
                            RowCard(title: "\(s.waiting) waiting for you", subtitle: waitingLine(s)) {
                                ZStack {
                                    Circle().fill(Ink.text)
                                    Image(systemName: "hand.raised").font(.system(size: 19)).foregroundStyle(.white)
                                }
                                .frame(width: 46, height: 46)
                            } trailing: {
                                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.text)
                            }
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 24)
                    }
                    agents(s).padding(.top, 34)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 110)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.refresh() }
    }

    private func waitingLine(_ s: Snapshot) -> String {
        if let r = s.requests.first { return "\(s.name(of: r.key)) wants to pay \(Money.usd(units(r.amount)))" }
        if let p = s.proposals.first { return "\(s.name(of: p.key)) asks for more" }
        return ""
    }

    private var accountMenu: some View {
        Menu {
            if let linked = model.linked {
                Button { UIPasteboard.general.string = linked.account } label: { Label("Copy account name", systemImage: "doc.on.doc") }
                Link(destination: URL(string: "\(linked.network.explorer)/address/\(linked.account)")!) { Label("View on NEAR", systemImage: "arrow.up.right") }
            }
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(Color(hex: 0xDEDEDE))
                    Image("mark").resizable().foregroundStyle(Ink.text).frame(width: 19, height: 19)
                }
                .frame(width: 35, height: 35)
                Text(shortAccount(model.linked?.account ?? "")).font(.system(size: 16, weight: .semibold)).foregroundStyle(Ink.text).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.text)
            }
            .padding(.leading, 5).padding(.trailing, 16)
            .frame(height: 46)
            .background(Capsule().fill(Ink.raised))
            .overlay(Capsule().stroke(Ink.edge, lineWidth: 0.7))
        }
    }

    private func agents(_ s: Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Text("Your agents").font(.system(size: 19, weight: .semibold)).tracking(-0.3)
                Spacer()
                Text("Today").font(.system(size: 14)).foregroundStyle(Ink.muted)
                Button { nav.screen = .activity } label: { Image(systemName: "clock").font(.system(size: 19)).foregroundStyle(Ink.text) }
                    .accessibilityLabel("Activity")
            }
            if s.activeAgents.isEmpty {
                EmptyCard(system: "plus", title: "Connect your first agent", line: "Give Claude or ChatGPT a daily limit.", action: "Connect agent") { nav.sheet = .connect }
            } else {
                ForEach(s.activeAgents) { agent in
                    NavigationLink(value: agent.id) {
                        RowCard(title: agent.name, subtitle: s.paused ? "Paused" : modeOf(agent)) {
                            AgentMark(name: agent.name)
                        } trailing: {
                            VStack(alignment: .trailing, spacing: 4) {
                                Text(Money.usd(agent.spentToday)).font(.system(size: 17, weight: .semibold)).monospacedDigit()
                                Text("of \(Money.short(agent.dailyCap)) today").font(.system(size: 14)).foregroundStyle(Ink.muted)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
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
            .padding(.horizontal, 16)
            .padding(.bottom, 110)
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
            .padding(.horizontal, 16)
            .padding(.bottom, 110)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.refresh() }
    }
}

struct PausedCard: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        RowCard(title: "Every agent is paused", subtitle: "Nothing can be paid until you resume.") {
            ZStack { Circle().fill(Ink.text); Image(systemName: "pause.fill").foregroundStyle(.white) }.frame(width: 46, height: 46)
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
