import SwiftUI

/// Everything that happened, newest first, as the contract recorded it.
struct ActivityView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let log = model.snapshot?.log ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ScreenTitle(title: "Activity", subtitle: log.isEmpty ? "Nothing yet" : "On chain, newest first") { EmptyView() }
                    .padding(.top, 20)
                if let s = model.snapshot {
                    if log.isEmpty {
                        EmptyCard(system: "clock", title: "Nothing yet", line: "Payments, requests and your decisions show up here.").padding(.top, 30)
                    } else {
                        Card {
                            ForEach(Array(log.enumerated()), id: \.offset) { i, e in
                                LogRow(entry: e, who: s.name(of: e.key), policy: e.key.flatMap(s.agent))
                                if i < log.count - 1 { Divider().overlay(Ink.line).padding(.leading, 74) }
                            }
                        }
                        .padding(.top, 30)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 110)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.refresh() }
    }
}

struct LogRow: View {
    let entry: LogEntry
    let who: String
    let policy: Agent?

    var body: some View {
        let d = describe(entry, who: who)
        HStack(spacing: 12) {
            Image(systemName: d.icon.rawValue)
                .font(.system(size: 15, weight: .medium))
                .frame(width: 46, height: 46)
                .background(Circle().fill(Ink.raised))
                .foregroundStyle(d.danger ? Ink.danger : Ink.text)
            VStack(alignment: .leading, spacing: 4) {
                Text(d.title).font(.system(size: 15, weight: .semibold)).lineLimit(2)
                Text(subtitle).font(.system(size: 13)).foregroundStyle(Ink.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let amount = amountText {
                Text(amount).font(.system(size: 15, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(entry.event == "request_parked" || entry.event == "policy_set" ? Ink.muted : Ink.text)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    private var amountText: String? {
        guard let amount = entry.amount, entry.event != "pay_refused" else { return nil }
        let money = Money.usd(units(amount))
        switch entry.event {
        case "pay", "request_approved", "withdraw": return "−" + money
        case "deposit": return "+" + money
        case "policy_set", "raise_granted": return "\(Money.short(units(amount)))/day"
        default: return money
        }
    }

    /// Why a payment went through alone, in the owner's terms, beside when it happened.
    private var subtitle: String {
        let when = relative(entry.at.nanoDate)
        if entry.event == "pay", let p = policy { return "\(when) · under its \(Money.short(p.perPaymentCap)) limit" }
        if let detail = entry.detail, !["pay_refused", "request_parked"].contains(entry.event) { return "\(when) · \(detail)" }
        return when
    }
}
