import SwiftUI

/// One parked payment, with everything the owner needs to decide: who asks, how much, to whom,
/// why it stopped, what the chain says about the recipient, and how long it waits. Saying no is
/// one tap; saying yes asks for Face ID.
struct RequestSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let request: PayRequest
    @State private var facts: RecipientFacts?

    var body: some View {
        let s = model.snapshot
        let name = s?.name(of: request.key) ?? "Agent"
        let agent = s?.agent(request.key) ?? s?.tasks.first { $0.child == request.key }.flatMap { s?.agent($0.parent) }
        let checks = Safety.assess(request, agent: agent, log: s?.log ?? [], facts: facts)
        let danger = checks.contains { $0.tone == .danger }
        let busy = model.busy == "approve-\(request.id)" || model.busy == "deny-\(request.id)"

        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            AgentMark(name: name, size: 36)
                            Text("\(name) wants to pay").font(.headline)
                        }
                        BigAmount(units: units(request.amount), size: 48)
                        HStack(spacing: 6) {
                            Text("to").foregroundStyle(Ink.muted)
                            Text(request.to).fontWeight(.semibold).textSelection(.enabled)
                        }
                        .font(.title3)
                    }

                    table(rows: [
                        ("Why it waits", request.reason.capitalizedFirst),
                        agent.map { ("Its limits", modeOf($0)) },
                        agent.map { ("Left today", "\(Money.usd($0.remaining)) of \(Money.short($0.dailyCap))") },
                        ("Expires", "in \(untilText(request.expires_at.nanoDate))"),
                    ].compactMap { $0 })

                    if let memo = request.memo, !memo.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("The agent's note").font(.footnote).foregroundStyle(Ink.muted)
                            Text("“\(memo)”").font(.body).italic()
                            Text("Written by the agent, not checked by Leash.").font(.caption).foregroundStyle(Ink.faint)
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Checks").font(.footnote).foregroundStyle(Ink.muted)
                        if facts == nil { ProgressView().tint(Ink.muted) }
                        ForEach(checks, id: \.self) { CheckRow(check: $0) }
                    }
                }
                .padding(20).padding(.top, 8)
            }

            VStack(spacing: 10) {
                Button {
                    Task { if await model.approve(request) { dismiss() } }
                } label: {
                    HStack(spacing: 8) {
                        if model.busy == "approve-\(request.id)" { ProgressView().tint(Ink.inverse) } else { Image(systemName: "faceid") }
                        Text(danger ? "Approve anyway" : "Approve \(Money.usd(units(request.amount)))")
                    }
                }
                .buttonStyle(.pill(.primary))
                Button {
                    Task { if await model.deny(request) { dismiss() } }
                } label: {
                    HStack(spacing: 8) {
                        if model.busy == "deny-\(request.id)" { ProgressView().tint(Ink.text) }
                        Text("Deny")
                    }
                }
                .buttonStyle(.pill(.secondary))
            }
            .disabled(busy)
            .padding(.horizontal, 20).padding(.vertical, 12)
        }
        .background(Ink.ground)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task {
            guard let client = model.client else { return }
            facts = await client.recipient(request.to, token: request.token)
        }
        .sensoryFeedback(.warning, trigger: danger)
    }

    private func table(rows: [(String, String)]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                HStack(alignment: .firstTextBaseline) {
                    Text(row.0).foregroundStyle(Ink.muted)
                    Spacer(minLength: 16)
                    Text(row.1).multilineTextAlignment(.trailing)
                }
                .font(.subheadline)
                .padding(.vertical, 12)
                if i < rows.count - 1 { Divider().overlay(Ink.line) }
            }
        }
        .padding(.horizontal, 16)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.surface))
    }
}

struct CheckRow: View {
    let check: SafetyCheck
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: check.tone == .ok ? "checkmark.circle" : check.tone == .note ? "info.circle" : "exclamationmark.triangle.fill")
                .foregroundStyle(check.tone == .danger ? Ink.danger : check.tone == .ok ? Ink.good : Ink.muted)
            Text(check.text).font(.subheadline).foregroundStyle(check.tone == .danger ? Ink.danger : Ink.text)
        }
    }
}

/// An agent asking for a temporary raise: the exact terms beside its note, granted for a while.
struct AskSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let proposal: Proposal
    @State private var hours: UInt64 = 24

    var body: some View {
        let s = model.snapshot
        let name = s?.name(of: proposal.key) ?? "Agent"
        let agent = s?.agent(proposal.key)
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 10) {
                        AgentMark(name: name, size: 36)
                        Text("\(name) asks for more").font(.headline)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("“\(proposal.note)”").font(.title3).italic()
                        Text("Written by the agent, not checked by Leash.").font(.caption).foregroundStyle(Ink.faint)
                    }
                    if let ask = proposal.ask, let agent {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("It would change").font(.footnote).foregroundStyle(Ink.muted)
                            if let d = ask.daily_cap { change("Daily limit", Money.short(units(agent.policy.daily_cap)), Money.short(units(d))) }
                            if let p = ask.per_payment_cap { change("Pays alone up to", Money.short(units(agent.policy.per_payment_cap)), Money.short(units(p))) }
                            if !ask.allow.isEmpty { change("Also may pay", "", ask.allow.joined(separator: ", ")) }
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            Text("For").font(.footnote).foregroundStyle(Ink.muted)
                            Picker("For", selection: $hours) {
                                Text("1 hour").tag(UInt64(1))
                                Text("1 day").tag(UInt64(24))
                                Text("7 days").tag(UInt64(168))
                            }
                            .pickerStyle(.segmented)
                            Text("Then its usual limits come back on their own.").font(.footnote).foregroundStyle(Ink.muted)
                        }
                    } else {
                        Text("This ask names no exact terms. Change its limits on the web if you agree.").font(.subheadline).foregroundStyle(Ink.muted)
                    }
                }
                .padding(20).padding(.top, 8)
            }
            VStack(spacing: 10) {
                if proposal.ask != nil {
                    Button {
                        Task { if await model.grant(proposal, forSecs: hours * 3600) { dismiss() } }
                    } label: {
                        HStack(spacing: 8) {
                            if model.busy == "grant-\(proposal.id)" { ProgressView().tint(Ink.inverse) } else { Image(systemName: "faceid") }
                            Text("Grant for \(hours == 1 ? "1 hour" : hours == 24 ? "1 day" : "7 days")")
                        }
                    }
                    .buttonStyle(.pill(.primary))
                }
                Button("Dismiss") { Task { if await model.dismiss(proposal) { dismiss() } } }.buttonStyle(.pill(.secondary))
            }
            .disabled(model.busy != nil)
            .padding(.horizontal, 20).padding(.vertical, 12)
        }
        .background(Ink.ground)
        .presentationDragIndicator(.visible)
        .onAppear {
            if let secs = proposal.ask?.for_secs, secs > 0 { hours = secs <= 3600 ? 1 : secs <= 86_400 ? 24 : 168 }
        }
    }

    private func change(_ label: String, _ from: String, _ to: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Ink.muted)
            Spacer()
            if !from.isEmpty { Text(from).strikethrough().foregroundStyle(Ink.faint); Image(systemName: "arrow.right").font(.caption).foregroundStyle(Ink.faint) }
            Text(to).fontWeight(.semibold)
        }
        .font(.subheadline)
    }
}
