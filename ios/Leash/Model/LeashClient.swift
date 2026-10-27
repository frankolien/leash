import Foundation

/// Reads an owner's Leash state straight from the chain, and makes the owner's decisions with the
/// phone's limited key. No server sits in between.
struct LeashClient: Sendable {
    let owner: String
    let network: Network
    var rpc: NearRPC { NearRPC(url: network.rpc) }
    var contract: String { network.contract }

    func snapshot() async throws -> Snapshot {
        let o = ["owner": owner]
        async let policies = rpc.view(contract, "get_policies", o, as: [Pair<Policy>].self)
        async let requests = rpc.view(contract, "get_requests", o, as: [PayRequest].self)
        async let proposals = rpc.view(contract, "get_proposals", o, as: [Proposal].self)
        async let log = rpc.view(contract, "get_log", o, as: [LogEntry].self)
        async let paused = rpc.view(contract, "is_paused", o, as: Bool.self)
        async let raises = (try? await rpc.view(contract, "get_raises", o, as: [Pair<Raise>].self)) ?? []
        async let tasks = (try? await rpc.view(contract, "get_tasks", o, as: [AgentTask].self)) ?? []
        let list = try await policies
        let token = list.first?.value.token ?? network.usdc
        async let vault = rpc.view(contract, "get_vault", ["owner": owner, "token": token], as: String.self)
        async let held = (try? await rpc.view(token, "ft_balance_of", ["account_id": owner], as: String.self)) ?? "0"
        let raiseOf = Dictionary(await raises.map { ($0.key, $0.value) }, uniquingKeysWith: { a, _ in a })
        let remaining = try await withThrowingTaskGroup(of: (String, Units).self) { group in
            for pair in list {
                group.addTask {
                    let check = try await rpc.view(contract, "check", ["owner": owner, "public_key": pair.key, "to": owner, "amount": "1"], as: Check.self)
                    return (pair.key, units(check.remaining_today))
                }
            }
            return try await group.reduce(into: [String: Units]()) { $0[$1.0] = $1.1 }
        }
        return Snapshot(
            owner: owner, network: network, token: token,
            vault: units(try await vault), held: units(await held), paused: try await paused,
            agents: list.map { Agent(key: $0.key, policy: $0.value, remaining: remaining[$0.key] ?? 0, raise: raiseOf[$0.key]) },
            requests: try await requests.sorted { $0.id < $1.id },
            proposals: try await proposals.sorted { $0.id < $1.id },
            tasks: await tasks.sorted { $0.id > $1.id },
            log: try await log.reversed(),
            fetchedAt: .now
        )
    }

    /// Facts about a recipient, read just before the owner decides.
    func recipient(_ account: String, token: String) async -> RecipientFacts {
        let exists = await rpc.accountExists(account)
        guard exists else { return RecipientFacts(exists: false, registered: false) }
        let storage = try? await rpc.view(token, "storage_balance_of", ["account_id": account], as: StorageBalance?.self)
        return RecipientFacts(exists: true, registered: storage != nil)
    }

    // MARK: Owner decisions

    @discardableResult
    func act(_ method: String, _ args: [String: Any], key: NearKey) async throws -> (hash: String, value: Any?) {
        try await rpc.send([try FunctionCall(method: method, args: args, gas: method == "approve" ? 100_000_000_000_000 : FunctionCall.defaultGas)], to: contract, as: owner, key: key)
    }

    /// The approve call returns whether the payment went through; a refusal is reported, not thrown.
    func approve(_ id: UInt64, key: NearKey) async throws -> String {
        let (hash, value) = try await act("approve", ["request_id": id], key: key)
        if let outcome = value as? [String: Any], outcome["accepted"] as? Bool == false {
            throw NearError.contract(((outcome["reason"] as? String) ?? "Not paid").capitalizedFirst + ".")
        }
        return hash
    }
}

/// The contract returns maps as lists of [key, value] pairs.
struct Pair<T: Decodable & Sendable>: Decodable, Sendable {
    let key: String
    let value: T
    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        key = try c.decode(String.self)
        value = try c.decode(T.self)
    }
}

struct Check: Decodable { let remaining_today: String }
struct StorageBalance: Decodable { let total: String }
struct RecipientFacts: Hashable, Sendable { let exists: Bool; let registered: Bool }
