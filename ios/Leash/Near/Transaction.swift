import CryptoKit
import Foundation

/// One NEAR transaction carrying function calls, the only action the phone's key may sign.
struct FunctionCall: Sendable {
    let method: String
    let args: Data
    let gas: UInt64
    let deposit: UInt128

    static let defaultGas: UInt64 = 60_000_000_000_000

    init(method: String, args: [String: Any], gas: UInt64 = FunctionCall.defaultGas, deposit: UInt128 = 0) throws {
        self.method = method
        self.args = try JSONSerialization.data(withJSONObject: args, options: [.sortedKeys, .withoutEscapingSlashes])
        self.gas = gas
        self.deposit = deposit
    }

    init(method: String, rawArgs: Data, gas: UInt64 = FunctionCall.defaultGas, deposit: UInt128 = 0) {
        self.method = method
        self.args = rawArgs
        self.gas = gas
        self.deposit = deposit
    }
}

struct NearTransaction: Sendable {
    let signerId: String
    let publicKey: Data
    let nonce: UInt64
    let receiverId: String
    let blockHash: Data
    let actions: [FunctionCall]

    /// The Borsh bytes whose sha256 is what gets signed.
    var encoded: Data {
        var w = BorshWriter()
        w.string(signerId)
        w.u8(0)
        w.fixed(publicKey)
        w.u64(nonce)
        w.string(receiverId)
        w.fixed(blockHash)
        w.u32(UInt32(actions.count))
        for action in actions {
            w.u8(2)
            w.string(action.method)
            w.bytes(action.args)
            w.u64(action.gas)
            w.u128(action.deposit)
        }
        return w.data
    }

    var hash: Data { Data(SHA256.hash(data: encoded)) }

    func signed(with key: NearKey) throws -> Data {
        let signature = try key.sign(hash)
        var w = BorshWriter()
        w.fixed(encoded)
        w.u8(0)
        w.fixed(signature)
        return w.data
    }
}
