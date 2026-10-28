import SwiftUI

/// Everything that happened, newest first and grouped by day, as the contract recorded it.
struct ActivityView: View {
    @Environment(AppModel.self) private var model
    var key: String?
    var title = "Activity"

    var body: some View {
        let feed = model.snapshot?.feed(key: key) ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if model.snapshot != nil, feed.isEmpty {
                    EmptyCard(system: "clock", title: "Nothing yet", line: "Payments, requests and your decisions show up here.").padding(.top, 12)
                }
                FeedList(feed: feed)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .background(Ink.ground)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
        .toolbarVisibility(.visible, for: .navigationBar)
        .refreshable { await model.refresh() }
    }
}

/// Feed rows under a heading per day: Today, Yesterday, then dates.
struct FeedList: View {
    let feed: [(entry: LogEntry, line: FeedLine)]

    var body: some View {
        let days = Dictionary(grouping: feed) { Calendar.current.startOfDay(for: $0.entry.at.nanoDate) }
        VStack(alignment: .leading, spacing: 0) {
            ForEach(days.keys.sorted(by: >), id: \.self) { day in
                Text(Self.heading(day)).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.muted)
                    .padding(.top, 22).padding(.bottom, 4)
                ForEach(Array(days[day]!.enumerated()), id: \.offset) { _, item in
                    FeedRow(entry: item.entry, line: item.line)
                }
            }
        }
    }

    static func heading(_ day: Date) -> String {
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }
}

/// One thing that happened: who, with a badge for how it ended, what, and the money if any moved.
struct FeedRow: View {
    let entry: LogEntry
    let line: FeedLine

    var body: some View {
        HStack(spacing: 14) {
            Avatar(actor: line.actor, badge: line.badge)
            VStack(alignment: .leading, spacing: 3) {
                Text(line.title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                if let detail = line.detail {
                    Text(detail).font(.system(size: 14)).foregroundStyle(Ink.muted).lineLimit(1)
                }
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                if let amount = line.amount, amount > 0 {
                    Text(amountText(amount))
                        .font(.system(size: 16, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(line.flow == .into ? Ink.good : line.flow == .out ? Ink.text : Ink.muted)
                }
                Text(entry.at.nanoDate.formatted(date: .omitted, time: .shortened)).font(.system(size: 13)).foregroundStyle(Ink.faint)
            }
            .fixedSize()
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func amountText(_ amount: Units) -> String {
        switch line.flow {
        case .out: "−" + Money.usd(amount)
        case .into: "+" + Money.usd(amount)
        case .held: Money.usd(amount)
        case .rate: "\(Money.short(amount))/day"
        }
    }
}
