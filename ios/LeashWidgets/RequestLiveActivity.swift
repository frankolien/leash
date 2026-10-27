import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// A waiting payment on the Lock Screen and in the Dynamic Island: who, how much, to whom, and the
/// time left. Deny works from here; Review opens the app, where approving takes Face ID.
struct RequestLiveActivity: Widget {
    private let ink = Color(red: 0.098, green: 0.098, blue: 0.098)
    private let muted = Color(red: 0.48, green: 0.48, blue: 0.48)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RequestAttributes.self) { context in
            lockScreen(context)
                .padding(16)
                .activityBackgroundTint(.white)
                .activitySystemActionForegroundColor(ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.agent).font(.caption).foregroundStyle(.secondary)
                        Text(context.attributes.amount).font(.title2.bold())
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(context).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("to \(context.attributes.to) · \(context.attributes.reason)").font(.caption).lineLimit(1)
                        actions(context, dark: true)
                    }
                }
            } compactLeading: {
                Image(systemName: "hand.raised.fill")
            } compactTrailing: {
                Text(context.attributes.amount).font(.caption.bold())
            } minimal: {
                Image(systemName: "hand.raised.fill")
            }
            .widgetURL(URL(string: "leash://request/\(context.attributes.requestId)"))
        }
    }

    private func lockScreen(_ context: ActivityViewContext<RequestAttributes>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(context.attributes.agent) wants to pay").font(.subheadline).foregroundStyle(muted)
                    Text(context.attributes.amount).font(.system(size: 30, weight: .bold)).foregroundStyle(ink)
                }
                Spacer()
                countdown(context).font(.subheadline.monospacedDigit()).foregroundStyle(muted)
            }
            Text("to \(context.attributes.to) · \(context.attributes.reason)").font(.footnote).foregroundStyle(ink).lineLimit(1)
            actions(context, dark: false)
        }
    }

    @ViewBuilder
    private func countdown(_ context: ActivityViewContext<RequestAttributes>) -> some View {
        switch context.state.phase {
        case .waiting: Text(timerInterval: Date.now...max(.now, context.attributes.expires), countsDown: true)
        case .denied: Text("Denied")
        case .approved: Text("Approved")
        case .gone: Text("Decided")
        }
    }

    @ViewBuilder
    private func actions(_ context: ActivityViewContext<RequestAttributes>, dark: Bool) -> some View {
        if context.state.phase == .waiting {
            HStack(spacing: 8) {
                Button(intent: DenyRequestIntent(requestId: context.attributes.requestId)) {
                    Text("Deny").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 36)
                }
                .buttonStyle(.plain)
                .foregroundStyle(dark ? .white : ink)
                .background(Capsule().fill(dark ? Color.white.opacity(0.18) : Color(red: 0.92, green: 0.92, blue: 0.92)))
                Link(destination: URL(string: "leash://request/\(context.attributes.requestId)")!) {
                    Text("Review").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 36)
                }
                .foregroundStyle(dark ? ink : .white)
                .background(Capsule().fill(dark ? Color.white : ink))
            }
        }
    }
}
