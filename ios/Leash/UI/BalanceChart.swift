import Charts
import SwiftUI

/// The vault over the last week or month, drawn like the web dashboard's chart: one black line, a
/// fading fill under it, a dot on today. Dragging across it reads out a day's balance above.
struct BalanceChart: View {
    let points: [(day: Date, balance: Units)]
    @Binding var selected: Date?

    var body: some View {
        let values = points.map { Double($0.balance) / Double(Money.unit) }
        let top = max(1, values.max() ?? 1)
        let low = values.min() ?? 0
        // A flat line sits in the middle rather than on the floor.
        let floor = top == low ? 0 : max(0, low - (top - low) * 0.35)
        Chart {
            ForEach(Array(points.enumerated()), id: \.offset) { _, p in
                AreaMark(x: .value("Day", p.day, unit: .day), yStart: .value("Floor", floor), yEnd: .value("Balance", Double(p.balance) / Double(Money.unit)))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(LinearGradient(colors: [Ink.text.opacity(0.12), Ink.text.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Day", p.day, unit: .day), y: .value("Balance", Double(p.balance) / Double(Money.unit)))
                    .interpolationMethod(.monotone)
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                    .foregroundStyle(Ink.text)
            }
            if let last = points.last, selected == nil {
                PointMark(x: .value("Day", last.day, unit: .day), y: .value("Balance", Double(last.balance) / Double(Money.unit)))
                    .symbolSize(70)
                    .foregroundStyle(Ink.text)
            }
            if let selected, let p = point(at: selected) {
                RuleMark(x: .value("Day", p.day, unit: .day))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .foregroundStyle(Ink.faint)
                PointMark(x: .value("Day", p.day, unit: .day), y: .value("Balance", Double(p.balance) / Double(Money.unit)))
                    .symbolSize(90)
                    .foregroundStyle(Ink.text)
            }
        }
        .chartYScale(domain: floor...(top * 1.08))
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: points.count > 10 ? 7 : 1)) { _ in
                AxisValueLabel(format: points.count > 10 ? .dateTime.day().month(.abbreviated) : .dateTime.weekday(.narrow))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Ink.faint)
            }
        }
        .chartYAxis(.hidden)
        .chartXSelection(value: $selected)
        .sensoryFeedback(.selection, trigger: selected.flatMap { point(at: $0)?.day })
    }

    func point(at date: Date) -> (day: Date, balance: Units)? {
        let day = Calendar.current.startOfDay(for: date)
        return points.first { Calendar.current.isDate($0.day, inSameDayAs: day) }
    }
}
