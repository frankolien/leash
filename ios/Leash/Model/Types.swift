import Foundation

// The shapes the contract's views return. Amounts stay strings of the token's smallest unit on
// the wire and become `Units` on the way in; times are nanoseconds.

typealias Units = Int64

enum Network: String, Codable, Sendable {
    case testnet, mainnet

    var rpc: URL { URL(string: self == .testnet ? "https://rpc.testnet.fastnear.com" : "https://rpc.mainnet.fastnear.com")! }
    var contract: String { self == .testnet ? "leash.frankolien.testnet" : "leash.near" }
    var usdc: String {
        self == .testnet ? "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af" : "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
    }
    var explorer: String { self == .testnet ? "https://testnet.nearblocks.io" : "https://nearblocks.io" }
}

struct Policy: Codable, Hashable, Sendable {
    let name: String?
    let token: String
    let daily_cap: String
    let per_payment_cap: String
    let allowlist: [String]
    let cooldown_secs: UInt64
    let expires_at: UInt64
    let active: Bool
    let spent_today: String
    let day_started_at: UInt64
    let last_paid_at: UInt64
}

struct PayRequest: Codable, Hashable, Sendable, Identifiable {
    let id: UInt64
    let owner: String
    let key: String
    let token: String
    let to: String
    let amount: String
    let memo: String?
    let reason: String
    let created_at: UInt64
    let expires_at: UInt64
}

struct Ask: Codable, Hashable, Sendable {
    let daily_cap: String?
    let per_payment_cap: String?
    let allow: [String]
    let for_secs: UInt64
}

struct Proposal: Codable, Hashable, Sendable, Identifiable {
    let id: UInt64
    let owner: String
    let key: String
    let note: String
    let created_at: UInt64
    let ask: Ask?
}

struct Raise: Codable, Hashable, Sendable {
    let daily_cap: String?
    let per_payment_cap: String?
    let allow: [String]
    let until: UInt64
}

struct AgentTask: Codable, Hashable, Sendable, Identifiable {
    let id: UInt64
    let owner: String
    let parent: String
    let child: String
    let label: String
    let budget: String
    let spent: String
    let allow: [String]
    let created_at: UInt64
    let expires_at: UInt64
    let active: Bool
}

struct LogEntry: Codable, Hashable, Sendable {
    let at: UInt64
    let key: String?
    let event: String
    let to: String?
    let amount: String?
    let detail: String?
}

struct Agent: Codable, Hashable, Sendable, Identifiable {
    let key: String
    let policy: Policy
    let remaining: Units
    let raise: Raise?

    var id: String { key }
    var name: String { policy.name ?? "agent \(key.dropFirst(8).prefix(4).lowercased())" }
    var dailyCap: Units { units(raise?.daily_cap ?? policy.daily_cap) }
    var perPaymentCap: Units { units(raise?.per_payment_cap ?? policy.per_payment_cap) }
    var spentToday: Units { max(0, dailyCap - remaining) }
}

/// One read of everything the app shows, taken at `fetchedAt`.
struct Snapshot: Codable, Hashable, Sendable {
    let owner: String
    let network: Network
    let token: String
    let vault: Units
    let held: Units
    let paused: Bool
    let agents: [Agent]
    let requests: [PayRequest]
    let proposals: [Proposal]
    let tasks: [AgentTask]
    let log: [LogEntry]
    let fetchedAt: Date

    var waiting: Int { requests.count + proposals.count }
    var activeAgents: [Agent] { agents.filter(\.policy.active) }
    var spentToday: Units { activeAgents.reduce(0) { $0 + $1.spentToday } }
    var dailyTotal: Units { activeAgents.reduce(0) { $0 + $1.dailyCap } }

    func agent(_ key: String) -> Agent? { agents.first { $0.key == key } }

    /// A key's name: its agent's, or the task it pays for, written "parent › label".
    func name(of key: String?) -> String {
        guard let key else { return "Someone" }
        if let a = agent(key) { return a.name }
        if let t = tasks.first(where: { $0.child == key }) { return "\(agent(t.parent)?.name ?? "agent") › \(t.label)" }
        return "agent \(key.dropFirst(8).prefix(4).lowercased())"
    }
}

func units(_ s: String?) -> Units { Units(s ?? "0") ?? 0 }
