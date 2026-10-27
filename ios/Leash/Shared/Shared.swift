import Foundation

/// What the app and its widgets share: the linked account, a small summary for the widget, and the
/// keychain group both keys live in. The widget extension is a separate process, so these go
/// through the app group and the shared keychain group rather than the app's own storage.
enum Shared {
    static let group = "group.com.frankolien.leash"
    static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }

    /// From Info.plist, "$(AppIdentifierPrefix)com.frankolien.leash.shared"; nil in a host
    /// without the entitlement, where the keys stay in the app's own keychain.
    static var keychainGroup: String? { Bundle.main.object(forInfoDictionaryKey: "LeashKeychainGroup") as? String }

    static var linked: LinkedAccount? {
        let d = defaults
        guard let account = d.string(forKey: "leash.account") ?? UserDefaults.standard.string(forKey: "leash.account"), !account.isEmpty,
              let network = Network(rawValue: d.string(forKey: "leash.network") ?? UserDefaults.standard.string(forKey: "leash.network") ?? "") else { return nil }
        return LinkedAccount(account: account, network: network)
    }

    static func save(_ linked: LinkedAccount?) {
        defaults.set(linked?.account, forKey: "leash.account")
        defaults.set(linked?.network.rawValue, forKey: "leash.network")
    }

    static var summaryFile: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appending(path: "summary.json")
    }

    static func save(_ summary: AgentSummary) {
        guard let file = summaryFile else { return }
        try? JSONEncoder().encode(summary).write(to: file, options: .atomic)
    }

    static func summary() -> AgentSummary? {
        summaryFile.flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONDecoder().decode(AgentSummary.self, from: $0) }
    }
}

struct LinkedAccount: Equatable, Codable, Sendable {
    let account: String
    let network: Network
}

/// What a widget shows: today's spend against the daily total, what waits, whether paused.
struct AgentSummary: Codable, Equatable, Sendable {
    let account: String
    let spent: Units
    let daily: Units
    let waiting: Int
    let paused: Bool
    let firstWaiting: String?
    let updated: Date

    init(_ s: Snapshot) {
        account = s.owner
        spent = s.spentToday
        daily = s.dailyTotal
        waiting = s.waiting
        paused = s.paused
        firstWaiting = s.requests.first.map { "\(s.name(of: $0.key)) wants \(Money.usd(units($0.amount)))" }
            ?? s.proposals.first.map { "\(s.name(of: $0.key)) asks for more" }
        updated = s.fetchedAt
    }

    init(account: String, spent: Units, daily: Units, waiting: Int, paused: Bool, firstWaiting: String?, updated: Date) {
        self.account = account; self.spent = spent; self.daily = daily; self.waiting = waiting; self.paused = paused; self.firstWaiting = firstWaiting; self.updated = updated
    }
}
