import Charts
import SwiftUI

/// One agent: who it is and whether it may pay, today against its limit, its week, the rules it
/// runs under (editable here), who it pays most, what it did, and revoke kept quiet at the bottom.
struct AgentDetailView: View {
    @Environment(AppModel.self) private var model
    let key: String
    @State private var confirmRevoke = false
    @State private var editing = false

    var body: some View {
        ScrollView {
            if let s = model.snapshot, let agent = s.agent(key) {
                VStack(alignment: .leading, spacing: 34) {
                    identity(agent, s)
                    if agent.policy.active {
                        today(agent)
                        week(s)
                    }
                    limits(agent)
                    if let raise = agent.raise, agent.policy.active { raised(agent, raise) }
                    tasks(s)
                    recipients(s)
                    activity(s)
                    if agent.policy.active { revoke(agent) }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 72)
                .sheet(isPresented: $editing) { EditLimitsSheet(agent: agent) }
            }
        }
        .scrollIndicators(.hidden)
        .groundBackground()
        .toolbarVisibility(.visible, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let agent = model.snapshot?.agent(key), agent.policy.active {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { editing = true } label: { Label("Edit limits", systemImage: "slider.horizontal.3") }
                        Button(role: .destructive) { confirmRevoke = true } label: { Label("Revoke \(agent.name)", systemImage: "minus.circle") }
                    } label: { Image(systemName: "ellipsis") }
                }
            }
        }
        .refreshable { await model.refresh() }
    }

    private func identity(_ a: Agent, _ s: Snapshot) -> some View {
        let added = s.log.last { $0.key == a.key && $0.event == "policy_set" }.map { $0.at.nanoDate.formatted(.dateTime.day().month(.abbreviated)) }
        let status = !a.policy.active ? "Revoked" : s.paused ? "Paused with every agent" : "Active" + (added.map { " · since \($0)" } ?? "")
        return VStack(spacing: 14) {
            AgentMark(name: a.name, size: 88, off: !a.policy.active)
                .shadow(color: .black.opacity(0.06), radius: 14, y: 6)
            VStack(spacing: 8) {
                Text(a.name).font(.system(size: 30, weight: .bold)).tracking(-0.8)
                HStack(spacing: 6) {
                    Image(systemName: !a.policy.active ? "xmark.seal" : s.paused ? "pause.circle" : "checkmark.seal.fill")
                        .foregroundStyle(!a.policy.active ? Ink.danger : s.paused ? Ink.text : Ink.good)
                    Text(status)
                }
                .font(.system(size: 14, weight: .medium))
                .padding(.horizontal, 12).frame(height: 30)
                .background(Capsule().fill(Ink.surface))
            }
            Text(a.policy.active ? modeOf(a) : "Its key can no longer pay.").font(.system(size: 15)).foregroundStyle(Ink.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private func today(_ a: Agent) -> some View {
        HStack(spacing: 22) {
            SpendRing(value: a.dailyCap > 0 ? Double(a.spentToday) / Double(a.dailyCap) : 0) {
                VStack(spacing: 0) {
                    Text(Money.usd(a.spentToday)).font(.system(size: 20, weight: .bold)).monospacedDigit().minimumScaleFactor(0.6)
                    Text("of \(Money.short(a.dailyCap))").font(.system(size: 13)).foregroundStyle(Ink.muted)
                }
            }
            .frame(width: 118, height: 118)
            VStack(alignment: .leading, spacing: 16) {
                stat("Spent today", Money.usd(a.spentToday))
                stat("Left today", Money.usd(a.remaining))
                stat("Pays alone up to", Money.short(a.perPaymentCap))
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Ink.surface))
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 13)).foregroundStyle(Ink.muted)
            Text(value).font(.system(size: 17, weight: .semibold)).monospacedDigit()
        }
    }

    private func week(_ s: Snapshot) -> some View {
        let days = s.weekSpend(key: key)
        let total = days.reduce(0) { $0 + $1.spent }
        let top = max(1, Double(days.map(\.spent).max() ?? 0) / Double(Money.unit))
        return VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "This week") { Text(Money.usd(total)).monospacedDigit() }
            Chart {
                // A full-height track behind each day, so a quiet day still reads as a day.
                ForEach(Array(days.enumerated()), id: \.offset) { i, d in
                    BarMark(x: .value("Day", d.day, unit: .day), yStart: .value("Track", 0), yEnd: .value("Top", top), width: .fixed(16))
                        .cornerRadius(8)
                        .foregroundStyle(Ink.surface)
                    if d.spent > 0 {
                        BarMark(x: .value("Day", d.day, unit: .day), yStart: .value("Track", 0), yEnd: .value("Spent", max(top * 0.08, Double(d.spent) / Double(Money.unit))), width: .fixed(16))
                            .cornerRadius(8)
                            .foregroundStyle(i == days.count - 1 ? Ink.text : Ink.muted)
                    }
                }
            }
            .chartYAxis(.hidden)
            .chartYScale(domain: 0...top)
            .chartXAxis {
                AxisMarks(values: .stride(by: .day)) { _ in
                    AxisValueLabel(format: .dateTime.weekday(.narrow)).font(.system(size: 12, weight: .medium)).foregroundStyle(Ink.faint)
                }
            }
            .frame(height: 110)
        }
    }

    private func limits(_ a: Agent) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Limits") {
                if a.policy.active { Button("Edit") { editing = true }.foregroundStyle(Ink.text) }
            }
            VStack(spacing: 0) {
                rule("Daily limit", Money.short(a.dailyCap), "calendar")
                rule("Pays alone up to", Money.short(a.perPaymentCap), "hand.raised")
                rule("May pay", a.policy.allowlist.isEmpty ? "Anyone" : a.policy.allowlist.joined(separator: ", "), "person.crop.circle.badge.checkmark")
                if a.policy.expires_at > 0 { rule("Key expires", a.policy.expires_at.nanoDate.formatted(date: .abbreviated, time: .shortened), "clock") }
                if a.policy.last_paid_at > 0 { rule("Last paid", relative(a.policy.last_paid_at.nanoDate), "arrow.up.right") }
            }
        }
    }

    private func rule(_ label: String, _ value: String, _ symbol: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).font(.system(size: 16)).foregroundStyle(Ink.text)
                .frame(width: 40, height: 40).background(Circle().fill(Ink.surface))
            Text(label).font(.system(size: 16))
            Spacer(minLength: 12)
            Text(value).font(.system(size: 16, weight: .semibold)).multilineTextAlignment(.trailing).lineLimit(2)
        }
        .padding(.vertical, 7)
    }

    private func raised(_ a: Agent, _ raise: Raise) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(Ink.inverse)
                .frame(width: 40, height: 40).background(Circle().fill(Ink.good))
            VStack(alignment: .leading, spacing: 6) {
                Text("Raised for a while").font(.system(size: 16, weight: .semibold))
                Text("Until \(raise.until.nanoDate.formatted(date: .abbreviated, time: .shortened)). Then its usual limits come back on their own.")
                    .font(.system(size: 14)).foregroundStyle(Ink.muted)
                Button("End raise now") { Task { await model.endRaise(a) } }.buttonStyle(.pill(.secondary, compact: true)).padding(.top, 4)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Ink.surface))
    }

    @ViewBuilder private func tasks(_ s: Snapshot) -> some View {
        let tasks = s.tasks.filter { $0.parent == key }
        if !tasks.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: "Tasks for sub-agents") { Text("\(tasks.filter(\.active).count) open") }
                Card {
                    ForEach(Array(tasks.enumerated()), id: \.element.id) { i, t in
                        TaskRow(task: t)
                        if i < tasks.count - 1 { Divider().overlay(Ink.line) }
                    }
                }
            }
        }
    }

    @ViewBuilder private func recipients(_ s: Snapshot) -> some View {
        let top = Array(s.recipients(of: key).prefix(5))
        if !top.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                SectionHeader(title: "Paid most")
                ForEach(top, id: \.to) { r in
                    HStack(spacing: 14) {
                        Text(r.to.prefix(1).uppercased()).font(.system(size: 17, weight: .semibold))
                            .frame(width: 46, height: 46).background(Circle().fill(Ink.surface))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(r.to).font(.system(size: 16, weight: .semibold)).lineLimit(1).truncationMode(.middle)
                            Text(r.count == 1 ? "1 payment" : "\(r.count) payments").font(.system(size: 14)).foregroundStyle(Ink.muted)
                        }
                        Spacer(minLength: 8)
                        Text(Money.usd(r.total)).font(.system(size: 16, weight: .semibold)).monospacedDigit()
                    }
                    .padding(.vertical, 6)
                }
            }
        }
    }

    @ViewBuilder private func activity(_ s: Snapshot) -> some View {
        let feed = s.feed(key: key)
        if !feed.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: "Activity") {
                    if feed.count > 6, let name = s.agent(key)?.name { NavigationLink("See all") { ActivityView(key: key, title: name) } }
                }
                FeedList(feed: Array(feed.prefix(6)))
            }
        }
    }

    private func revoke(_ a: Agent) -> some View {
        VStack(spacing: 8) {
            Button("Revoke \(a.name)", role: .destructive) { confirmRevoke = true }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Ink.danger)
            Text("Its key stops working at once. Money it already paid stays paid.")
                .font(.system(size: 13)).foregroundStyle(Ink.faint).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
        .confirmationDialog("Revoke \(a.name)?", isPresented: $confirmRevoke, titleVisibility: .visible) {
            Button("Revoke", role: .destructive) { Task { await model.revoke(a) } }
        } message: {
            Text("It can never pay again with this key. To use it again, connect it anew.")
        }
    }
}

