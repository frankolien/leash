import AppIntents
import SwiftUI
import WidgetKit

@main
struct LeashWidgetsBundle: WidgetBundle {
    var body: some Widget {
        StatusWidget()
        PauseControl()
        RequestLiveActivity()
    }
}

/// The brake in Control Center, on the Lock Screen and on the Action button.
struct PauseControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.frankolien.leash.pause") {
            ControlWidgetButton(action: PauseAgentsIntent()) {
                Label("Pause agents", systemImage: "pause.circle")
            }
        }
        .displayName("Pause agents")
        .description("Stops every agent from paying until you resume in Leash.")
    }
}

struct StatusEntry: TimelineEntry {
    let date: Date
    let summary: AgentSummary?
}

struct StatusProvider: TimelineProvider {
    func placeholder(in context: Context) -> StatusEntry {
        StatusEntry(date: .now, summary: AgentSummary(account: "you.near", spent: 4_200_000, daily: 10_000_000, waiting: 1, paused: false, firstWaiting: "claude wants $42.00", updated: .now))
    }

    func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) {
        completion(StatusEntry(date: .now, summary: Shared.summary() ?? placeholder(in: context).summary))
    }

    /// Reads the chain when iOS refreshes the widget, and falls back to what the app last saw.
    func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) {
        Task {
            var summary = Shared.summary()
            if let linked = Shared.linked, let fresh = try? await LeashClient(owner: linked.account, network: linked.network).snapshot() {
                summary = AgentSummary(fresh)
                Shared.save(summary!)
            }
            completion(Timeline(entries: [StatusEntry(date: .now, summary: summary)], policy: .after(.now.addingTimeInterval(15 * 60))))
        }
    }
}

struct StatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.frankolien.leash.status", provider: StatusProvider()) { entry in
            StatusView(entry: entry).containerBackground(.white, for: .widget)
        }
        .configurationDisplayName("Your agents")
        .description("What your agents spent today, what waits for you, and the brake.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct StatusView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StatusEntry

    private let ink = Color.black
    private let muted = Color(red: 0.48, green: 0.48, blue: 0.48)

    var body: some View {
        if let s = entry.summary {
            switch family {
            case .accessoryRectangular: lockScreen(s)
            case .systemMedium: medium(s)
            default: small(s)
            }
        } else {
            Text("Open Leash to link this iPhone.").font(.caption).foregroundStyle(muted)
        }
    }

    private func lockScreen(_ s: AgentSummary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(s.paused ? "Agents paused" : "\(Money.short(s.spent)) of \(Money.short(s.daily)) today").font(.headline)
            Text(s.waiting > 0 ? (s.firstWaiting ?? "\(s.waiting) waiting") : "Nothing waiting").font(.caption)
        }
    }

    private func small(_ s: AgentSummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Today").font(.system(size: 13)).foregroundStyle(muted)
            Text(Money.usd(s.spent)).font(.system(size: 26, weight: .bold)).foregroundStyle(ink).minimumScaleFactor(0.6).lineLimit(1)
            Text("of \(Money.short(s.daily))").font(.system(size: 13)).foregroundStyle(muted)
            Spacer(minLength: 4)
            waiting(s)
            brake(s)
        }
    }

    private func medium(_ s: AgentSummary) -> some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Spent today").font(.system(size: 13)).foregroundStyle(muted)
                Text(Money.usd(s.spent)).font(.system(size: 30, weight: .bold)).foregroundStyle(ink).minimumScaleFactor(0.6).lineLimit(1)
                Text("of \(Money.short(s.daily)) across your agents").font(.system(size: 13)).foregroundStyle(muted)
                Spacer(minLength: 4)
                waiting(s)
            }
            Spacer()
            VStack { Spacer(); brake(s) }.frame(width: 110)
        }
    }

    private func waiting(_ s: AgentSummary) -> some View {
        Text(s.waiting > 0 ? (s.firstWaiting ?? "\(s.waiting) waiting") : "Nothing waiting")
            .font(.system(size: 12, weight: s.waiting > 0 ? .semibold : .regular))
            .foregroundStyle(s.waiting > 0 ? ink : muted)
            .lineLimit(1)
    }

    @ViewBuilder
    private func brake(_ s: AgentSummary) -> some View {
        if s.paused {
            Text("Paused").font(.system(size: 13, weight: .semibold)).foregroundStyle(muted)
                .frame(maxWidth: .infinity, minHeight: 32)
                .background(Capsule().fill(Color(red: 0.92, green: 0.92, blue: 0.92)))
        } else {
            Button(intent: PauseAgentsIntent()) {
                Label("Pause", systemImage: "pause.fill").font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 32)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .background(Capsule().fill(ink))
        }
    }
}
