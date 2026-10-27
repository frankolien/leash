import BackgroundTasks
import SwiftUI
import UserNotifications

@main
struct LeashApp: App {
    @UIApplicationDelegateAdaptor(AlertDelegate.self) private var delegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .tint(.white)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase

    var body: some View {
        Group {
            switch model.phase {
            case .unlinked: OnboardingView()
            case .linked: MainView()
            }
        }
        .overlay(alignment: .top) {
            if let notice = model.notice {
                Toast(notice: notice)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: notice.id) {
                        try? await Task.sleep(for: .seconds(3))
                        if model.notice == notice { model.notice = nil }
                    }
            }
        }
        .animation(.spring(duration: 0.35), value: model.notice)
        .sensoryFeedback(trigger: model.notice) { _, new in new.map { $0.failed ? .error : .success } }
        .onChange(of: phase, initial: true) { _, now in
            if now == .active, model.linked != nil { model.startRefreshing() } else { model.stopRefreshing() }
            if now == .background { AlertDelegate.schedule() }
        }
        .onChange(of: model.linked, initial: true) { _, linked in
            if linked != nil {
                model.startRefreshing()
                Task { await Alerts.shared.requestPermission() }
            }
        }
    }
}

struct MainView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("leash.tab") private var tab = "agents"

    var body: some View {
        TabView(selection: $tab) {
            Tab("Agents", systemImage: "person.2", value: "agents") { HomeView() }
                .badge(model.snapshot?.waiting ?? 0)
            Tab("Activity", systemImage: "list.bullet", value: "activity") { ActivityView() }
            Tab("Account", systemImage: "person.crop.circle", value: "account") { AccountView() }
        }
    }
}

/// Shows alerts while the app is open too, opens the request a tapped alert names, denies from
/// the alert itself, and checks for waiting requests when iOS lends the app background time.
final class AlertDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static let refreshTask = "com.frankolien.leash.refresh"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Alerts.registerCategories()
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshTask, using: nil) { task in
            Self.schedule()
            let work = Task { @MainActor in
                await AppModel().refresh()
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
        Self.schedule()
        return true
    }

    /// iOS decides when this runs, often rarely; the server's pushes are what make alerts prompt.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTask)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        guard let id = (info["request"] as? NSNumber)?.uint64Value else { return }
        if response.actionIdentifier == "DENY" {
            await AppModel().denyFromAlert(id)
            return
        }
        await MainActor.run { NotificationCenter.default.post(name: .leashOpenRequest, object: id) }
    }
}
