import XCTest
@testable import Leash

/// Reads a real testnet owner. Runs only with LEASH_LIVE=1 (TEST_RUNNER_LEASH_LIVE=1 for xcodebuild).
final class LiveTests: XCTestCase {
    func testSnapshotOfARealOwner() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["LEASH_LIVE"] == "1")
        let s = try await LeashClient(owner: "olien.testnet", network: .testnet).snapshot()
        XCTAssertFalse(s.agents.isEmpty)
        XCTAssertGreaterThan(s.vault, 0)
        print("live: vault \(Money.usd(s.vault)), agents \(s.agents.map(\.name)), waiting \(s.waiting), log \(s.log.count), tasks \(s.tasks.count)")
    }
}

/// The phone's own key on a throwaway testnet owner (made by scratchpad phone-e2e.mjs): every
/// decision signed natively here, and the one thing the key must never do, refused by NEAR.
final class PhoneKeyLiveTests: XCTestCase {
    func testDecisionsSignedOnThePhone() async throws {
        let path = ProcessInfo.processInfo.environment["LEASH_E2E"] ?? ""
        try XCTSkipIf(path.isEmpty, "set TEST_RUNNER_LEASH_E2E to a phone-e2e.json")
        let spec = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: String]
        func hex(_ s: String) -> Data { Data(stride(from: 0, to: s.count, by: 2).map { i in let a = s.index(s.startIndex, offsetBy: i); return UInt8(s[a..<s.index(a, offsetBy: 2)], radix: 16)! }) }
        let key = try NearKey(seed: hex(spec["seed"]!))
        let brake = try NearKey(seed: hex(spec["brakeSeed"]!))
        XCTAssertEqual(key.publicKey, spec["phone"])
        XCTAssertEqual(brake.publicKey, spec["brake"])
        let client = LeashClient(owner: spec["owner"]!, network: .testnet)

        // The brake pauses; it can never undo that, which takes the decision key.
        try await client.act("pause", [:], key: brake)
        var s = try await client.snapshot()
        XCTAssertTrue(s.paused)
        do {
            try await client.act("resume", [:], key: brake)
            XCTFail("the brake key resumed")
        } catch {
            print("live: brake resume refused: \(error.localizedDescription)")
        }
        try await client.act("resume", [:], key: key)
        s = try await client.snapshot()
        XCTAssertFalse(s.paused)

        let request = try XCTUnwrap(s.requests.first)
        let (hash, _) = try await client.act("deny", ["request_id": request.id], key: brake)
        print("live: denied request \(request.id) in https://testnet.nearblocks.io/txns/\(hash)")
        s = try await client.snapshot()
        XCTAssertTrue(s.requests.isEmpty)
        XCTAssertTrue(s.log.contains { $0.event == "request_denied" })

        // The phone key is limited to Leash: moving the owner's USDC directly is refused by NEAR.
        do {
            _ = try await client.rpc.send([try FunctionCall(method: "ft_transfer", args: ["receiver_id": "vendor.testnet", "amount": "1"], deposit: 1)], to: Network.testnet.usdc, as: spec["owner"]!, key: key)
            XCTFail("the phone key moved tokens")
        } catch {
            print("live: token transfer refused: \(error.localizedDescription)")
        }

        let agent = try XCTUnwrap(s.activeAgents.first)
        try await client.act("revoke", ["public_key": agent.key], key: key)
        s = try await client.snapshot()
        XCTAssertFalse(s.agent(agent.key)!.policy.active)
    }
}
