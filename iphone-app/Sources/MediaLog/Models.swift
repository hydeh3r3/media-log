import Foundation

enum EntryType: String, CaseIterable, Codable, Identifiable {
    case anime
    case article
    case book
    case film
    case game
    case manga
    case music
    case podcast
    case tv

    var id: String { rawValue }

    var label: String {
        switch self {
        case .anime: "Anime"
        case .article: "Article"
        case .book: "Book"
        case .film: "Film"
        case .game: "Game"
        case .manga: "Manga"
        case .music: "Music"
        case .podcast: "Podcast"
        case .tv: "TV Show"
        }
    }
}

struct MediaEntry: Codable, Identifiable, Equatable {
    var id: String
    var type: EntryType
    var title: String
    var date: String
    var createdAt: String
    var updatedAt: String
    var url: String?
    var rating: Int?
    var note: String?

    static func blank(today: Date = Date()) -> MediaEntry {
        let now = ISO8601DateFormatter.mediaLog.string(from: today)
        return MediaEntry(
            id: UUID().uuidString,
            type: .article,
            title: "",
            date: DateFormatter.mediaLogDay.string(from: today),
            createdAt: now,
            updatedAt: now
        )
    }
}

struct MediaWeek: Codable, Identifiable, Equatable {
    var weekStart: String
    var weekEnd: String
    var weekNumber: Int
    var year: Int
    var entries: [MediaEntry]

    var id: String { "\(year)-W\(String(format: "%02d", weekNumber))" }

    static func current(today: Date = Date()) -> MediaWeek {
        let info = ISOWeekInfo(date: today)
        return MediaWeek(
            weekStart: DateFormatter.mediaLogDay.string(from: info.start),
            weekEnd: DateFormatter.mediaLogDay.string(from: info.end),
            weekNumber: info.week,
            year: info.year,
            entries: []
        )
    }
}

struct EntryDraft: Codable, Equatable {
    var url: String
    var title: String
    var type: EntryType
    var date: String
    var rating: String
    var note: String
    var updatedAt: String
}

struct MediaLogSnapshot: Codable, Equatable {
    var currentWeek: MediaWeek?
    var history: [MediaWeek]
    var addDraft: EntryDraft?
    var tombstones: [String: String]

    static var empty: MediaLogSnapshot {
        MediaLogSnapshot(
            currentWeek: MediaWeek.current(),
            history: [],
            addDraft: nil,
            tombstones: [:]
        )
    }
}

enum SyncMode: String, CaseIterable, Codable, Identifiable {
    case supabase
    case local

    var id: String { rawValue }

    var label: String {
        switch self {
        case .supabase: "Supabase"
        case .local: "Local dev"
        }
    }
}

struct SyncConfig: Codable, Equatable {
    var mode: SyncMode
    var endpoint: String
    var userId: String
    var supabaseUrl: String
    var supabasePublishableKey: String
    var email: String

    static var empty: SyncConfig {
        SyncConfig(
            mode: .supabase,
            endpoint: "",
            userId: "personal",
            supabaseUrl: "",
            supabasePublishableKey: "",
            email: ""
        )
    }
}

struct SyncCredential: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date?
    var localToken: String
    var userEmail: String

    static var empty: SyncCredential {
        SyncCredential(
            accessToken: "",
            refreshToken: "",
            expiresAt: nil,
            localToken: "",
            userEmail: ""
        )
    }
}

struct SyncState: Codable, Equatable {
    var clientId: String
    var lastRevision: Int?
    var lastSyncedAt: String?
    var dirtyAt: String?
    var dirtyReason: String?

    static var fresh: SyncState {
        SyncState(
            clientId: UUID().uuidString,
            lastRevision: nil,
            lastSyncedAt: nil,
            dirtyAt: nil,
            dirtyReason: nil
        )
    }
}

struct StoredMediaLog: Codable, Equatable {
    var snapshot: MediaLogSnapshot
    var syncConfig: SyncConfig
    var syncState: SyncState

    static var empty: StoredMediaLog {
        StoredMediaLog(
            snapshot: .empty,
            syncConfig: .empty,
            syncState: .fresh
        )
    }
}
