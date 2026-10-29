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

    /// The owner key's public half once the chain confirms it is a full key on the account; nil on
    /// a phone linked before it carried one, which can still decide but not fund or add agents.
    private(set) var ownerKey: String?

    private let defaults: UserDefaults
    private let keys: DeviceKeyStore
    private let brake: DeviceKeyStore
    private let owner: DeviceKeyStore
    private var refreshTask: Task<Void, Never>?
    /// Held for the whole sign-in, so the sheet is never torn down while it is still on screen.
    private var signIn: WebSignIn?

    init(defaults: UserDefaults = .standard, keys: DeviceKeyStore = .decision, brake: DeviceKeyStore = .brake, owner: DeviceKeyStore = .owner) {
        self.defaults = defaults
        self.keys = keys
        self.brake = brake
        self.owner = owner
        ownerKey = defaults.string(forKey: "leash.ownerKey")
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

    /// Signs in on the web and has it add this phone's keys. A phone already linked comes back
    /// through here for the full key; the page skips the keys the account already has.
    func link(with provider: Pairing.Provider?) async {
        linkProblem = nil
        do {
            let key = try keys.loadOrCreate()
            let brakeKey = try brake.loadOrCreate()
            let ownerPublic = try owner.publicKeyOrCreate()
            let sheet = WebSignIn()
            signIn = sheet
            defer { signIn = nil }
            let callback = try await sheet.start(Pairing.url(site: site, key: key.publicKey, brake: brakeKey.publicKey, owner: ownerPublic, provider: provider))
            let linked = try Pairing.parse(callback: callback)
            let rpc = NearRPC(url: linked.network.rpc)
            let access = try await rpc.accessKey(account: linked.account, publicKey: key.publicKey)
            guard access.receiver == linked.network.contract else {
                throw Pairing.Failure.refused("That key is not limited to Leash, so the app will not use it.")
            }
            let full = try? await rpc.accessKey(account: linked.account, publicKey: ownerPublic)
            ownerKey = full != nil && full?.receiver == nil ? ownerPublic : nil
            defaults.set(ownerKey, forKey: "leash.ownerKey")
            Shared.save(linked)
            snapshot = SnapshotCache.load(account: linked.account, network: linked.network)
            phase = .linked(linked)
            await refresh()
            await PhoneAlerts.register(site: site)
        } catch Pairing.Failure.cancelled {
        } catch {
            linkProblem = error.localizedDescription
        }
    }

    /// The full key, fetched with one more sign-in on a phone linked before it carried one.
    func ensureOwnerKey() async -> Bool {
        if ownerKey == nil { await link(with: nil) }
        return ownerKey != nil
    }

    /// Takes this phone's keys off the account, signed with its own full key, then forgets them. A
    /// phone without one can only forget; its keys stay until removed in Settings on the web.
    func unlink() async {
        await PhoneAlerts.forget(site: site)
        if let client, ownerKey != nil {
            busy = "unlink"
            defer { busy = nil }
            do {
                guard let key = try await owner.unlock("Remove this iPhone's keys from \(client.owner)") else { throw Pairing.Failure.refused("This phone has no full key.") }
                try await client.deleteKeys(Set([try? keys.load()?.publicKey, try? brake.load()?.publicKey, key.publicKey].compactMap { $0 }), key: key)
            } catch {
                notice = Notice(text: error.localizedDescription, failed: true)
                return
            }
        }
        forget()
    }

    private func forget() {
        refreshTask?.cancel()
        keys.delete()
        brake.delete()
        owner.delete()
        ownerKey = nil
        defaults.removeObject(forKey: "leash.ownerKey")
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

    enum Signer { case decision, brake, owner }

    /// Runs one decision. Those that spend or widen anything take Face ID and the decision key;
    /// stopping takes the brake key, which works from a locked phone too; funding and adding agents
    /// take the full key, which the Keychain releases only after Face ID.
    private func decide(_ name: String, confirm reason: String?, signer: Signer = .decision, success: String, _ work: @escaping (LeashClient, NearKey) async throws -> Void) async -> Bool {
        guard let client, busy == nil else { return false }
        busy = name
        defer { busy = nil }
        do {
            let key: NearKey?
            switch signer {
            case .owner:
                key = try await owner.unlock(reason ?? "Use your account")
            case .brake:
                key = try brake.load() ?? keys.load()
            case .decision:
                if let reason { try await Presence.confirm(reason) }
                key = try keys.load()
            }
            guard let key else { throw Pairing.Failure.refused(signer == .owner ? "Unlock this iPhone in Settings first." : "This phone has no key. Link it again.") }
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
        await decide("deny-\(r.id)", confirm: nil, signer: .brake, success: "Denied. Nothing moved.") { c, k in try await c.act("deny", ["request_id": r.id], key: k) }
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
        await decide("pause", confirm: nil, signer: .brake, success: "Every agent is paused") { c, k in try await c.act("pause", [:], key: k) }
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

    /// New limits for an agent. The contract starts its day over, as it does for any new policy.
    @discardableResult
    func setLimits(_ a: Agent, daily: Units, perPayment: Units, allowlist: [String]) async -> Bool {
        let policy = LeashClient.policy(name: a.name, token: a.policy.token, daily: daily, perPayment: perPayment, allowlist: allowlist, cooldown: a.policy.cooldown_secs, expires: a.policy.expires_at)
        return await decide("limits-\(a.key)", confirm: "Change \(a.name)'s limits", success: "\(a.name) now pays up to \(Money.short(perPayment)) alone, \(Money.short(daily)) a day") { c, k in
            try await c.act("set_policy", ["public_key": a.key, "policy": policy], key: k)
        }
    }

    // MARK: The account, with the full key

    /// USDC from the account into the vault agents spend from.
    @discardableResult
    func topUp(_ amount: Units) async -> Bool {
        guard let token = snapshot?.token else { return false }
        return await decide("topup", confirm: "Add \(Money.usd(amount)) to the vault", signer: .owner, success: "Added \(Money.usd(amount)) to the vault") { c, k in
            try await c.topUp(amount, token: token, key: k)
        }
    }

    /// USDC from the vault back to the account.
    @discardableResult
    func withdraw(_ amount: Units) async -> Bool {
        guard let token = snapshot?.token else { return false }
        return await decide("withdraw", confirm: "Take \(Money.usd(amount)) out of the vault", success: "Moved \(Money.usd(amount)) to your account") { c, k in
            try await c.withdraw(amount, token: token, key: k)
        }
    }

    /// A new agent: its own key on the account, limited to paying through Leash, and its limits.
    /// Returns the key file the agent keeps; the phone does not keep it.
    func createAgent(name: String, daily: Units, perPayment: Units, allowlist: [String]) async -> AgentKeyFile? {
        guard let token = snapshot?.token ?? linked?.network.usdc else { return nil }
        var made: AgentKeyFile?
        _ = await decide("create", confirm: "Add \(name) as an agent", signer: .owner, success: "\(name) is on a leash") { c, k in
            made = try await c.createAgent(name: name, token: token, daily: daily, perPayment: perPayment, allowlist: allowlist, relay: self.site.appending(path: "api/relay"), key: k)
        }
        return made
    }

    /// Every key on the account, for Settings.
    func accountKeys() async -> [(publicKey: String, permission: KeyPermission)]? {
        try? await client?.rpc.accessKeys(account: client!.owner)
    }

    var phoneKeys: Set<String> { Set([publicKey, brakeKey, ownerKey].compactMap { $0 }) }
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
