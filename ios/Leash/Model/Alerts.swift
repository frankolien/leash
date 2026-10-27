import Foundation
import UserNotifications

/// Tells the owner when an agent is waiting on them. While the app runs it notices new requests
/// itself; pushes from the server cover the times it does not.
@MainActor
final class Alerts {
    static let shared = Alerts()
    private var seen: Set<String>

    private init() {
        seen = Set(UserDefaults.standard.stringArray(forKey: "leash.alerted") ?? [])
    }

    /// Approve opens the app on the request, where Face ID guards it; a notification button can
    /// only require an unlocked phone. Deny needs no more than that: saying no is always cheap.
    static func registerCategories() {
        let approve = UNNotificationAction(identifier: "APPROVE", title: "Review and approve", options: [.foreground, .authenticationRequired])
        let deny = UNNotificationAction(identifier: "DENY", title: "Deny", options: [.destructive, .authenticationRequired])
        let review = UNNotificationAction(identifier: "REVIEW", title: "Review", options: [.foreground])
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: "REQUEST", actions: [approve, deny], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "ASK", actions: [review], intentIdentifiers: [], options: []),
        ])
    }

    func requestPermission() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    }

    func noticeWaiting(_ s: Snapshot) {
        let ids = s.requests.map { "r\($0.id)" } + s.proposals.map { "p\($0.id)" }
        UNUserNotificationCenter.current().setBadgeCount(ids.count)
        let first = seen.isEmpty && UserDefaults.standard.object(forKey: "leash.alerted") == nil
        let fresh = ids.filter { !seen.contains($0) }
        seen = Set(ids)
        UserDefaults.standard.set(Array(seen), forKey: "leash.alerted")
        // The first read after linking finds old requests; those are on screen, not news.
        guard !first else { return }
        for r in s.requests where fresh.contains("r\(r.id)") {
            post(id: "r\(r.id)", title: "\(s.name(of: r.key)) wants to pay \(Money.usd(units(r.amount)))", body: "To \(r.to). \(r.reason.capitalizedFirst).", category: "REQUEST", info: ["request": r.id])
        }
        for p in s.proposals where fresh.contains("p\(p.id)") {
            post(id: "p\(p.id)", title: "\(s.name(of: p.key)) asks for more", body: p.note, category: "ASK", info: ["proposal": p.id])
        }
    }

    private func post(id: String, title: String, body: String, category: String, info: [String: Any]) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.categoryIdentifier = category
        content.interruptionLevel = .timeSensitive
        content.sound = .default
        content.userInfo = info
        content.threadIdentifier = "leash-waiting"
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
}
