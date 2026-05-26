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
