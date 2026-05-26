import Foundation

struct ISOWeekInfo {
    let week: Int
    let year: Int
    let start: Date
    let end: Date

    init(date: Date) {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt

        week = calendar.component(.weekOfYear, from: date)
        year = calendar.component(.yearForWeekOfYear, from: date)

        let components = DateComponents(
            calendar: calendar,
            timeZone: calendar.timeZone,
            weekday: 2,
            weekOfYear: week,
            yearForWeekOfYear: year
        )
        start = calendar.date(from: components) ?? date
        end = calendar.date(byAdding: .day, value: 6, to: start) ?? start
    }
}

extension DateFormatter {
    static let mediaLogDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .iso8601)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

extension ISO8601DateFormatter {
    nonisolated(unsafe) static let mediaLog: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

func timestampValue(_ value: String?) -> TimeInterval {
    guard let value, let date = ISO8601DateFormatter.mediaLog.date(from: value) else {
        return 0
    }
    return date.timeIntervalSince1970
}
