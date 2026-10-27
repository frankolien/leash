import ActivityKit
import AppIntents
import Foundation

/// One parked payment, live on the Lock Screen and in the Dynamic Island until it is decided or
/// expires. Shared by the app, which starts and ends it, and the widget extension, which draws it.
struct RequestAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Phase: String, Codable { case waiting, denied, approved, gone }
        var phase: Phase
    }

    let requestId: UInt64
    let agent: String
    let amount: String
    let to: String
    let reason: String
    let expires: Date
}

/// Deny straight from the Live Activity, with the brake key. Approving opens the app instead,
/// because that takes Face ID.
struct DenyRequestIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Deny request"
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

    @Parameter(title: "Request") var requestId: Int

    init() {}
    init(requestId: UInt64) { self.requestId = Int(requestId) }

    func perform() async throws -> some IntentResult {
        guard let linked = Shared.linked else { throw IntentError.notLinked }
        guard let key = try DeviceKeyStore.brake.load() else { throw IntentError.noBrake }
        try await LeashClient(owner: linked.account, network: linked.network).act("deny", ["request_id": requestId], key: key)
        for activity in Activity<RequestAttributes>.activities where activity.attributes.requestId == UInt64(requestId) {
            await activity.end(.init(state: .init(phase: .denied), staleDate: nil), dismissalPolicy: .after(.now.addingTimeInterval(8)))
        }
        return .result()
    }
}
