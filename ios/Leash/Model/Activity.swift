import Foundation

/// How each on-chain event reads in the activity feed: who it was about, what happened in a few
/// words, the detail under it, and a small badge on the avatar saying how it ended. A refusal is
/// Leash doing its job, and reads as one. Mirrors the web's lib/activity.ts.
struct FeedLine: Hashable {
    enum Actor: Hashable { case agent(String), owner }
    enum Tone: Hashable { case good, bad, neutral }
    struct Badge: Hashable { let symbol: String; let tone: Tone }
    enum Flow: Hashable { case out, into, held, rate }

    let actor: Actor
    let title: String
    let detail: String?
    let badge: Badge
    let amount: Units?
    let flow: Flow
}

/// `firstGrant` tells a new agent from new limits; the contract logs both as policy_set.
func feedLine(_ e: LogEntry, who: String, firstGrant: Bool = true) -> FeedLine {
    let to = e.to ?? "someone"
    let amount = e.amount.map(units)
    let agent = FeedLine.Actor.agent(who)
    func line(_ actor: FeedLine.Actor, _ title: String, _ detail: String?, _ symbol: String, _ tone: FeedLine.Tone, flow: FeedLine.Flow = .held, amount: Units? = nil) -> FeedLine {
        FeedLine(actor: actor, title: title, detail: detail, badge: .init(symbol: symbol, tone: tone), amount: amount, flow: flow)
    }
    switch e.event {
    case "pay": return line(agent, "Paid \(to)", "\(who), on its own", "checkmark", .good, flow: .out, amount: amount)
    case "request_approved": return line(agent, "You approved \(who)", "Paid \(to)", "checkmark", .good, flow: .out, amount: amount)
    case "pay_failed": return line(agent, "Payment to \(to) failed", "Refunded to the vault", "arrow.uturn.backward", .bad, flow: .into, amount: amount)
    case "pay_refused": return line(agent, "Stopped \(who)", (e.detail ?? "over its limits").capitalizedFirst + ". Nothing moved.", "xmark", .bad)
    case "request_parked": return line(agent, "\(who) asked to pay", "To \(to)", "hourglass", .neutral, amount: amount)
    case "request_denied": return line(agent, "You denied \(who)", "Nothing moved", "xmark", .bad)
    case "request_expired": return line(agent, "\(who)'s request expired", "Nothing moved", "clock", .neutral)
    case "proposal_made": return line(agent, "\(who) asked for more", e.detail, "arrow.up", .neutral)
    case "proposal_dismissed": return line(agent, "You turned down \(who)", "Its limits stay as they were", "xmark", .bad)
    case "raise_granted": return line(agent, "You raised \(who)'s limits", "For a while", "arrow.up", .good, flow: .rate, amount: amount)
    case "raise_ended": return line(agent, "\(who)'s raise ended", "Back to its usual limits", "arrow.down", .neutral)
    case "policy_set": return firstGrant
        ? line(agent, "You added \(who)", "Can now pay from the vault", "plus", .good, flow: .rate, amount: amount)
        : line(agent, "You changed \(who)'s limits", nil, "slider.horizontal.3", .neutral, flow: .rate, amount: amount)
    case "policy_revoked": return line(agent, "You revoked \(who)", "Its key can no longer pay", "minus", .bad)
    case "paused": return line(.owner, "You paused every agent", "Nothing could be paid", "pause.fill", .bad)
    case "resumed": return line(.owner, "You resumed your agents", nil, "play.fill", .good)
    case "deposit": return line(.owner, "Added to the vault", "From your account", "arrow.down", .good, flow: .into, amount: amount)
    case "withdraw": return line(.owner, "Moved to your account", "From the vault", "arrow.up", .neutral, flow: .out, amount: amount)
    case "task_opened": return line(agent, "\(who) opened a task", e.detail, "plus", .neutral, amount: amount)
    case "task_closed": return line(agent, "\(who) closed a task", e.detail, "checkmark", .neutral)
    default: return line(agent, e.event.replacingOccurrences(of: "_", with: " ").capitalizedFirst, e.detail, "circle", .neutral)
    }
}

extension Snapshot {
    /// The log as feed lines, newest first. Keyed, only that agent's and its tasks'.
    func feed(limit: Int? = nil, key: String? = nil) -> [(entry: LogEntry, line: FeedLine)] {
        var seen = Set<String>()
        var lines: [(entry: LogEntry, line: FeedLine)] = []
        // Oldest first, so the first policy_set for a key is the grant and later ones are changes.
        for e in log.reversed() {
            let first = e.event == "policy_set" ? seen.insert(e.key ?? "").inserted : true
            lines.append((e, feedLine(e, who: name(of: e.key), firstGrant: first)))
        }
        var out = Array(lines.reversed())
        if let key {
            let children = Set(tasks.filter { $0.parent == key }.map(\.child))
            out = out.filter { $0.entry.key == key || children.contains($0.entry.key ?? "") }
        }
        if let limit { out = Array(out.prefix(limit)) }
        return out
    }

    /// The vault at the close of each of the last `days` days, oldest first, today's being now.
    /// Walked back from the balance now through the log, which keeps the last hundred events.
    func balanceHistory(days: Int, now: Date = .now, calendar: Calendar = .current) -> [(day: Date, balance: Units)] {
        let today = calendar.startOfDay(for: now)
        var balance = vault
        var events = log.makeIterator()
        var next = events.next()
        var out: [(day: Date, balance: Units)] = []
        for back in 0..<days {
            guard let day = calendar.date(byAdding: .day, value: -back, to: today),
                  let end = calendar.date(byAdding: .day, value: 1, to: day) else { continue }
            while let e = next, e.at.nanoDate >= end {
                balance -= vaultEffect(e)
                next = events.next()
            }
            out.append((day, max(0, balance)))
        }
        return out.reversed()
    }

    /// What was paid each of the last seven days, oldest first; one agent's when keyed.
    func weekSpend(key: String? = nil, now: Date = .now, calendar: Calendar = .current) -> [(day: Date, spent: Units)] {
        let today = calendar.startOfDay(for: now)
        let days = (0..<7).reversed().compactMap { calendar.date(byAdding: .day, value: -$0, to: today) }
        var totals = Dictionary(uniqueKeysWithValues: days.map { ($0, Units(0)) })
        for e in log where (e.event == "pay" || e.event == "request_approved") && (key == nil || e.key == key) {
            let day = calendar.startOfDay(for: e.at.nanoDate)
            if totals[day] != nil { totals[day]! += units(e.amount) }
        }
        return days.map { ($0, totals[$0] ?? 0) }
    }

    /// Who an agent paid, most money first.
    func recipients(of key: String) -> [(to: String, total: Units, count: Int)] {
        var by: [String: (total: Units, count: Int)] = [:]
        for e in log where (e.event == "pay" || e.event == "request_approved") && e.key == key {
            let to = e.to ?? "someone"
            by[to, default: (0, 0)].total += units(e.amount)
            by[to, default: (0, 0)].count += 1
        }
        return by.map { (to: $0.key, total: $0.value.total, count: $0.value.count) }.sorted { $0.total > $1.total }
    }
}

/// How an event moved the vault.
func vaultEffect(_ e: LogEntry) -> Units {
    switch e.event {
    case "deposit", "pay_failed": units(e.amount)
    case "pay", "request_approved", "withdraw": -units(e.amount)
    default: 0
    }
}
