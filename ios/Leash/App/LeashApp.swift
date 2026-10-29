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
                .tint(Ink.text)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase

    var body: some View {
        Group {
            switch model.phase {
            case .unlinked: OnboardingView().preferredColorScheme(.dark)
            case .linked: MainView().preferredColorScheme(.light)
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

/// Three icon-only tabs in the system tab bar, which iOS 26 draws in Liquid Glass and tucks away
/// while scrolling. Each tab keeps its own navigation, so an agent's page opens over the tab it came from.
struct MainView: View {
    @Environment(AppModel.self) private var model
    @State private var nav = Navigator()

    var body: some View {
        TabView(selection: $nav.screen) {
            Tab(value: Navigator.Screen.overview) { stack { OverviewView() } } label: { Image(systemName: "chart.pie").accessibilityLabel("Home") }
            Tab(value: Navigator.Screen.agents) { stack { AgentsView() } } label: { Image(systemName: "person.2").accessibilityLabel("Agents") }
            Tab(value: Navigator.Screen.approvals) { stack { ApprovalsView() } } label: { Image(systemName: "checkmark.circle").accessibilityLabel("Approvals") }
                .badge(model.snapshot?.waiting ?? 0)
        }
        // Thin outlines, as before, rather than the filled symbols a tab bar picks by default.
        .environment(\.symbolVariants, .none)
        .minimizingTabBar()
        .sheet(item: $nav.request) { RequestSheet(request: $0) }
        .sheet(item: $nav.ask) { AskSheet(proposal: $0) }
        .sheet(item: $nav.sheet) { sheet in
            switch sheet {
            case .topUp: MoveMoneySheet(direction: .toVault)
            case .withdraw: MoveMoneySheet(direction: .toAccount)
            case .receive: AddMoneySheet()
            case .connect: ConnectSheet()
            case .settings: AccountView()
            }
        }
        .onChange(of: nav.screen) { _, screen in UserDefaults.standard.set(screen.rawValue, forKey: "leash.tab") }
        // leash://request/<id>, from a Live Activity's Review button.
        .onOpenURL { url in
            guard url.host() == "request", let id = UInt64(url.lastPathComponent) else { return }
            NotificationCenter.default.post(name: .leashOpenRequest, object: id)
        }
        .onReceive(NotificationCenter.default.publisher(for: .leashOpenRequest)) { note in
            guard let id = note.object as? UInt64 else { return }
            nav.request = model.snapshot?.requests.first { $0.id == id }
        }
        // Last, so the sheets above see it too.
        .environment(nav)
    }

    private func stack(@ViewBuilder _ root: () -> some View) -> some View {
        NavigationStack {
            root()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(Ink.ground)
                .toolbarVisibility(.hidden, for: .navigationBar)
                .navigationDestination(for: Agent.ID.self) { AgentDetailView(key: $0) }
        }
    }
}

extension View {
    @ViewBuilder func minimizingTabBar() -> some View {
        if #available(iOS 26.0, *) { tabBarMinimizeBehavior(.onScrollDown) } else { self }
    }
}

/// Shows alerts while the app is open too, opens the request a tapped alert names, denies from
/// the alert itself, hands the site this phone's push token, and checks for waiting requests when
/// a push or iOS itself wakes the app in the background.
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

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in await PhoneAlerts.received(deviceToken, site: AppModel().site) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Without a token the app still alerts for itself while it runs.
    }

    /// A push also wakes the app for a moment, so the Live Activity and the widget catch up before
    /// the owner even looks at the phone.
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler done: @escaping (UIBackgroundFetchResult) -> Void) {
        _ = Alerts.shared.alreadyShown(userInfo)
        Task { @MainActor in
            await AppModel().refresh()
            done(.newData)
        }
    }

    /// iOS decides when this runs, often rarely; the site's pushes are what make alerts prompt.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTask)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        if notification.request.trigger is UNPushNotificationTrigger, Alerts.shared.alreadyShown(notification.request.content.userInfo) { return [] }
        return [.banner, .sound, .list]
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
