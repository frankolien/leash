import CryptoKit
import XCTest
@testable import Leash

/// Vectors made with near-api-js 7.4 (the web app's library) from the seed 0x01...0x20.
final class NearTests: XCTestCase {
    let seed = Data((1...32).map(UInt8.init))
    let txHex = "0d0000006f6c69656e2e746573746e65740079b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664141a99be1c000000180000006c656173682e6672616e6b6f6c69656e2e746573746e657470716c490fc190fd8b1f52e6ec7dd450bc7d77dd7cd126b5c99dd2e3749ce608010000000207000000617070726f7665100000007b22726571756573745f6964223a377d00e057eb481b000000000000000000000000000000000000"

    func testPublicKeyMatchesNearApiJs() throws {
        XCTAssertEqual(try NearKey(seed: seed).publicKey, "ed25519:9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj")
    }

    func testBase58RoundTripsAndKeepsLeadingZeros() {
        let data = Data([0, 0, 1, 2, 250, 255])
        XCTAssertEqual(Base58.decode(Base58.encode(data)), data)
        XCTAssertEqual(Base58.encode(Data([0, 0])), "11")
        XCTAssertNil(Base58.decode("0OIl"))
    }

    func testTransactionBytesAndHashMatchNearApiJs() throws {
        let key = try NearKey(seed: seed)
        let tx = NearTransaction(
            signerId: "olien.testnet", publicKey: key.publicKeyData, nonce: 123_456_789_012,
            receiverId: "leash.frankolien.testnet", blockHash: Base58.decode("8ZvyVbJGKRK9yWLuhSsSpNaBGzGbGuSfWsnSRH8RsvT1")!,
            actions: [.call(try FunctionCall(method: "approve", args: ["request_id": 7], gas: 30_000_000_000_000))]
        )
        XCTAssertEqual(tx.encoded.map { String(format: "%02x", $0) }.joined(), txHex)
        XCTAssertEqual(tx.hash.map { String(format: "%02x", $0) }.joined(), "4f0c7cebb73a9344ac0c5e3370581f9b3c68f8c5bc6675ce261ac864770b176b")

        let signed = try tx.signed(with: key)
        XCTAssertEqual(signed.prefix(tx.encoded.count), tx.encoded)
        XCTAssertEqual(signed[tx.encoded.count], 0)
        let signature = signed.suffix(64)
        XCTAssertTrue(key.privateKey.publicKey.isValidSignature(signature, for: tx.hash))
    }

