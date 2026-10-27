import SwiftUI

/// Home is the agents: what they spent today, who is waiting on you, and the brake. The vault is
/// the line under it, not the headline, because the phone governs agents rather than holding money.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var request: PayRequest?
    @State private var ask: Proposal?
    @State private var addMoney = false
    @State private var connect = false
    @State private var confirmPause = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let s = model.snapshot {
                    VStack(alignment: .leading, spacing: 28) {
                        topBar
                        header(s)
                        if s.paused { pausedBanner }
                        if s.waiting > 0 { waiting(s) }
                        agents(s)
                    }
                    .padding(.horizontal, 16).padding(.bottom, 32)
                } else {
                    ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 160)
                }
            }
            .scrollIndicators(.hidden)
            .refreshable { await model.refresh() }
            .background(Ink.ground)
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: Agent.ID.self) { AgentDetailView(key: $0) }
        }
        .sheet(item: $request) { RequestSheet(request: $0) }
        .sheet(item: $ask) { AskSheet(proposal: $0) }
        .sheet(isPresented: $addMoney) { AddMoneySheet() }
        .sheet(isPresented: $connect) { ConnectSheet() }
        .onReceive(NotificationCenter.default.publisher(for: .leashOpenRequest)) { note in
            guard let id = note.object as? UInt64 else { return }
            request = model.snapshot?.requests.first { $0.id == id }
        }
    }

    /// The account on the left, the brake on the right: always one tap from home.
    private var topBar: some View {
        HStack(spacing: 8) {
            Image("mark").resizable().frame(width: 22, height: 22)
            Text(shortAccount(model.linked?.account ?? "")).font(.headline).lineLimit(1)
            Spacer()
            pauseButton
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private var pauseButton: some View {
        if model.snapshot?.paused == true {
            Button { Task { await model.resume() } } label: { Label("Resume", systemImage: "play.fill") }
                .buttonStyle(.pill(.primary, compact: true))
        } else {
            Button { confirmPause = true } label: {
                HStack(spacing: 6) {
                    if model.busy == "pause" { ProgressView().tint(.white) } else { Image(systemName: "pause.fill") }
                    Text("Pause all")
                }
            }
            .buttonStyle(.pill(.secondary, compact: true))
                .confirmationDialog("Pause every agent?", isPresented: $confirmPause, titleVisibility: .visible) {
                    Button("Pause all agents", role: .destructive) { Task { await model.pauseAll() } }
                } message: {
                    Text("No agent can pay until you resume. Requests already waiting stay waiting.")
                }
        }
    }

    private func header(_ s: Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Spent today by your agents").font(.subheadline).foregroundStyle(Ink.muted)
            BigAmount(units: s.spentToday)
            if s.dailyTotal > 0 {
                Meter(value: Double(s.spentToday) / Double(s.dailyTotal)).padding(.top, 6)
                Text("of \(Money.short(s.dailyTotal)) a day across \(s.activeAgents.count) \(s.activeAgents.count == 1 ? "agent" : "agents")")
                    .font(.footnote).foregroundStyle(Ink.muted)
            }
            HStack(spacing: 6) {
                Text("Vault").foregroundStyle(Ink.muted)
                Text(Money.usd(s.vault)).fontWeight(.semibold).monospacedDigit()
                if model.offline { Text("· offline").foregroundStyle(Ink.faint) }
            }
            .font(.subheadline).padding(.top, 10)
            HStack(spacing: 10) {
                Button { addMoney = true } label: { Label("Add money", systemImage: "plus") }.buttonStyle(.pill(.primary))
                Button { connect = true } label: { Label("Connect agent", systemImage: "link") }.buttonStyle(.pill(.secondary))
            }
            .labelStyle(.titleOnly)
            .padding(.top, 14)
        }
        .padding(.top, 8)
    }

    private var pausedBanner: some View {
        HStack(spacing: 14) {
            Image(systemName: "pause.circle.fill").font(.system(size: 28))
            VStack(alignment: .leading, spacing: 2) {
                Text("Every agent is paused").font(.headline)
                Text("Nothing can be paid until you resume.").font(.subheadline).foregroundStyle(Ink.muted)
            }
            Spacer()
            Button("Resume") { Task { await model.resume() } }.buttonStyle(.pill(.primary, compact: true))
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Ink.surface))
    }

    private func waiting(_ s: Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Waiting for you", trailing: "\(s.waiting)")
            ForEach(s.requests) { r in
                Button { request = r } label: { RequestRow(request: r, snapshot: s) }.buttonStyle(.plain)
            }
            ForEach(s.proposals) { p in
                Button { ask = p } label: { AskRow(proposal: p, snapshot: s) }.buttonStyle(.plain)
            }
        }
    }

    private func agents(_ s: Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Agents", trailing: s.activeAgents.isEmpty ? nil : "\(s.activeAgents.count) active")
            if s.agents.isEmpty {
                Card {
                    VStack(spacing: 10) {
                        Image(systemName: "sparkles").font(.system(size: 22)).foregroundStyle(Ink.muted)
                        Text("No agents yet").font(.headline)
                        Text("Connect Claude or ChatGPT and give it a daily limit.").font(.subheadline).foregroundStyle(Ink.muted).multilineTextAlignment(.center)
                        Button("Connect an agent") { connect = true }.buttonStyle(.pill(.primary, compact: true)).padding(.top, 6)
                    }
                    .frame(maxWidth: .infinity).padding(24)
                }
            } else {
                Card {
                    let sorted = s.agents.sorted { ($0.policy.active ? 0 : 1, $0.name) < ($1.policy.active ? 0 : 1, $1.name) }
                    ForEach(Array(sorted.enumerated()), id: \.element.key) { i, agent in
                        NavigationLink(value: agent.id) { AgentRow(agent: agent, paused: s.paused) }.buttonStyle(.plain)
                        if i < sorted.count - 1 { Divider().overlay(Ink.line).padding(.leading, 76) }
                    }
                }
            }
        }
    }
}

