import AppIntents
import WidgetKit

/// Stops every agent with the brake key. Runs from Siri, Shortcuts, the Action button, Control
/// Center and the widget, without opening the app and without Face ID: stopping is always allowed.
struct PauseAgentsIntent: AppIntent {
    static let title: LocalizedStringResource = "Pause my agents"
    static let description = IntentDescription("Stops every agent from paying until you resume in Leash.")
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let linked = Shared.linked else { throw IntentError.notLinked }
        guard let key = try DeviceKeyStore.brake.load() else { throw IntentError.noBrake }
        let client = LeashClient(owner: linked.account, network: linked.network)
        try await client.act("pause", [:], key: key)
        if let s = Shared.summary() {
            Shared.save(AgentSummary(account: s.account, spent: s.spent, daily: s.daily, waiting: s.waiting, paused: true, firstWaiting: s.firstWaiting, updated: .now))
        }
        WidgetCenter.shared.reloadAllTimelines()
        ControlCenter.shared.reloadAllControls()
        return .result(dialog: "Every agent is paused. Nothing can be paid until you resume in Leash.")
    }
}

enum IntentError: Error, CustomLocalizedStringResourceConvertible {
    case notLinked, noBrake
    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notLinked: "Open Leash and link this iPhone first."
        case .noBrake: "This iPhone has no brake key. Link it again in Leash."
        }
    }
}
