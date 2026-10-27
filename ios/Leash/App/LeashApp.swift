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

/// Four screens under a floating, icons-only tab bar, as in PayBox. Each keeps its own
/// navigation so an agent's page opens over the screen it came from.
struct MainView: View {
    @Environment(AppModel.self) private var model
    @State private var nav = Navigator()

    var body: some View {
        ZStack(alignment: .bottom) {
            NavigationStack {
                Group {
                    switch nav.screen {
                    case .overview: OverviewView()
                    case .agents: AgentsView()
                    case .approvals: ApprovalsView()
                    case .activity: ActivityView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(Ink.ground)
                .toolbarVisibility(.hidden, for: .navigationBar)
                .navigationDestination(for: Agent.ID.self) { AgentDetailView(key: $0) }
            }
            TabBar(screen: $nav.screen, waiting: model.snapshot?.waiting ?? 0)
        }
        .sheet(item: $nav.request) { RequestSheet(request: $0) }
        .sheet(item: $nav.ask) { AskSheet(proposal: $0) }
        .sheet(item: $nav.sheet) { sheet in
            switch sheet {
            case .topUp: TopUpSheet()
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
            nav.screen = .approvals
            nav.request = model.snapshot?.requests.first { $0.id == id }
        }
        // Last, so the sheets above see it too.
        .environment(nav)
    }
}

struct TabBar: View {
    @Binding var screen: Navigator.Screen
    let waiting: Int

    private func icon(_ s: Navigator.Screen) -> String {
        switch s {
        case .overview: "chart.pie"
        case .agents: "person.2"
        case .approvals: "checkmark.circle"
        case .activity: "clock"
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Navigator.Screen.allCases, id: \.self) { s in
                Button { screen = s } label: {
                    Image(systemName: icon(s))
                        .font(.system(size: 21, weight: .light))
                        .foregroundStyle(Ink.text)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Capsule().fill(screen == s ? Ink.raised : .clear).padding(.horizontal, 6))
                        .overlay(alignment: .topTrailing) {
                            if s == .approvals, waiting > 0 {
                                Text("\(waiting)").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                                    .frame(minWidth: 18, minHeight: 18).background(Circle().fill(Ink.danger))
                                    .offset(x: -18, y: 4)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(s.rawValue.capitalized)
                .accessibilityAddTraits(screen == s ? .isSelected : [])
            }
        }
        .padding(5)
        .background(Capsule().fill(Ink.surface))
        .padding(.horizontal, 16)
        .padding(.bottom, 2)
        .animation(.easeOut(duration: 0.18), value: screen)
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
