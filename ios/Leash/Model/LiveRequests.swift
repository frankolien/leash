import ActivityKit
import Foundation

/// Keeps one Live Activity per waiting request: starts one when an agent parks a payment while the
/// app is open, and ends it once the request is no longer waiting.
@MainActor
enum LiveRequests {
    static func sync(_ s: Snapshot) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let waiting = Dictionary(uniqueKeysWithValues: s.requests.map { ($0.id, $0) })
        let running = Activity<RequestAttributes>.activities
        for activity in running where waiting[activity.attributes.requestId] == nil && activity.content.state.phase == .waiting {
            Task { await activity.end(.init(state: .init(phase: .gone), staleDate: nil), dismissalPolicy: .after(.now.addingTimeInterval(8))) }
        }
        let shown = Set(running.map(\.attributes.requestId))
        for r in s.requests where !shown.contains(r.id) && r.expires_at.nanoDate > .now {
            let attributes = RequestAttributes(requestId: r.id, agent: s.name(of: r.key), amount: Money.usd(units(r.amount)), to: r.to, reason: r.reason.capitalizedFirst, expires: r.expires_at.nanoDate)
            _ = try? Activity.request(attributes: attributes, content: .init(state: .init(phase: .waiting), staleDate: r.expires_at.nanoDate), pushType: nil)
        }
    }
}
