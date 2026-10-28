import Foundation

enum NearError: LocalizedError, Equatable {
    case rpc(String)
    case contract(String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .rpc(let m), .contract(let m): m
        case .badResponse: "NEAR sent back something unexpected."
        }
    }
}

/// JSON-RPC to a NEAR node: contract views, the access key the phone signs with, and sending.
struct NearRPC: Sendable {
    let url: URL
    var session: URLSession = .shared

    private func call(_ method: String, _ params: Any) async throws -> Any {
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "id": "leash", "method": method, "params": params])
        let (data, _) = try await session.data(for: request)
        guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NearError.badResponse }
        if let error = body["error"] as? [String: Any] {
            // The cause names the kind; its info and the data carry the reason, e.g. which key or nonce.
            let cause = error["cause"] as? [String: Any]
            let detail = [cause?["name"], cause?["info"], error["data"]].compactMap { $0 }.map { v -> String in
                if let s = v as? String { return s }
                return (try? JSONSerialization.data(withJSONObject: v)).map { String(decoding: $0, as: UTF8.self) } ?? ""
            }.joined(separator: " ")
            throw NearError.rpc(Self.plain(detail.isEmpty ? (error["message"] as? String ?? "RPC error") : detail))
        }
        guard let result = body["result"] else { throw NearError.badResponse }
        if let r = result as? [String: Any], let e = r["error"] as? String { throw NearError.rpc(Self.plain(e)) }
        return result
    }

    /// A view method's JSON result, decoded into `T`.
    func view<T: Decodable>(_ contract: String, _ method: String, _ args: [String: Any] = [:], as type: T.Type = T.self) async throws -> T {
        let encoded = try JSONSerialization.data(withJSONObject: args).base64EncodedString()
        let result = try await call("query", ["request_type": "call_function", "finality": "optimistic", "account_id": contract, "method_name": method, "args_base64": encoded])
        guard let bytes = (result as? [String: Any])?["result"] as? [Int] else { throw NearError.badResponse }
        return try JSONDecoder().decode(T.self, from: Data(bytes.map(UInt8.init)))
    }

    struct AccessKey: Sendable {
        let nonce: UInt64
        let blockHash: Data
        /// The contract and methods a function-call key is limited to; nil for a full-access key.
        let receiver: String?
        let methods: [String]
    }

    func accessKey(account: String, publicKey: String) async throws -> AccessKey {
        let result = try await call("query", ["request_type": "view_access_key", "finality": "optimistic", "account_id": account, "public_key": publicKey])
        guard let r = result as? [String: Any], let nonce = (r["nonce"] as? NSNumber)?.uint64Value,
              let hash = (r["block_hash"] as? String).flatMap(Base58.decode) else { throw NearError.badResponse }
        let fc = ((r["permission"] as? [String: Any])?["FunctionCall"]) as? [String: Any]
        return AccessKey(nonce: nonce, blockHash: hash, receiver: fc?["receiver_id"] as? String, methods: fc?["method_names"] as? [String] ?? [])
    }

    /// Every key on the account, with what each may do.
    func accessKeys(account: String) async throws -> [(publicKey: String, permission: KeyPermission)] {
        let result = try await call("query", ["request_type": "view_access_key_list", "finality": "optimistic", "account_id": account])
        guard let keys = (result as? [String: Any])?["keys"] as? [[String: Any]] else { throw NearError.badResponse }
        return keys.compactMap { k in
            guard let pk = k["public_key"] as? String, let access = k["access_key"] as? [String: Any] else { return nil }
            guard let fc = (access["permission"] as? [String: Any])?["FunctionCall"] as? [String: Any] else { return (pk, .fullAccess) }
            return (pk, .functionCall(receiver: fc["receiver_id"] as? String ?? "", methods: fc["method_names"] as? [String] ?? [], allowance: nil))
        }
    }

    func accountExists(_ account: String) async -> Bool {
        (try? await call("query", ["request_type": "view_account", "finality": "final", "account_id": account])) != nil
    }

    /// Signs and sends calls to one contract, and waits until they have run. Returns the
    /// transaction hash and the last call's JSON result, if it returned one.
    func send(_ calls: [FunctionCall], to receiver: String, as account: String, key: NearKey) async throws -> (hash: String, value: Any?) {
        try await send(actions: calls.map(NearAction.call), to: receiver, as: account, key: key)
    }

    func send(actions calls: [NearAction], to receiver: String, as account: String, key: NearKey) async throws -> (hash: String, value: Any?) {
        let access = try await accessKey(account: account, publicKey: key.publicKey)
        let nonce = await Nonces.shared.next(for: key.publicKey, chain: access.nonce)
        let tx = NearTransaction(signerId: account, publicKey: key.publicKeyData, nonce: nonce, receiverId: receiver, blockHash: access.blockHash, actions: calls)
        let signed = try tx.signed(with: key)
        let result = try await call("send_tx", ["signed_tx_base64": signed.base64EncodedString(), "wait_until": "EXECUTED_OPTIMISTIC"])
        guard let outcome = result as? [String: Any], let status = outcome["status"] as? [String: Any] else { throw NearError.badResponse }
        let hash = Base58.encode(tx.hash)
        if let failure = status["Failure"] { throw NearError.contract(Self.plain(Self.panic(in: failure) ?? "the transaction failed")) }
        if let value = status["SuccessValue"] as? String, let data = Data(base64Encoded: value), !data.isEmpty {
            return (hash, try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed))
        }
        return (hash, nil)
    }

    private static func panic(in failure: Any) -> String? {
        if let s = failure as? String { return s }
        guard let dict = failure as? [String: Any] else { return nil }
        for (key, value) in dict {
            if key == "ExecutionError", let s = value as? String { return s }
            if let found = panic(in: value) { return found }
        }
        return nil
    }

    /// The contract's panic text without NEAR's wrapping, or a sentence for the common RPC errors.
    static func plain(_ raw: String) -> String {
        if raw.contains("AccessKeyDoesNotExist") || raw.contains("UNKNOWN_ACCESS_KEY") { return "This phone is no longer linked to the account." }
        if raw.contains("DepositWithFunctionCall") || raw.contains("ReceiverMismatch") || raw.contains("MethodNameMismatch") { return "This phone's key is not allowed to do that." }
        if raw.contains("InvalidNonce") { return "Another decision was still landing. Try again." }
        if raw.contains("NotEnoughAllowance") { return "This phone has used up its gas allowance. Link it again from the web." }
        if raw.contains("NotEnoughBalance") || raw.contains("LackBalanceForState") { return "The account needs a little more NEAR for fees." }
        if raw.contains("UNKNOWN_ACCOUNT") { return "That account does not exist." }
        if let range = raw.range(of: "Smart contract panicked: ") { return String(raw[range.upperBound...]).capitalizedFirst }
        return raw
    }
}

/// Two decisions in quick succession can read the same nonce before the first lands, so the last
/// one used is remembered and the next is always above both.
actor Nonces {
    static let shared = Nonces()
    private var last: [String: UInt64] = [:]

    func next(for key: String, chain: UInt64) -> UInt64 {
        let n = max(chain, last[key] ?? 0) + 1
        last[key] = n
        return n
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
