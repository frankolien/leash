import SwiftUI

/// One agent: its rules in a sentence, today against its limit, any raise or task budgets, what it
/// paid, and revoke kept apart at the bottom.
struct AgentDetailView: View {
    @Environment(AppModel.self) private var model
    let key: String
    @State private var confirmRevoke = false

    var body: some View {
        ScrollView {
            if let s = model.snapshot, let agent = s.agent(key) {
                VStack(alignment: .leading, spacing: 26) {
                    HStack(spacing: 14) {
                        AgentMark(name: agent.name, size: 56, off: !agent.policy.active)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(agent.name).font(.title2.bold())
                            Text(agent.policy.active ? (s.paused ? "Paused with every agent" : modeOf(agent)) : "Revoked. Its key can no longer pay.")
                                .font(.subheadline).foregroundStyle(Ink.muted)
                        }
                    }

                    if agent.policy.active {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Today").font(.subheadline).foregroundStyle(Ink.muted)
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                BigAmount(units: agent.spentToday, size: 40)
                                Text("of \(Money.short(agent.dailyCap))").font(.title3).foregroundStyle(Ink.muted)
                            }
                            Meter(value: agent.dailyCap > 0 ? Double(agent.spentToday) / Double(agent.dailyCap) : 0)
                        }
                    }

                    rules(agent)

                    if let raise = agent.raise, agent.policy.active {
                        Card {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Raised for a while").font(.headline)
                                Text("Until \(raise.until.nanoDate.formatted(date: .abbreviated, time: .shortened)). Then its usual limits come back on their own.")
                                    .font(.subheadline).foregroundStyle(Ink.muted)
                                Button("End raise now") { Task { await model.endRaise(agent) } }.buttonStyle(.pill(.secondary, compact: true)).padding(.top, 4)
                            }
                            .padding(18)
                        }
                    }

                    let tasks = s.tasks.filter { $0.parent == key }
                    if !tasks.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionTitle(text: "Tasks for sub-agents", trailing: "\(tasks.filter(\.active).count) open")
                            Card {
                                ForEach(Array(tasks.enumerated()), id: \.element.id) { i, t in
                                    TaskRow(task: t)
                                    if i < tasks.count - 1 { Divider().overlay(Ink.line) }
                                }
                            }
                        }
                    }

                    let mine = s.log.filter { $0.key == key || tasks.map(\.child).contains($0.key ?? "") }
                    if !mine.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionTitle(text: "Activity")
                            Card {
                                ForEach(Array(mine.prefix(12).enumerated()), id: \.offset) { i, e in
                                    LogRow(entry: e, who: s.name(of: e.key), policy: agent)
                                    if i < min(mine.count, 12) - 1 { Divider().overlay(Ink.line).padding(.leading, 64) }
                                }
                            }
                        }
                    }

                    if agent.policy.active {
                        Button("Revoke \(agent.name)", role: .destructive) { confirmRevoke = true }
                            .buttonStyle(.pill(.danger))
                            .confirmationDialog("Revoke \(agent.name)?", isPresented: $confirmRevoke, titleVisibility: .visible) {
                                Button("Revoke", role: .destructive) { Task { await model.revoke(agent) } }
                            } message: {
                                Text("It can never pay again with this key. To use it again, connect it anew.")
                            }
                    }
                }
                .padding(16)
            }
        }
        .background(Ink.ground)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func rules(_ a: Agent) -> some View {
        Card {
            VStack(spacing: 0) {
                rule("Daily limit", Money.short(a.dailyCap))
                Divider().overlay(Ink.line)
                rule("Pays alone up to", Money.short(a.perPaymentCap))
                Divider().overlay(Ink.line)
                rule("May pay", a.policy.allowlist.isEmpty ? "Anyone" : a.policy.allowlist.joined(separator: ", "))
                if a.policy.expires_at > 0 {
                    Divider().overlay(Ink.line)
                    rule("Key expires", a.policy.expires_at.nanoDate.formatted(date: .abbreviated, time: .shortened))
                }
                if a.policy.last_paid_at > 0 {
                    Divider().overlay(Ink.line)
                    rule("Last paid", relative(a.policy.last_paid_at.nanoDate))
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func rule(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundStyle(Ink.muted)
            Spacer(minLength: 16)
            Text(value).multilineTextAlignment(.trailing)
        }
        .font(.subheadline).padding(.vertical, 13)
    }
}

struct TaskRow: View {
    let task: AgentTask
    var body: some View {
        let budget = units(task.budget), spent = units(task.spent)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(task.label).font(.headline)
                Spacer()
                Text(task.active ? "\(Money.usd(spent)) of \(Money.usd(budget))" : "Closed").font(.subheadline).foregroundStyle(task.active ? .white : Ink.muted).monospacedDigit()
            }
            if task.active { Meter(value: budget > 0 ? Double(spent) / Double(budget) : 0) }
            Text(task.allow.isEmpty ? "Any recipient" : "Only \(task.allow.joined(separator: ", "))")
                .font(.footnote).foregroundStyle(Ink.muted).lineLimit(1)
            if task.active { Text("Ends in \(untilText(task.expires_at.nanoDate))").font(.footnote).foregroundStyle(Ink.faint) }
        }
        .padding(16)
    }
}