struct AgentRow: View {
    let agent: Agent
    let paused: Bool

    var body: some View {
        HStack(spacing: 14) {
            AgentMark(name: agent.name, off: !agent.policy.active)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(agent.name).font(.headline)
                    Spacer()
                    if agent.policy.active {
                        Text("\(Money.short(agent.spentToday)) of \(Money.short(agent.dailyCap))").font(.subheadline.weight(.medium)).monospacedDigit()
                    } else {
                        Text("Revoked").font(.subheadline).foregroundStyle(Ink.muted)
                    }
                }
                if agent.policy.active {
                    Meter(value: agent.dailyCap > 0 ? Double(agent.spentToday) / Double(agent.dailyCap) : 0)
                    Text(paused ? "Paused" : agent.raise != nil ? "Raised until \(agent.raise!.until.nanoDate.formatted(date: .omitted, time: .shortened))" : modeOf(agent))
                        .font(.footnote).foregroundStyle(Ink.muted).lineLimit(1)
                } else {
                    Text("Its key can no longer pay.").font(.footnote).foregroundStyle(Ink.faint)
                }
            }
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Ink.faint)
        }
        .padding(16)
        .contentShape(Rectangle())
    }
}

struct RequestRow: View {
    let request: PayRequest
    let snapshot: Snapshot

    var body: some View {
        let name = snapshot.name(of: request.key)
        HStack(spacing: 14) {
            AgentMark(name: name)
            VStack(alignment: .leading, spacing: 3) {
                Text("\(name) wants to pay").font(.subheadline).foregroundStyle(Ink.muted)
                Text(request.to).font(.headline).lineLimit(1)
                Text("Expires in \(untilText(request.expires_at.nanoDate))").font(.footnote).foregroundStyle(Ink.faint)
            }
            Spacer()
            Text(Money.usd(units(request.amount))).font(.title3.weight(.bold)).monospacedDigit()
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Ink.surface))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.18), lineWidth: 1))
    }
}

struct AskRow: View {
    let proposal: Proposal
    let snapshot: Snapshot

    var body: some View {
        let name = snapshot.name(of: proposal.key)
        HStack(spacing: 14) {
            AgentMark(name: name)
            VStack(alignment: .leading, spacing: 3) {
                Text("\(name) asks for more").font(.subheadline).foregroundStyle(Ink.muted)
                Text(proposal.note).font(.headline).lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Ink.faint)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Ink.surface))
    }
}

extension Notification.Name {
    /// A tapped alert names the request to open.
    static let leashOpenRequest = Notification.Name("leash.openRequest")
}