    func testKeyActionsMatchNearApiJs() throws {
        let key = try NearKey(seed: seed)
        let agent = NearKey.bytes(of: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp")!
        let tx = NearTransaction(
            signerId: "olien.testnet", publicKey: key.publicKeyData, nonce: 7,
            receiverId: "olien.testnet", blockHash: Base58.decode("8ZvyVbJGKRK9yWLuhSsSpNaBGzGbGuSfWsnSRH8RsvT1")!,
            actions: [
                .addKey(publicKey: agent, permission: .functionCall(receiver: "leash.frankolien.testnet", methods: ["pay", "request", "ask_more"], allowance: 250_000_000_000_000_000_000_000)),
                .addKey(publicKey: agent, permission: .fullAccess),
                .deleteKey(publicKey: agent),
            ]
        )
        XCTAssertEqual(tx.encoded.map { String(format: "%02x", $0) }.joined(), "0d0000006f6c69656e2e746573746e65740079b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad04966407000000000000000d0000006f6c69656e2e746573746e657470716c490fc190fd8b1f52e6ec7dd450bc7d77dd7cd126b5c99dd2e3749ce6080300000005004da7e0f4096aaf2ce55e371657cd3089ba1e9f59f4d6e27bd02e472a16a61dc100000000000000000001000040683bb3f386f034000000000000180000006c656173682e6672616e6b6f6c69656e2e746573746e6574030000000300000070617907000000726571756573740800000061736b5f6d6f726505004da7e0f4096aaf2ce55e371657cd3089ba1e9f59f4d6e27bd02e472a16a61dc100000000000000000106004da7e0f4096aaf2ce55e371657cd3089ba1e9f59f4d6e27bd02e472a16a61dc1")
    }

    func testSecretKeyIsSeedThenPublicKey() throws {
        let key = try NearKey(seed: seed)
        XCTAssertEqual(Base58.decode(String(key.secretKey.dropFirst(8))), seed + key.publicKeyData)
    }

    func testRpcErrorsReadAsSentences() {
        XCTAssertEqual(NearRPC.plain("Smart contract panicked: vault too low"), "Vault too low")
        XCTAssertEqual(NearRPC.plain("InvalidTxError: AccessKeyDoesNotExist"), "This phone is no longer linked to the account.")
    }
}

final class LeashModelTests: XCTestCase {
    func testPairingCodeMatchesTheWebPage() {
        XCTAssertEqual(Pairing.code(for: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"), "CQ3-6KM")
    }

    func testPairingCallback() throws {
        XCTAssertEqual(try Pairing.parse(callback: URL(string: "leash://linked?account=olien.testnet&network=testnet")!), .init(account: "olien.testnet", network: .testnet))
        XCTAssertThrowsError(try Pairing.parse(callback: URL(string: "leash://linked?error=cancelled")!))
    }

    func testMoney() {
        XCTAssertEqual(Money.usd(19_000_000), "$19.00")
        XCTAssertEqual(Money.usd(30_000), "$0.03")
        XCTAssertEqual(Money.usd(1_234_567_890), "$1,234.56789")
        XCTAssertEqual(Money.short(5_000_000), "$5")
        XCTAssertEqual(Money.parse("12.5"), 12_500_000)
        XCTAssertEqual(Money.parse("$0.000001"), 1)
        XCTAssertNil(Money.parse("1.2345678"))
        XCTAssertNil(Money.parse("abc"))
    }

    func testLookalikes() {
        XCTAssertEqual(Safety.lookalike(of: "vend0r.testnet", trusted: ["vendor.testnet"]), "vendor.testnet")
        XCTAssertEqual(Safety.lookalike(of: "o1ien.testnet", trusted: ["olien.testnet"]), "olien.testnet")
        XCTAssertNil(Safety.lookalike(of: "vendor.testnet", trusted: ["vendor.testnet"]))
        XCTAssertNil(Safety.lookalike(of: "alice.testnet", trusted: ["vendor.testnet"]))
        XCTAssertEqual(Safety.editDistance("kitten", "sitting"), 3)
        XCTAssertEqual(Safety.editDistance("", "abc"), 3)
    }

    func testAssessFlagsALookalikeOfSomeonePaidBefore() {
        let log = [LogEntry(at: 1, key: "k", event: "pay", to: "vendor.testnet", amount: "1000000", detail: nil)]
        let r = PayRequest(id: 1, owner: "o", key: "k", token: "t", to: "vend0r.testnet", amount: "5000000", memo: nil, reason: "over", created_at: 0, expires_at: 0)
        let checks = Safety.assess(r, agent: nil, log: log, facts: .init(exists: true, registered: true))
        XCTAssertTrue(checks.contains { $0.tone == .danger && $0.text.contains("looks like vendor.testnet") })
        XCTAssertTrue(checks.contains { $0.text.contains("Larger than any payment") })
    }

    func testContractPairsDecode() throws {
        let json = #"[["ed25519:abc",{"daily_cap":"5000000","per_payment_cap":"2000000","allow":[],"until":1}]]"#
        let pairs = try JSONDecoder().decode([Pair<Raise>].self, from: Data(json.utf8))
        XCTAssertEqual(pairs.first?.key, "ed25519:abc")
        XCTAssertEqual(pairs.first?.value.daily_cap, "5000000")
    }
}
