import SwiftUI

struct SyncSettingsView: View {
    @Bindable var store: MediaLogStore
    @State private var endpoint: String = ""
    @State private var userId: String = "personal"
    @State private var token: String = ""

    var body: some View {
        Form {
            Section("Connection") {
                TextField("Endpoint", text: $endpoint)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                TextField("User ID", text: $userId)
                    .textInputAutocapitalization(.never)
                SecureField("Token", text: $token)
                Button("Save Settings") {
                    store.saveSyncConfig(
                        SyncConfig(endpoint: endpoint, userId: userId.isEmpty ? "personal" : userId),
                        token: token
                    )
                }
            }

            Section("Status") {
                LabeledContent("Current entries", value: "\(store.snapshot.currentWeek?.entries.count ?? 0)")
                LabeledContent("Archived weeks", value: "\(store.snapshot.history.count)")
                LabeledContent("Last sync", value: store.syncState.lastSyncedAt ?? "Never")
                if let dirtyAt = store.syncState.dirtyAt {
                    LabeledContent("Local changes", value: dirtyAt)
                }
                if !store.syncStatus.isEmpty {
                    Text(store.syncStatus)
                }
                Button("Sync Now") {
                    Task {
                        await store.syncNow()
                    }
                }
                .disabled(endpoint.isEmpty || token.isEmpty)
            }
        }
        .navigationTitle("Sync")
        .onAppear {
            endpoint = store.syncConfig.endpoint
            userId = store.syncConfig.userId
            token = store.syncToken
        }
    }
}
