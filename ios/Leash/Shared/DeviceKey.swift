import Foundation
import LocalAuthentication
import Security

/// The phone's own NEAR keys: made here, kept in the Keychain on this device only, and added to
/// the owner's account by the web's link page, limited to their decisions on Leash. Losing them
/// costs a re-link, never money.
///
/// Two keys, because stopping and spending deserve different locks. The decision key approves,
/// grants and resumes; it is readable only while the phone is unlocked and the app asks for Face
/// ID before using it. The brake key can only pause and deny, so it stays readable after the first
/// unlock, and Control Center, Siri or a notification's Deny can stop agents from a locked phone.
struct DeviceKeyStore: Sendable {
    enum Role: String, Sendable { case decision = "phone-key", brake = "brake-key" }

    var role: Role = .decision
    var service = "com.frankolien.leash.device"

    static let decision = DeviceKeyStore(role: .decision)
    static let brake = DeviceKeyStore(role: .brake)

    private var query: [String: Any] {
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: role.rawValue]
        if let group = Shared.keychainGroup { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    /// The saved key, or a new one saved now.
    func loadOrCreate() throws -> NearKey {
        if let key = try load() { return key }
        let key = NearKey()
        var insert = query
        insert[kSecValueData as String] = key.seed
        insert[kSecAttrAccessible as String] = role == .brake ? kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly : kSecAttrAccessibleWhenUnlockedThisDeviceOnly
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
