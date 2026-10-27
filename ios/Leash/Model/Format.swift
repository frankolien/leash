import Foundation

// Money and time on screen. Amounts are integers of the token's smallest unit (USDC has 6
// decimals), so no float ever touches a dollar.

enum Money {
    static let unit: Units = 1_000_000

    /// "12.5", "3", "0.05": the shortest exact form.
    static func plain(_ u: Units) -> String {
        let whole = u / unit, frac = abs(u % unit)
        guard frac != 0 else { return "\(whole)" }
        var f = String(format: "%06lld", frac)
        while f.hasSuffix("0") { f.removeLast() }
        return "\(whole).\(f)"
    }

    /// "$12.50": two decimals unless a smaller amount needs more.
    static func usd(_ u: Units) -> String {
        let cents = u % 10_000 == 0
        let whole = (u / unit).formatted(.number.grouping(.automatic))
        if cents { return "$\(whole).\(String(format: "%02lld", abs(u % unit) / 10_000))" }
        return "$\(whole)." + plain(u).split(separator: ".")[1]
    }

    /// "$12" when whole, else "$12.50", for prose and limits.
    static func short(_ u: Units) -> String { u % unit == 0 ? "$\((u / unit).formatted())" : usd(u) }

    static func parse(_ text: String) -> Units? {
        let t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "$", with: "")
        let parts = t.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(parts.count), let whole = Units(parts[0]), whole >= 0 else { return nil }
        guard parts.count == 2 else { return whole * unit }
        let frac = parts[1]
        guard frac.count <= 6, frac.allSatisfy(\.isNumber) else { return nil }
        return whole * unit + (Units(frac.padding(toLength: 6, withPad: "0", startingAt: 0)) ?? 0)
    }
}

extension UInt64 {
    /// A contract time (nanoseconds) as a Date.
    var nanoDate: Date { Date(timeIntervalSince1970: Double(self / 1_000_000) / 1000) }
}

/// How an agent behaves, in the owner's terms and with the real amounts.
func modeOf(_ agent: Agent) -> String {
    let per = agent.perPaymentCap, daily = agent.dailyCap
    if per == 0 { return "Asks before every payment" }
    if per < daily { return "Pays up to \(Money.short(per)) alone, asks above" }
    return "Pays alone, up to \(Money.short(daily)) a day"
}

/// "in 42 min", "in 3 h", for a deadline.
func untilText(_ date: Date, now: Date = .now) -> String {
    let secs = max(0, date.timeIntervalSince(now))
    if secs < 60 { return "under a minute" }
    if secs < 3600 { return "\(Int(secs / 60)) min" }
    if secs < 86_400 { return "\(Int(secs / 3600)) h" }
    return "\(Int(secs / 86_400)) d"
}

func relative(_ date: Date, now: Date = .now) -> String {
    let secs = now.timeIntervalSince(date)
    if secs < 60 { return "Just now" }
    if secs < 3600 { return "\(Int(secs / 60)) min ago" }
    if secs < 86_400 { return "\(Int(secs / 3600)) h ago" }
    return date.formatted(.dateTime.month(.abbreviated).day())
}

func shortAccount(_ account: String) -> String {
    account.count == 64 && account.allSatisfy(\.isHexDigit) ? "\(account.prefix(6))…\(account.suffix(4))" : account
}
