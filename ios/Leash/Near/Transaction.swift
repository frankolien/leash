import CryptoKit
import Foundation

/// A function call, the only action the phone's limited keys may sign.
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

/// What a key on an account may do: call some methods on one contract, or anything.
enum KeyPermission: Sendable, Equatable {
    case functionCall(receiver: String, methods: [String], allowance: UInt128?)
    case fullAccess
}

/// The actions the app signs. Adding and deleting keys need the owner's full key.
enum NearAction: Sendable {
    case call(FunctionCall)
    case addKey(publicKey: Data, permission: KeyPermission)
    case deleteKey(publicKey: Data)

    /// Borsh's index for each kind, in NEAR's own order.
    fileprivate func write(to w: inout BorshWriter) {
        switch self {
        case .call(let c):
            w.u8(2)
            w.string(c.method)
            w.bytes(c.args)
            w.u64(c.gas)
            w.u128(c.deposit)
        case .addKey(let key, let permission):
            w.u8(5)
            w.u8(0)
            w.fixed(key)
            w.u64(0)
            switch permission {
            case .functionCall(let receiver, let methods, let allowance):
                w.u8(0)
                if let allowance { w.u8(1); w.u128(allowance) } else { w.u8(0) }
                w.string(receiver)
                w.u32(UInt32(methods.count))
                methods.forEach { w.string($0) }
            case .fullAccess:
                w.u8(1)
            }
        case .deleteKey(let key):
            w.u8(6)
            w.u8(0)
            w.fixed(key)
        }
    }
}

struct NearTransaction: Sendable {
    let signerId: String
    let publicKey: Data
    let nonce: UInt64
    let receiverId: String
    let blockHash: Data
    let actions: [NearAction]

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
        for action in actions { action.write(to: &w) }
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
