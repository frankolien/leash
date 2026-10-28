import Foundation
import LocalAuthentication
import Security

/// The phone's own NEAR keys: made here, kept in the Keychain on this device only, and added to
/// the owner's account by the web's link page, limited to their decisions on Leash. Losing them
/// costs a re-link, never money.
///
/// Three keys, because stopping, deciding and owning deserve different locks. The decision key
/// approves, grants and resumes; it is readable only while the phone is unlocked and the app asks
/// for Face ID before using it. The brake key can only pause and deny, so it stays readable after
/// the first unlock, and Control Center, Siri or a notification's Deny can stop agents from a
/// locked phone. The owner key is a full key to the account, for topping up, adding agents and
/// unlinking: the Keychain itself refuses to hand it over without Face ID or the passcode, and it
/// stays out of the group the widgets share.
struct DeviceKeyStore: Sendable {
    enum Role: String, Sendable { case decision = "phone-key", brake = "brake-key", owner = "owner-key" }

    var role: Role = .decision
    var service = "com.frankolien.leash.device"

    static let decision = DeviceKeyStore(role: .decision)
    static let brake = DeviceKeyStore(role: .brake)
    static let owner = DeviceKeyStore(role: .owner)

    private var query: [String: Any] {
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: role.rawValue]
        if role != .owner, let group = Shared.keychainGroup { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    /// The saved key, or a new one saved now. Not for the owner key, which needs Face ID to read.
    func loadOrCreate() throws -> NearKey {
        if let key = try load() { return key }
        return try create()
    }

    /// The owner key's public half, making the key first if the phone has none. A leftover key
    /// whose public half was never recorded can't be named without Face ID, so it is replaced; it
    /// was never confirmed on the account.
    func publicKeyOrCreate() throws -> String {
        if let existing = publicKey() { return existing }
        delete()
        let key = try create()
        UserDefaults.standard.set(key.publicKey, forKey: Self.ownerPublicKey)
        return key.publicKey
    }

    /// Kept outside the locked item: the Keychain won't even list an item behind Face ID without
    /// asking, and a public key is no secret.
    func publicKey() -> String? { UserDefaults.standard.string(forKey: Self.ownerPublicKey) }

    private static let ownerPublicKey = "leash.ownerKeyPublic"

    private func create() throws -> NearKey {
        let key = NearKey()
        var insert = query
        insert[kSecValueData as String] = key.seed
        if role == .owner {
            if let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .userPresence, nil) {
                insert[kSecAttrAccessControl as String] = access
            }
        } else {
            insert[kSecAttrAccessible as String] = role == .brake ? kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly : kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        }
        var status = SecItemAdd(insert as CFDictionary, nil)
        // A phone with no passcode (a simulator, say) cannot lock an item to presence; the app's
        // own Face ID check still stands in front of every use.
        if status != errSecSuccess, role == .owner {
            insert[kSecAttrAccessControl as String] = nil
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(insert as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeyError.keychain(status) }
        return key
    }

    /// The key, after Face ID or the passcode has been given for `reason`; one prompt either way.
    func unlock(_ reason: String) async throws -> NearKey? {
        let context = try await Presence.confirmed(reason)
        return try load(context: context)
    }

    func load(context: LAContext? = nil) throws -> NearKey? {
        var q = query
        q[kSecReturnData as String] = true
        if let context { q[kSecUseAuthenticationContext as String] = context }
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw KeyError.keychain(status) }
        return try NearKey(seed: data)
    }

    func delete() {
        SecItemDelete(query as CFDictionary)
        if role == .owner { UserDefaults.standard.removeObject(forKey: Self.ownerPublicKey) }
    }

    enum KeyError: LocalizedError {
        case keychain(OSStatus)
        var errorDescription: String? {
            switch self {
            case .keychain(errSecUserCanceled), .keychain(errSecAuthFailed): "Face ID was cancelled."
            case .keychain(let status): "The phone's key could not be read (\(status))."
            }
        }
    }
}

/// Face ID, or the passcode when Face ID is unavailable, before the phone signs a decision that
/// spends or widens anything. Pausing never asks: stopping should always be one tap.
enum Presence {
    static func confirm(_ reason: String) async throws {
        _ = try await confirmed(reason)
    }

    /// A context that has seen Face ID, for the Keychain to accept without asking again.
    static func confirmed(_ reason: String) async throws -> LAContext {
        let context = LAContext()
        context.localizedReason = reason
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return context }
        try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        return context
    }
}
