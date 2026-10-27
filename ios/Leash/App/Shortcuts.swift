import AppIntents

/// "Hey Siri, pause my agents in Leash", and the same action for Shortcuts and the Action button.
struct LeashShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: PauseAgentsIntent(),
            phrases: ["Pause my agents in \(.applicationName)", "Pause \(.applicationName)", "Stop my agents in \(.applicationName)"],
            shortTitle: "Pause agents",
            systemImageName: "pause.circle"
        )
    }
}
