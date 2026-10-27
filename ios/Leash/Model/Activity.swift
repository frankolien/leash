import Foundation

/// How each on-chain event reads in the activity list. A refusal is good news and is written as
/// one. Mirrors the web's lib/activity.ts.
struct Described: Hashable {
    enum Icon: String { case out = "arrow.up.right", into = "arrow.down.left", back = "arrow.uturn.backward", refused = "xmark", ask = "hand.raised", check = "checkmark", minus = "minus", clock = "clock", key = "key", pause = "pause", play = "play" }
    let icon: Icon
    let title: String
    let danger: Bool
}

func describe(_ e: LogEntry, who: String) -> Described {
    let to = e.to ?? "someone"
    switch e.event {
    case "pay": return .init(icon: .out, title: "\(who) paid \(to)", danger: false)
    case "pay_failed": return .init(icon: .back, title: "Transfer to \(to) failed; refunded", danger: true)
    case "pay_refused": return .init(icon: .refused, title: "Refused \(who): \(e.detail ?? "over its limits"). Nothing moved.", danger: false)
    case "request_parked": return .init(icon: .ask, title: "\(who) asked to pay \(to)", danger: false)
    case "request_approved": return .init(icon: .check, title: "You approved \(who)'s payment to \(to)", danger: false)
    case "request_denied": return .init(icon: .minus, title: "You denied \(who)'s request", danger: false)
    case "request_expired": return .init(icon: .clock, title: "\(who)'s request expired", danger: false)
    case "proposal_made": return .init(icon: .ask, title: "\(who) asks for more", danger: false)
    case "proposal_dismissed": return .init(icon: .minus, title: "You dismissed \(who)'s ask", danger: false)
    case "raise_granted": return .init(icon: .key, title: "You raised \(who)'s limits for a while", danger: false)
    case "raise_ended": return .init(icon: .key, title: "\(who)'s raise ended", danger: false)
    case "policy_set": return .init(icon: .key, title: "You granted \(who)", danger: false)
    case "policy_revoked": return .init(icon: .key, title: "You revoked \(who)", danger: true)
    case "paused": return .init(icon: .pause, title: "You paused every agent", danger: true)
    case "resumed": return .init(icon: .play, title: "You resumed your agents", danger: false)
    case "deposit": return .init(icon: .into, title: "You added to the vault", danger: false)
    case "withdraw": return .init(icon: .out, title: "You took from the vault", danger: false)
    case "task_opened": return .init(icon: .key, title: "\(who) opened a task", danger: false)
    case "task_closed": return .init(icon: .minus, title: "\(who) closed a task", danger: false)
    default: return .init(icon: .minus, title: e.event.replacingOccurrences(of: "_", with: " ").capitalizedFirst, danger: false)
    }
}

/// Spend per day for the last seven days, oldest first, for the week chart.
func weekSpend(_ log: [LogEntry], now: Date = .now, calendar: Calendar = .current) -> [(day: Date, spent: Units)] {
    let today = calendar.startOfDay(for: now)
    let days = (0..<7).reversed().compactMap { calendar.date(byAdding: .day, value: -$0, to: today) }
    var totals = Dictionary(uniqueKeysWithValues: days.map { ($0, Units(0)) })
    for e in log where e.event == "pay" || e.event == "request_approved" {
        let day = calendar.startOfDay(for: e.at.nanoDate)
        if totals[day] != nil { totals[day]! += units(e.amount) }
    }
    return days.map { ($0, totals[$0] ?? 0) }
}
