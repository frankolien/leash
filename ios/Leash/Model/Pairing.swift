import AuthenticationServices
import CryptoKit
import UIKit

/// Linking this phone to an owner's account. The web page at /link signs the owner in, shows the
/// same short code as the phone, and adds the phone's keys; it returns through leash://linked.
enum Pairing {
    private static let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")

    /// The six characters both this app and the web page derive from the key.
    static func code(for publicKey: String) -> String {
        let digest = Array(SHA256.hash(data: Data(publicKey.utf8)))
        let chars = digest.prefix(6).map { alphabet[Int($0 & 31)] }
        return String(chars.prefix(3)) + "-" + String(chars.suffix(3))
    }

    enum Provider: String { case google, apple, passkey }

    /// With no provider the page offers every way to sign in.
    static func url(site: URL, key: String, brake: String, owner: String, provider: Provider?) -> URL {
        var c = URLComponents(url: site.appending(path: "link"), resolvingAgainstBaseURL: false)!
        c.queryItems = [
            .init(name: "key", value: key),
            .init(name: "brake", value: brake),
            .init(name: "owner", value: owner),
            .init(name: "device", value: UIDevice.current.model),
            .init(name: "callback", value: "leash://linked"),
        ] + (provider.map { [.init(name: "provider", value: $0.rawValue)] } ?? [])
        return c.url!
    }

    typealias Linked = LinkedAccount

    enum Failure: LocalizedError {
        case cancelled, refused(String)
        var errorDescription: String? {
            switch self {
            case .cancelled: nil
            case .refused(let why): why
            }
        }
    }

    static func parse(callback: URL) throws -> Linked {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first { $0.name == name }?.value }
        if value("error") != nil { throw Failure.cancelled }
        guard let account = value("account"), !account.isEmpty else { throw Failure.refused("The link did not finish. Try again.") }
        return Linked(account: account, network: Network(rawValue: value("network") ?? "") ?? .testnet)
    }
}

/// Runs the web sign-in in Apple's secure browser sheet. It shares Safari's cookies, so a Google
/// account already signed in there is one tap.
@MainActor
final class WebSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            // The sheet can report twice (a result, then a cancel as it closes); only the first counts.
            let once = Once()
            let session = ASWebAuthenticationSession(url: url, callback: .customScheme("leash")) { callback, error in
                guard once.claim() else { return }
                if let callback { continuation.resume(returning: callback) }
                else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { continuation.resume(throwing: Pairing.Failure.cancelled) }
                else { continuation.resume(throwing: error ?? Pairing.Failure.cancelled) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
        }
    }
}

/// True the first time it is asked, false after, from any thread.
final class Once: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if done { return false }
        done = true
        return true
    }
}
