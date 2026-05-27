import Foundation
import Observation

@MainActor
@Observable
final class MediaLogStore {
    var snapshot: MediaLogSnapshot
    var syncConfig: SyncConfig
    var syncCredential: SyncCredential
    var syncState: SyncState
    var syncStatus: String = ""

    private let fileURL: URL
    private let credentialStore: KeychainCredentialStoring

    init(fileURL: URL = MediaLogStore.defaultFileURL(), credentialStore: KeychainCredentialStoring = KeychainCredentialStore()) {
        self.fileURL = fileURL
        self.credentialStore = credentialStore

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
        syncCredential = (try? credentialStore.readCredential()) ?? .empty

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
        saveEntry(entry)
    }

    func update(_ entry: MediaEntry) {
        saveEntry(entry)
    }

    func saveEntry(_ entry: MediaEntry) {
        ensureCurrentWeek()
        let existed = removeEntry(id: entry.id)
        snapshot.tombstones.removeValue(forKey: entry.id)
        placeEntry(entry)
        markDirty(existed ? "entry-edited" : "entry-added")
    }

    func delete(_ entry: MediaEntry) {
        ensureCurrentWeek()
        guard removeEntry(id: entry.id) else { return }
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

    func saveSyncConfig(_ config: SyncConfig, localToken: String? = nil) {
        syncConfig = config
        if let localToken {
            syncCredential.localToken = localToken
        }
        saveCredential()
        syncStatus = "Sync settings saved."
        save()
    }

    func signInToSupabase(password: String) async {
        do {
            let session = try await SupabaseAuthClient(config: syncConfig).signIn(password: password)
            syncCredential.accessToken = session.accessToken
            syncCredential.refreshToken = session.refreshToken
            syncCredential.expiresAt = session.expiresAt
            syncCredential.userEmail = session.userEmail
            saveCredential()
            syncStatus = "Signed in\(session.userEmail.isEmpty ? "." : " as \(session.userEmail).")"
            save()
        } catch {
            syncStatus = error.localizedDescription
        }
    }

    func signUpToSupabase(password: String) async {
        do {
            if let session = try await SupabaseAuthClient(config: syncConfig).signUp(password: password) {
                syncCredential.accessToken = session.accessToken
                syncCredential.refreshToken = session.refreshToken
                syncCredential.expiresAt = session.expiresAt
                syncCredential.userEmail = session.userEmail
                saveCredential()
                syncStatus = "Signed up\(session.userEmail.isEmpty ? "." : " as \(session.userEmail).")"
            } else {
                syncStatus = "Account created. Check your email to confirm it, then sign in."
            }
            save()
        } catch {
            syncStatus = error.localizedDescription
        }
    }

    func sendPasswordReset() async {
        do {
            try await SupabaseAuthClient(config: syncConfig).requestPasswordReset()
            syncStatus = "Password reset email sent."
            save()
        } catch {
            syncStatus = error.localizedDescription
        }
    }

    func signOutOfSupabase() async {
        if !syncCredential.accessToken.isEmpty {
            try? await SupabaseAuthClient(config: syncConfig).signOut(accessToken: syncCredential.accessToken)
        }
        syncCredential.accessToken = ""
        syncCredential.refreshToken = ""
        syncCredential.expiresAt = nil
        syncCredential.userEmail = ""
        saveCredential()
        syncStatus = "Signed out."
        save()
    }

    func syncNow() async {
        do {
            let token = try await syncTokenForRequest()
            let client = SyncClient(config: syncConfig, token: token)
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

    func syncUnlockCheckoutURL() async -> URL? {
        do {
            guard syncConfig.mode == .supabase else {
                throw SyncError.remote("Switch sync mode to Supabase first.")
            }

            let token = try await syncTokenForRequest()
            let checkoutUrl = try await SyncCheckoutClient(config: syncConfig, token: token).createCheckoutURL()
            syncStatus = "Checkout opened. Sync will unlock after payment."
            save()
            return checkoutUrl
        } catch {
            syncStatus = error.localizedDescription
            save()
            return nil
        }
    }

    private func syncTokenForRequest() async throws -> String {
        switch syncConfig.mode {
        case .local:
            guard !syncConfig.endpoint.isEmpty, !syncCredential.localToken.isEmpty else {
                throw SyncError.remote("Add a local endpoint and token first.")
            }
            return syncCredential.localToken
        case .supabase:
            guard !syncConfig.supabaseUrl.isEmpty, !syncConfig.supabasePublishableKey.isEmpty else {
                throw SyncError.remote("Add Supabase URL and publishable key first.")
            }
            if
                !syncCredential.accessToken.isEmpty,
                let expiresAt = syncCredential.expiresAt,
                expiresAt.timeIntervalSinceNow > 60
            {
                return syncCredential.accessToken
            }

            guard !syncCredential.refreshToken.isEmpty else {
                throw SyncError.remote("Sign in to Supabase first.")
            }

            let session = try await SupabaseAuthClient(config: syncConfig).refresh(refreshToken: syncCredential.refreshToken)
            syncCredential.accessToken = session.accessToken
            syncCredential.refreshToken = session.refreshToken
            syncCredential.expiresAt = session.expiresAt
            syncCredential.userEmail = session.userEmail
            saveCredential()
            return session.accessToken
        }
    }

    private func saveCredential() {
        do {
            try credentialStore.saveCredential(syncCredential)
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

    private func placeEntry(_ entry: MediaEntry) {
        let targetWeek = week(for: entry.date)

        if snapshot.currentWeek?.id == targetWeek.id {
            snapshot.currentWeek?.entries.append(entry)
            snapshot.currentWeek?.entries.sortByCreatedAt()
            return
        }

        if let historyIndex = snapshot.history.firstIndex(where: { $0.id == targetWeek.id }) {
            snapshot.history[historyIndex].entries.append(entry)
            snapshot.history[historyIndex].entries.sortByCreatedAt()
        } else {
            var week = targetWeek
            week.entries = [entry]
            snapshot.history.append(week)
        }
        sortHistory()
    }

    private func removeEntry(id: String) -> Bool {
        var removed = false

        if let entryIndex = snapshot.currentWeek?.entries.firstIndex(where: { $0.id == id }) {
            snapshot.currentWeek?.entries.remove(at: entryIndex)
            removed = true
        }

        for historyIndex in snapshot.history.indices.reversed() {
            guard let entryIndex = snapshot.history[historyIndex].entries.firstIndex(where: { $0.id == id }) else {
                continue
            }

            snapshot.history[historyIndex].entries.remove(at: entryIndex)
            removed = true

            if snapshot.history[historyIndex].entries.isEmpty {
                snapshot.history.remove(at: historyIndex)
            }
        }

        return removed
    }

    private func week(for dateString: String) -> MediaWeek {
        let date = DateFormatter.mediaLogDay.date(from: dateString) ?? Date()
        let info = ISOWeekInfo(date: date)
        return MediaWeek(
            weekStart: DateFormatter.mediaLogDay.string(from: info.start),
            weekEnd: DateFormatter.mediaLogDay.string(from: info.end),
            weekNumber: info.week,
            year: info.year,
            entries: []
        )
    }

    private func sortHistory() {
        snapshot.history.sort { left, right in
            left.year == right.year ? left.weekNumber > right.weekNumber : left.year > right.year
        }
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
