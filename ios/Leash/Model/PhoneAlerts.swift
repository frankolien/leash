import Foundation
import UIKit

/// This phone's place on the site's list of who to tell when an agent waits. Registering is a claim
/// signed with the brake key: it needs no Face ID, and being a key on the owner's account limited to
/// Leash is what proves the phone is the owner's. The site pushes; the app still checks for itself.
@MainActor
enum PhoneAlerts {
    private static let tokenKey = "leash.pushToken"
    private static let registeredKey = "leash.pushRegistered"

    /// Xcode builds get sandbox tokens; TestFlight and the App Store get production ones.
    #if DEBUG
    static let environment = "sandbox"
    #else
    static let environment = "production"
    #endif

    static var token: String? { UserDefaults.standard.string(forKey: tokenKey) }

    /// Each token iOS hands out; it is sent when it, or the account behind it, has changed.
    static func received(_ deviceToken: Data, site: URL) async {
        UserDefaults.standard.set(deviceToken.map { String(format: "%02x", $0) }.joined(), forKey: tokenKey)
        await register(site: site)
    }

    static func register(site: URL) async {
        guard let linked = Shared.linked, let token else { return }
        let stamp = "\(token)@\(linked.account)@\(linked.network.rawValue)"
        if UserDefaults.standard.string(forKey: registeredKey) == stamp { return }
        do {
            try await send("POST", site: site, linked: linked, token: token)
            UserDefaults.standard.set(stamp, forKey: registeredKey)
        } catch {
            // The next launch or token tries again.
        }
    }

    /// Before the phone's keys leave the account, since the brake key signs this too.
    static func forget(site: URL) async {
        defer { UserDefaults.standard.removeObject(forKey: registeredKey) }
        guard let linked = Shared.linked, let token else { return }
        try? await send("DELETE", site: site, linked: linked, token: token)
    }

    private static func send(_ method: String, site: URL, linked: LinkedAccount, token: String) async throws {
        guard let key = try DeviceKeyStore.brake.load() else { throw Problem.noBrake }
        let claim: [String: Any] = [
            "owner": linked.account, "network": linked.network.rawValue, "key": key.publicKey, "token": token,
            "environment": environment, "device": UIDevice.current.model,
            "expires_at": Int(Date().timeIntervalSince1970 * 1000) + 5 * 60 * 1000,
        ]
        // The site checks the signature over this exact text, so it is sent as it was signed.
        let text = String(decoding: try JSONSerialization.data(withJSONObject: claim, options: [.sortedKeys, .withoutEscapingSlashes]), as: UTF8.self)
        let signature = try key.sign(Data("leash-phone:\(text)".utf8)).base64EncodedString()
        var request = URLRequest(url: site.appending(path: "api/alerts"))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["claim": text, "signature": signature])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Problem.refused(String(decoding: data, as: UTF8.self)) }
    }

    enum Problem: Error { case noBrake, refused(String) }
}
