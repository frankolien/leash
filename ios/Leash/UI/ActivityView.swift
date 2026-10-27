import SwiftUI

/// Everything that happened, newest first, as the contract recorded it.
struct ActivityView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            ScrollView {
                if let s = model.snapshot {
                    if s.log.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "list.bullet").font(.system(size: 22)).foregroundStyle(Ink.muted)
                            Text("Nothing yet").font(.headline)
                            Text("Payments, requests and your decisions show up here.").font(.subheadline).foregroundStyle(Ink.muted)
                        }
                        .frame(maxWidth: .infinity).padding(.top, 120)
                    } else {
                        Card {
                            ForEach(Array(s.log.enumerated()), id: \.offset) { i, e in
                                LogRow(entry: e, who: s.name(of: e.key), policy: e.key.flatMap(s.agent))
                                if i < s.log.count - 1 { Divider().overlay(Ink.line).padding(.leading, 64) }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .refreshable { await model.refresh() }
            .background(Ink.ground)
            .navigationTitle("Activity")
        }
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
                .font(.system(size: 14, weight: .semibold))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Ink.raised))
                .foregroundStyle(d.danger ? Ink.danger : .white)
            VStack(alignment: .leading, spacing: 3) {
                Text(d.title).font(.subheadline.weight(.medium)).lineLimit(2)
                Text(subtitle).font(.footnote).foregroundStyle(Ink.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let amount = entry.amount, entry.event != "pay_refused" {
                Text((sign ?? "") + Money.usd(units(amount))).font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(entry.event == "request_parked" ? Ink.muted : .white)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    /// Why a payment went through alone, in the owner's terms, beside when it happened.
    private var subtitle: String {
        let when = relative(entry.at.nanoDate)
        if entry.event == "pay", let p = policy { return "\(when) · under its \(Money.short(p.perPaymentCap)) limit" }
        if let detail = entry.detail, !["pay_refused", "request_parked"].contains(entry.event) { return "\(when) · \(detail)" }
        return when
    }

    private var sign: String? {
        switch entry.event {
        case "pay", "request_approved", "withdraw": "−"
        case "deposit": "+"
        default: nil
        }
    }
}
