import SwiftUI

struct SyncSettingsView: View {
    @Bindable var store: MediaLogStore
    @State private var mode: SyncMode = .supabase
    @State private var endpoint: String = ""
    @State private var userId: String = "personal"
    @State private var localToken: String = ""
    @State private var supabaseUrl: String = ""
    @State private var publishableKey: String = ""
    @State private var email: String = ""
    @State private var password: String = ""

    var body: some View {
        Form {
            Section("Connection") {
                Picker("Mode", selection: $mode) {
                    ForEach(SyncMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }

                if mode == .local {
                    TextField("Endpoint", text: $endpoint)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("Token", text: $localToken)
                } else {
                    TextField("Supabase URL", text: $supabaseUrl)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("Publishable key", text: $publishableKey)
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Password", text: $password)
                    Button("Sign In") {
                        saveSettings()
                        Task {
                            await store.signInToSupabase(password: password)
                            password = ""
                        }
                    }
                    .disabled(supabaseUrl.isEmpty || publishableKey.isEmpty || email.isEmpty || password.isEmpty)

                    Button("Sign Up") {
                        saveSettings()
                        Task {
                            await store.signUpToSupabase(password: password)
                            password = ""
                        }
                    }
                    .disabled(supabaseUrl.isEmpty || publishableKey.isEmpty || email.isEmpty || password.isEmpty)

                    Button("Reset Password") {
                        saveSettings()
                        Task {
                            await store.sendPasswordReset()
                            password = ""
                        }
                    }
                    .disabled(supabaseUrl.isEmpty || publishableKey.isEmpty || email.isEmpty)

                    Button("Sign Out") {
                        Task {
                            await store.signOutOfSupabase()
                        }
                    }
                    .disabled(store.syncCredential.accessToken.isEmpty)
                }

                TextField("User ID", text: $userId)
                    .textInputAutocapitalization(.never)

                Button("Save Settings") {
                    saveSettings()
                }
            }

            Section("Status") {
                LabeledContent("Current entries", value: "\(store.snapshot.currentWeek?.entries.count ?? 0)")
                LabeledContent("Archived weeks", value: "\(store.snapshot.history.count)")
                LabeledContent("Last sync", value: store.syncState.lastSyncedAt ?? "Never")
                LabeledContent("Auth", value: authStatus)
                if let dirtyAt = store.syncState.dirtyAt {
                    LabeledContent("Local changes", value: dirtyAt)
                }
                if !store.syncStatus.isEmpty {
                    Text(store.syncStatus)
                }
                Button("Sync Now") {
                    saveSettings()
                    Task {
                        await store.syncNow()
                    }
                }
                .disabled(syncDisabled)
            }
        }
        .navigationTitle("Sync")
        .onAppear {
            mode = store.syncConfig.mode
            endpoint = store.syncConfig.endpoint
            userId = store.syncConfig.userId
            localToken = store.syncCredential.localToken
            supabaseUrl = store.syncConfig.supabaseUrl
            publishableKey = store.syncConfig.supabasePublishableKey
            email = store.syncConfig.email.isEmpty ? store.syncCredential.userEmail : store.syncConfig.email
        }
    }

    private var authStatus: String {
        switch mode {
        case .local:
            localToken.isEmpty ? "No local token" : "Local token saved"
        case .supabase:
            store.syncCredential.accessToken.isEmpty
                ? "Not signed in"
                : "Signed in\(store.syncCredential.userEmail.isEmpty ? "" : " as \(store.syncCredential.userEmail)")"
        }
    }

    private var syncDisabled: Bool {
        switch mode {
        case .local:
            endpoint.isEmpty || localToken.isEmpty
        case .supabase:
            supabaseUrl.isEmpty || publishableKey.isEmpty || store.syncCredential.accessToken.isEmpty
        }
    }

    private func saveSettings() {
        let config = SyncConfig(
            mode: mode,
            endpoint: endpoint,
            userId: userId.isEmpty ? "personal" : userId,
            supabaseUrl: supabaseUrl,
            supabasePublishableKey: publishableKey,
            email: email
        )
        store.saveSyncConfig(config, localToken: localToken)
    }
}
