import Foundation

// The checks an owner should see before approving: does the recipient exist and can it hold the
// token, has the owner paid it before, does its name imitate one they trust, and is the amount
// out of line with what this agent usually pays. Mirrors the web's lib/safety.ts.

struct SafetyCheck: Hashable, Sendable {
    enum Tone: Sendable { case ok, note, danger }
    let tone: Tone
    let text: String
}

enum Safety {
    static func editDistance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var row = Array(0...b.count)
        for i in 1...a.count {
            var diagonal = row[0]
            row[0] = i
            for j in 1...b.count {
                let above = row[j]
                row[j] = min(above + 1, row[j - 1] + 1, diagonal + (a[i - 1] == b[j - 1] ? 0 : 1))
                diagonal = above
            }
        }
        return row[b.count]
    }

    /// Folds the characters scammers swap for each other, so vend0r and vendor read the same.
    static func skeleton(_ account: String) -> String {
        var s = account.lowercased()
        for (from, to) in [("rn", "m"), ("vv", "w"), ("0", "o"), ("1", "l"), ("i", "l"), ("|", "l"), ("5", "s"), ("-", ""), ("_", "")] {
            s = s.replacingOccurrences(of: from, with: to)
        }
        return s
    }

    static func lookalike(of to: String, trusted: some Sequence<String>) -> String? {
        trusted.first { $0 != to && (skeleton($0) == skeleton(to) || editDistance($0, to) <= 2) }
    }

    private static let moved: Set<String> = ["pay", "request_approved"]

    static func assess(_ r: PayRequest, agent: Agent?, log: [LogEntry], facts: RecipientFacts?) -> [SafetyCheck] {
        var checks: [SafetyCheck] = []
        let paid = log.filter { moved.contains($0.event) && $0.to != nil && $0.amount != nil }
        let trusted = Set((agent?.policy.allowlist ?? []) + paid.compactMap(\.to))
        if let facts {
            if !facts.exists { checks.append(.init(tone: .danger, text: "\(r.to) does not exist. The transfer would fail.")) }
            else if !facts.registered { checks.append(.init(tone: .danger, text: "\(r.to) cannot receive USDC yet. The transfer would fail and be refunded.")) }
            else { checks.append(.init(tone: .ok, text: "\(r.to) exists and can receive USDC.")) }
        }
        if let look = lookalike(of: r.to, trusted: trusted) {
            checks.append(.init(tone: .danger, text: "\(r.to) looks like \(look), which you trust, but it is a different account."))
        }
        let times = paid.filter { $0.to == r.to }.count
        checks.append(times > 0
            ? .init(tone: .ok, text: "You have paid \(r.to) \(times == 1 ? "once" : "\(times) times") before.")
            : .init(tone: .note, text: "First payment to \(r.to)."))
        let largest = paid.filter { $0.key == r.key }.map { units($0.amount) }.max() ?? 0
        if largest > 0, units(r.amount) > largest {
            checks.append(.init(tone: .note, text: "Larger than any payment this agent has made (up to \(Money.usd(largest)) so far)."))
        }
        return checks
    }
}
