import Foundation
import Observation
import SwiftUI
import UserNotifications
import WidgetKit

/// The app's one store: which account this phone is linked to, the latest snapshot of it, and
/// the owner's decisions. A failed read keeps the last good snapshot on screen.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable { case unlinked, linked(Pairing.Linked) }

    private(set) var phase: Phase
    private(set) var snapshot: Snapshot?
    private(set) var loading = false
    private(set) var offline = false
    /// The decision in flight, by a short name, so its button can show progress.
    private(set) var busy: String?
    var notice: Notice?
    var linkProblem: String?

    struct Notice: Identifiable, Equatable {
        let id = UUID()
        let text: String
        let failed: Bool
    }

    private let defaults: UserDefaults
    private let keys: DeviceKeyStore
    private let brake: DeviceKeyStore
    private var refreshTask: Task<Void, Never>?
    /// Held for the whole sign-in, so the sheet is never torn down while it is still on screen.
    private var signIn: WebSignIn?

    init(defaults: UserDefaults = .standard, keys: DeviceKeyStore = .decision, brake: DeviceKeyStore = .brake) {
        self.defaults = defaults
        self.keys = keys
        self.brake = brake
        if let linked = Shared.linked {
            phase = .linked(linked)
            snapshot = SnapshotCache.load(account: linked.account, network: linked.network)
        } else {
            phase = .unlinked
        }
    }

    var linked: Pairing.Linked? { if case .linked(let l) = phase { l } else { nil } }
    var client: LeashClient? { linked.map { LeashClient(owner: $0.account, network: $0.network) } }

    /// Where the web app lives: set in Settings for a phone reaching a tunnel, else Info.plist's.
    var site: URL {
        get {
            let saved = defaults.string(forKey: "leash.site") ?? Bundle.main.object(forInfoDictionaryKey: "LeashSiteURL") as? String
            return URL(string: saved ?? "") ?? URL(string: "https://leash.frankolien.com")!
        }
        set { defaults.set(newValue.absoluteString, forKey: "leash.site") }
    }

    var publicKey: String? { try? keys.loadOrCreate().publicKey }
    var brakeKey: String? { try? brake.loadOrCreate().publicKey }
    var pairingCode: String { publicKey.map(Pairing.code(for:)) ?? "" }

    // MARK: Linking

    func link(with provider: Pairing.Provider) async {
        linkProblem = nil
        do {
            let key = try keys.loadOrCreate()
            let brakeKey = try brake.loadOrCreate()
            let sheet = WebSignIn()
            signIn = sheet
            defer { signIn = nil }
            let callback = try await sheet.start(Pairing.url(site: site, key: key.publicKey, brake: brakeKey.publicKey, provider: provider))
            let linked = try Pairing.parse(callback: callback)
            let access = try await NearRPC(url: linked.network.rpc).accessKey(account: linked.account, publicKey: key.publicKey)
            guard access.receiver == linked.network.contract else {
                throw Pairing.Failure.refused("That key is not limited to Leash, so the app will not use it.")
            }
            Shared.save(linked)
            snapshot = SnapshotCache.load(account: linked.account, network: linked.network)
            phase = .linked(linked)
            await refresh()
        } catch Pairing.Failure.cancelled {
        } catch {
            linkProblem = error.localizedDescription
        }
    }

    /// Forgets the account and the key on this phone. The key stays on the account until the
    /// owner removes it on the web; it can only make decisions, and nothing can use it any more.
    func unlink() {
        refreshTask?.cancel()
        keys.delete()
        brake.delete()
        Shared.save(nil as LinkedAccount?)
        defaults.removeObject(forKey: "leash.account")
        defaults.removeObject(forKey: "leash.network")
        snapshot = nil
        phase = .unlinked
    }

    // MARK: Reading

    func refresh() async {
        guard let client else { return }
        loading = true
        defer { loading = false }
        do {
            let fresh = try await client.snapshot()
            guard fresh.owner == linked?.account else { return }
            snapshot = fresh
            offline = false
            SnapshotCache.save(fresh)
            let summary = AgentSummary(fresh)
            if summary.waiting != Shared.summary()?.waiting || summary.paused != Shared.summary()?.paused || summary.spent != Shared.summary()?.spent {
                Shared.save(summary)
                WidgetCenter.shared.reloadAllTimelines()
            }
            Alerts.shared.noticeWaiting(fresh)
            LiveRequests.sync(fresh)
        } catch {
            offline = true
        }
    }

    /// Polls while the app is on screen; agents can park a request at any moment.
    func startRefreshing() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(6))
            }
        }
    }

    func stopRefreshing() { refreshTask?.cancel() }

    // MARK: Decisions

    /// Runs one decision. Those that spend or widen anything take Face ID and the decision key;
    /// stopping (`braking`) takes the brake key, which works from a locked phone too.
    private func decide(_ name: String, confirm reason: String?, braking: Bool = false, success: String, _ work: @escaping (LeashClient, NearKey) async throws -> Void) async -> Bool {
        guard let client, busy == nil else { return false }
        busy = name
        defer { busy = nil }
        do {
            if let reason { try await Presence.confirm(reason) }
            guard let key = try (braking ? brake.load() ?? keys.load() : keys.load()) else { throw Pairing.Failure.refused("This phone has no key. Link it again.") }
            try await work(client, key)
            notice = Notice(text: success, failed: false)
            await refresh()
            return true
        } catch {
            notice = Notice(text: error.localizedDescription, failed: true)
            await refresh()
            return false
        }
    }

    @discardableResult
    func approve(_ r: PayRequest) async -> Bool {
        await decide("approve-\(r.id)", confirm: "Approve \(Money.usd(units(r.amount))) to \(r.to)", success: "Paid \(r.to) \(Money.usd(units(r.amount)))") { c, k in
            _ = try await c.approve(r.id, key: k)
        }
    }

    @discardableResult
    func deny(_ r: PayRequest) async -> Bool {
        await decide("deny-\(r.id)", confirm: nil, braking: true, success: "Denied. Nothing moved.") { c, k in try await c.act("deny", ["request_id": r.id], key: k) }
    }

    /// Deny from the alert's own button, with no screen to report to: the result is a new alert.
    func denyFromAlert(_ id: UInt64) async {
        guard let client, let key = (try? brake.load()) ?? (try? keys.load()) else { return }
        let content = UNMutableNotificationContent()
        do {
            try await client.act("deny", ["request_id": id], key: key)
            content.title = "Denied. Nothing moved."
        } catch {
            content.title = "Could not deny"
            content.body = error.localizedDescription
        }
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "denied-\(id)", content: content, trigger: nil))
    }

    @discardableResult
    func grant(_ p: Proposal, forSecs: UInt64?) async -> Bool {
        var args: [String: Any] = ["proposal_id": p.id]
        if let forSecs { args["for_secs"] = forSecs }
        return await decide("grant-\(p.id)", confirm: "Raise this agent's limits", success: "Raised for a while") { c, k in try await c.act("grant", args, key: k) }
    }

    @discardableResult
    func dismiss(_ p: Proposal) async -> Bool {
        await decide("dismiss-\(p.id)", confirm: nil, success: "Dismissed") { c, k in try await c.act("dismiss_proposal", ["proposal_id": p.id], key: k) }
    }

    @discardableResult
    func pauseAll() async -> Bool {
        await decide("pause", confirm: nil, braking: true, success: "Every agent is paused") { c, k in try await c.act("pause", [:], key: k) }
    }

    @discardableResult
    func resume() async -> Bool {
        await decide("resume", confirm: "Let your agents pay again", success: "Your agents can pay again") { c, k in try await c.act("resume", [:], key: k) }
    }

    @discardableResult
    func revoke(_ a: Agent) async -> Bool {
        await decide("revoke-\(a.key)", confirm: "Revoke \(a.name)", success: "\(a.name) can no longer pay") { c, k in try await c.act("revoke", ["public_key": a.key], key: k) }
    }

    @discardableResult
    func endRaise(_ a: Agent) async -> Bool {
        await decide("end-\(a.key)", confirm: nil, success: "\(a.name) is back to its usual limits") { c, k in try await c.act("end_raise", ["public_key": a.key], key: k) }
    }
}

/// The last good snapshot per account and network, so a cold launch or a bad connection opens on
/// what the app knew rather than on nothing.
enum SnapshotCache {
    private static func file(_ account: String, _ network: Network) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "snapshots", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appending(path: "\(network.rawValue)-\(account).json")
    }

    static func load(account: String, network: Network) -> Snapshot? {
        (try? Data(contentsOf: file(account, network))).flatMap { try? JSONDecoder().decode(Snapshot.self, from: $0) }
    }

    static func save(_ s: Snapshot) {
        try? JSONEncoder().encode(s).write(to: file(s.owner, s.network), options: .atomic)
    }
}
