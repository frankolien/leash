import XCTest
@testable import Leash

/// The phone's full key on a throwaway testnet owner (made by the scratchpad's owner-e2e.mjs): the
/// same client calls the app makes to top up, add an agent, withdraw and take keys off.
final class OwnerKeyLiveTests: XCTestCase {
    func testAccountRunFromThePhone() async throws {
        let path = ProcessInfo.processInfo.environment["LEASH_OWNER_E2E"] ?? ""
        try XCTSkipIf(path.isEmpty, "set TEST_RUNNER_LEASH_OWNER_E2E to an owner-e2e.json")
        let spec = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: String]
        func hex(_ s: String) -> Data { Data(stride(from: 0, to: s.count, by: 2).map { i in let a = s.index(s.startIndex, offsetBy: i); return UInt8(s[a..<s.index(a, offsetBy: 2)], radix: 16)! }) }
        let key = try NearKey(seed: hex(spec["seed"]!))
        let client = LeashClient(owner: spec["owner"]!, network: .testnet)
        let token = Network.testnet.usdc
        var s = try await client.snapshot()
        let held = s.held, vault = s.vault
        XCTAssertGreaterThanOrEqual(held, 500_000)

        try await client.topUp(500_000, token: token, key: key)
        s = try await client.snapshot()
        XCTAssertEqual(s.vault, vault + 500_000)
        XCTAssertEqual(s.held, held - 500_000)
        XCTAssertEqual(s.log.first?.event, "deposit")

        let made = try await client.createAgent(name: "e2e", token: token, daily: 3_000_000, perPayment: 1_000_000, allowlist: [], relay: URL(string: "https://leash.frankolien.com/api/relay")!, key: key)
        let access = try await client.rpc.accessKey(account: client.owner, publicKey: made.public_key)
        XCTAssertEqual(access.receiver, Network.testnet.contract)
        XCTAssertEqual(Set(access.methods), ["pay", "request", "ask_more"])
        s = try await client.snapshot()
        XCTAssertEqual(s.agent(made.public_key)?.dailyCap, 3_000_000)
        XCTAssertEqual(s.agent(made.public_key)?.perPaymentCap, 1_000_000)
        let file = try JSONSerialization.jsonObject(with: Data(base64Encoded: made.inline)!) as! [String: String]
        XCTAssertEqual(try NearKey(seed: Base58.decode(String(file["private_key"]!.dropFirst(8)))!.prefix(32)).publicKey, made.public_key)

        // The agent's own key pays from the new vault, as the MCP server would.
        let agentKey = try NearKey(seed: Base58.decode(String(made.private_key.dropFirst(8)))!.prefix(32))
        let (_, outcome) = try await client.rpc.send([try FunctionCall(method: "pay", args: ["to": "frankolien.testnet", "amount": "100000"], gas: 100_000_000_000_000)], to: client.contract, as: client.owner, key: agentKey)
        XCTAssertEqual((outcome as? [String: Any])?["accepted"] as? Bool, true)

        try await client.withdraw(200_000, token: token, key: key)
        s = try await client.snapshot()
        XCTAssertEqual(s.vault, vault + 500_000 - 100_000 - 200_000)
        XCTAssertEqual(s.balanceHistory(days: 1).last?.balance, s.vault)

        // A spare full key goes, then the agent's; the signing key stays.
        let spare = NearKey()
        _ = try await client.rpc.send(actions: [.addKey(publicKey: spare.publicKeyData, permission: .fullAccess)], to: client.owner, as: client.owner, key: key)
        try await client.deleteKeys([spare.publicKey, made.public_key, "ed25519:11111111111111111111111111111111"], key: key)
        let left = try await client.rpc.accessKeys(account: client.owner).map(\.publicKey)
        XCTAssertFalse(left.contains(spare.publicKey))
        XCTAssertFalse(left.contains(made.public_key))
        XCTAssertTrue(left.contains(key.publicKey))
        print("live: owner \(client.owner) ran top up, new agent, agent pay, withdraw and key removal from the phone's client")
    }
}
