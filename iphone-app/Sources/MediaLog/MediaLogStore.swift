import Foundation
import Observation

@MainActor
@Observable
final class MediaLogStore {
    var snapshot: MediaLogSnapshot
    var syncConfig: SyncConfig
    var syncState: SyncState
    var syncStatus: String = ""

    private let fileURL: URL

    init(fileURL: URL = MediaLogStore.defaultFileURL()) {
        self.fileURL = fileURL

        if
            let data = try? Data(contentsOf: fileURL),
            let stored = try? JSONDecoder().decode(StoredMediaLog.self, from: data)
        {
            snapshot = stored.snapshot
            syncConfig = stored.syncConfig
            syncState = stored.syncState
        } else {
            let empty = StoredMediaLog.empty
            snapshot = empty.snapshot
            syncConfig = empty.syncConfig
            syncState = empty.syncState
        }

        ensureCurrentWeek()
    }

    static func defaultFileURL() -> URL {
        let baseURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return baseURL.appendingPathComponent("media-log.json")
    }

    var currentEntries: [MediaEntry] {
        snapshot.currentWeek?.entries ?? []
    }

    func save() {
        let stored = StoredMediaLog(
            snapshot: snapshot,
            syncConfig: syncConfig,
            syncState: syncState
        )
        guard let data = try? JSONEncoder.pretty.encode(stored) else {
            syncStatus = "Could not encode local data."
            return
        }

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: .atomic)
        } catch {
            syncStatus = error.localizedDescription
        }
    }

    func add(_ entry: MediaEntry) {
        ensureCurrentWeek()
        snapshot.currentWeek?.entries.append(entry)
        snapshot.currentWeek?.entries.sortByCreatedAt()
        markDirty("entry-added")
    }

    func update(_ entry: MediaEntry) {
        ensureCurrentWeek()
        guard let currentWeek = snapshot.currentWeek else { return }

        if let index = currentWeek.entries.firstIndex(where: { $0.id == entry.id }) {
            snapshot.currentWeek?.entries[index] = entry
            snapshot.currentWeek?.entries.sortByCreatedAt()
            markDirty("entry-edited")
        }
    }

    func delete(_ entry: MediaEntry) {
        ensureCurrentWeek()
        snapshot.currentWeek?.entries.removeAll { $0.id == entry.id }
        snapshot.tombstones[entry.id] = ISO8601DateFormatter.mediaLog.string(from: Date())
        markDirty("entry-deleted")
    }

    func archiveCurrentWeek() {
        ensureCurrentWeek()
        if let currentWeek = snapshot.currentWeek, !currentWeek.entries.isEmpty {
            snapshot.history.insert(currentWeek, at: 0)
        }
        snapshot.currentWeek = MediaWeek.current()
        markDirty("week-archived")
    }

    func saveSyncConfig(_ config: SyncConfig) {
        syncConfig = config
        save()
    }

    func syncNow() async {
        do {
            let client = SyncClient(config: syncConfig)
            let remote = try await client.fetchRecord()
            let merged = SyncMerge.merge(local: snapshot, remote: remote.data)
            let saved = try await client.push(snapshot: merged, clientId: syncState.clientId)
            snapshot = saved.data
            syncState.lastRevision = saved.revision
            syncState.lastSyncedAt = ISO8601DateFormatter.mediaLog.string(from: Date())
            syncState.dirtyAt = nil
            syncState.dirtyReason = nil
            syncStatus = "Synced revision \(saved.revision)."
            save()
        } catch {
            syncStatus = error.localizedDescription
        }
    }

    private func ensureCurrentWeek() {
        let current = MediaWeek.current()
        if snapshot.currentWeek == nil {
            snapshot.currentWeek = current
            save()
            return
        }

        if snapshot.currentWeek?.id == current.id {
            return
        }

        if let staleWeek = snapshot.currentWeek, !staleWeek.entries.isEmpty {
            snapshot.history.insert(staleWeek, at: 0)
        }
        snapshot.currentWeek = current
        markDirty("week-rollover")
    }

    private func markDirty(_ reason: String) {
        syncState.dirtyAt = ISO8601DateFormatter.mediaLog.string(from: Date())
        syncState.dirtyReason = reason
        save()
    }
}

extension JSONEncoder {
    static var pretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}

extension Array where Element == MediaEntry {
    mutating func sortByCreatedAt() {
        sort {
            timestampValue($0.createdAt) < timestampValue($1.createdAt)
        }
    }
}
