import CryptoKit
import Foundation

/// An ed25519 key pair in NEAR's terms. CryptoKit signs with Ed25519; its signatures are
/// randomised, which NEAR accepts like any valid signature.
struct NearKey: Sendable {
    let privateKey: Curve25519.Signing.PrivateKey

    init() { privateKey = .init() }

    init(seed: Data) throws { privateKey = try .init(rawRepresentation: seed) }

    var seed: Data { privateKey.rawRepresentation }
    var publicKeyData: Data { privateKey.publicKey.rawRepresentation }
    /// "ed25519:" and the base58 public key, the form RPC and the contract use.
    var publicKey: String { "ed25519:" + Base58.encode(publicKeyData) }

    func sign(_ message: Data) throws -> Data { try privateKey.signature(for: message) }
}
