import Foundation

enum SyncMerge {
    static func merge(local: MediaLogSnapshot, remote: MediaLogSnapshot?) -> MediaLogSnapshot {
        guard let remote else { return local }

        let tombstones = mergeTombstones(local.tombstones, remote.tombstones)
        var weeks: [String: MediaWeek] = [:]

        add(local.currentWeek, to: &weeks)
        local.history.forEach { add($0, to: &weeks) }
        add(remote.currentWeek, to: &weeks)
        remote.history.forEach { add($0, to: &weeks) }

        for key in weeks.keys {
            guard var week = weeks[key] else { continue }
            week.entries = mergeEntries(week.entries, tombstones: tombstones)
            weeks[key] = week
        }

        let currentKey = local.currentWeek?.id ?? remote.currentWeek?.id
        let currentWeek = currentKey.flatMap { weeks[$0] }
        let historyCandidates = weeks.filter { key, _ in
            key != currentKey
        }
        let unsortedHistory = historyCandidates.map { _, week in
            week
        }
        let history = unsortedHistory.sorted { left, right in
            if left.year == right.year {
                return left.weekNumber > right.weekNumber
            }
            return left.year > right.year
        }

        return MediaLogSnapshot(
            currentWeek: currentWeek,
            history: history,
            addDraft: newestDraft(local.addDraft, remote.addDraft),
            tombstones: tombstones
        )
    }

    private static func add(_ week: MediaWeek?, to weeks: inout [String: MediaWeek]) {
        guard let week else { return }
        if var existing = weeks[week.id] {
            existing.entries.append(contentsOf: week.entries)
            weeks[week.id] = existing
        } else {
            weeks[week.id] = week
        }
    }

    private static func mergeEntries(_ entries: [MediaEntry], tombstones: [String: String]) -> [MediaEntry] {
        var byId: [String: MediaEntry] = [:]
        for entry in entries {
            if let existing = byId[entry.id], timestampValue(existing.updatedAt) > timestampValue(entry.updatedAt) {
                continue
            }
            byId[entry.id] = entry
        }

        return byId.values
            .filter { entry in
                guard let deletedAt = tombstones[entry.id] else { return true }
                return timestampValue(deletedAt) < timestampValue(entry.updatedAt)
            }
            .sorted { timestampValue($0.createdAt) < timestampValue($1.createdAt) }
    }

    private static func mergeTombstones(_ local: [String: String], _ remote: [String: String]) -> [String: String] {
        var merged = remote
        for (id, deletedAt) in local {
            if timestampValue(deletedAt) >= timestampValue(merged[id]) {
                merged[id] = deletedAt
            }
        }
        return merged
    }

    private static func newestDraft(_ local: EntryDraft?, _ remote: EntryDraft?) -> EntryDraft? {
        guard let local else { return remote }
        guard let remote else { return local }
        return timestampValue(local.updatedAt) >= timestampValue(remote.updatedAt) ? local : remote
    }
}