/// Today's spend as a ring that closes at the daily limit.
struct SpendRing<Center: View>: View {
    let value: Double
    @ViewBuilder var center: Center
    var body: some View {
        ZStack {
            Circle().stroke(Ink.raised, lineWidth: 10)
            Circle().trim(from: 0, to: min(1, max(value > 0 ? 0.02 : 0, value)))
                .stroke(value >= 1 ? Ink.danger : Ink.text, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.snappy, value: value)
            center.padding(14)
        }
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
                Text(task.active ? "\(Money.usd(spent)) of \(Money.usd(budget))" : "Closed").font(.subheadline).foregroundStyle(task.active ? Ink.text : Ink.muted).monospacedDigit()
            }
            if task.active { Meter(value: budget > 0 ? Double(spent) / Double(budget) : 0) }
            Text(task.allow.isEmpty ? "Any recipient" : "Only \(task.allow.joined(separator: ", "))")
                .font(.footnote).foregroundStyle(Ink.muted).lineLimit(1)
            if task.active { Text("Ends in \(untilText(task.expires_at.nanoDate))").font(.footnote).foregroundStyle(Ink.faint) }
        }
        .padding(16)
    }
}

/// New limits for an agent, signed on the phone. Saving starts its day's count over.
struct EditLimitsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let agent: Agent
    @State private var daily = ""
    @State private var perPayment = ""
    @State private var recipients = ""

    var body: some View {
        let d = Money.parse(daily), p = Money.parse(perPayment)
        let problem = limitsProblem(daily: d, perPayment: p)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                AgentMark(name: agent.name, size: 40)
                Text("\(agent.name)'s limits").font(.system(size: 22, weight: .bold)).tracking(-0.5)
            }
            .padding(.top, 28)
            VStack(spacing: 12) {
                MoneyField(label: "Daily limit", text: $daily)
                MoneyField(label: "Pays alone up to", text: $perPayment)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Only these accounts").font(.system(size: 14)).foregroundStyle(Ink.muted)
                    TextField("Anyone", text: $recipients)
                        .font(.system(size: 17)).textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.surface))
            }
            .padding(.top, 24)
            Text(problem ?? "Above \(Money.short(p ?? 0)) it asks you first. It can never spend more than \(Money.short(d ?? 0)) a day. Saving starts today's count over.")
                .font(.system(size: 14)).foregroundStyle(problem == nil ? Ink.muted : Ink.danger)
                .padding(.top, 14)
            Spacer()
            Button {
                Task {
                    let list = recipients.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    if let d, let p, await model.setLimits(agent, daily: d, perPayment: p, allowlist: list) { dismiss() }
                }
            } label: {
                HStack(spacing: 8) {
                    if model.busy == "limits-\(agent.key)" { ProgressView().tint(Ink.inverse) } else { Image(systemName: "faceid") }
                    Text("Save limits")
                }
            }
            .buttonStyle(.pill(.primary))
            .disabled(problem != nil || model.busy != nil)
            .padding(.bottom, 12)
        }
        .padding(.horizontal, 20)
        .groundBackground()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear {
            daily = Money.plain(units(agent.policy.daily_cap))
            perPayment = Money.plain(units(agent.policy.per_payment_cap))
            recipients = agent.policy.allowlist.joined(separator: ", ")
        }
    }
}

/// The same checks as the web's new-agent form.
func limitsProblem(daily: Units?, perPayment: Units?) -> String? {
    guard let daily, daily > 0 else { return "Set a daily limit above $0." }
    guard let perPayment, perPayment > 0 else { return "Set how much it may pay alone, above $0." }
    if perPayment > daily { return "It cannot pay alone more than its daily limit." }
    return nil
}

/// A labelled dollar amount, typed with the number pad.
struct MoneyField: View {
    let label: String
    @Binding var text: String
    var body: some View {
        HStack {
            Text(label).font(.system(size: 16)).foregroundStyle(Ink.muted)
            Spacer()
            HStack(spacing: 2) {
                Text("$").foregroundStyle(Ink.faint)
                TextField("0", text: $text).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    .frame(maxWidth: 150)
                    .onChange(of: text) { _, new in if new.count > 10 { text = String(new.prefix(10)) } }
            }
            .font(.system(size: 22, weight: .semibold)).monospacedDigit()
            .lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 16).frame(height: 64)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.surface))
    }
}
