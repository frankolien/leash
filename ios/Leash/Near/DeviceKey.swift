import Foundation
import LocalAuthentication
import Security

/// The phone's own NEAR key: made here, kept in the Keychain on this device only, and added to
/// the owner's account by the web's link page as a key limited to their decisions on Leash. Each
/// signature asks for Face ID first; losing the key costs a re-link, never money.
struct DeviceKeyStore: Sendable {
    var service = "com.frankolien.leash.device"
    private let account = "phone-key"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    /// The saved key, or a new one saved now.
    func loadOrCreate() throws -> NearKey {
        if let key = try load() { return key }
        let key = NearKey()
        var insert = query
        insert[kSecValueData as String] = key.seed
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(insert as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeyError.keychain(status) }
        return key
    }

    func load() throws -> NearKey? {
        var q = query
        q[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw KeyError.keychain(status) }
        return try NearKey(seed: data)
    }

    func delete() { SecItemDelete(query as CFDictionary) }

    enum KeyError: LocalizedError {
        case keychain(OSStatus)
        var errorDescription: String? {
            switch self { case .keychain(let status): "The phone's key could not be read (\(status))." }
        }
    }
}

/// Face ID, or the passcode when Face ID is unavailable, before the phone signs a decision that
/// spends or widens anything. Pausing never asks: stopping should always be one tap.
enum Presence {
    static func confirm(_ reason: String) async throws {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return }
        try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
    }
}
