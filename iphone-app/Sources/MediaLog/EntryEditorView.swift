import SwiftUI

struct EntryEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.medialogTheme) private var theme
    @Bindable var store: MediaLogStore
    @State private var entry: MediaEntry
    @State private var metadataStatus = ""
    @State private var lastSuggestedType: EntryType?
    @State private var manuallySelectedType = false
    @State private var lookupAttempt = 0
    private let isNewEntry: Bool

    init(store: MediaLogStore, entry: MediaEntry) {
        self.store = store
        _entry = State(initialValue: entry)
        isNewEntry = entry.title.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $entry.title)
                    TextField("URL", text: Binding(
                        get: { entry.url ?? "" },
                        set: { entry.url = $0.isEmpty ? nil : $0 }
                    ))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    Picker("Type", selection: $entry.type) {
                        ForEach(EntryType.allCases) { type in
                            Text(type.label).tag(type)
                        }
                    }
                    .onChange(of: entry.type) { _, newValue in
                        if newValue != lastSuggestedType { manuallySelectedType = true }
                    }
                    if isNewEntry && !(entry.url ?? "").isEmpty {
                        if !metadataStatus.isEmpty {
                            Text(metadataStatus)
                                .font(.footnote)
                                .foregroundStyle(theme.muted)
                        }
                        Button("Find type") { lookupAttempt += 1 }
                    }
                    TextField("Date", text: $entry.date)
                    Stepper(value: ratingBinding, in: 0...10) {
                        Text(ratingLabel)
                    }
                    TextField("Note", text: Binding(
                        get: { entry.note ?? "" },
                        set: { entry.note = $0.isEmpty ? nil : $0 }
                    ), axis: .vertical)
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.bg)
            .navigationTitle(entry.title.isEmpty ? "New Entry" : "Edit Entry")
            .task(id: "\(entry.url ?? "")|\(lookupAttempt)") {
                await fillMetadata()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(entry.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    /// Suggests a type for the current URL. Titles remain manually entered.
    @MainActor
    private func fillMetadata() async {
        guard isNewEntry else { return }
        let rawURL = (entry.url ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rawURL.isEmpty else { metadataStatus = ""; return }
        let originalType = entry.type
        do {
            try await Task.sleep(for: .milliseconds(500))
            metadataStatus = "Finding media type…"
            let suggestion = try await MediaMetadataLookup.fetch(rawURL)
            try Task.checkCancellation()
            guard rawURL == (entry.url ?? "").trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            if !manuallySelectedType, entry.type == originalType, let rawType = suggestion.type, let type = EntryType(rawValue: rawType) {
                lastSuggestedType = type
                entry.type = type
            }
            if !suggestion.pageLoaded {
                metadataStatus = "Could not read this page. Check the type."
            } else {
                metadataStatus = ""
            }
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            metadataStatus = "Enter a full web URL to find its media type."
        }
    }

    private var ratingBinding: Binding<Int> {
        Binding(
            get: { entry.rating ?? 0 },
            set: { entry.rating = $0 == 0 ? nil : $0 }
        )
    }

    private var ratingLabel: String {
        if let rating = entry.rating {
            return "Rating: \(rating)/10"
        }
        return "No rating"
    }

    private func save() {
        entry.title = entry.title.trimmingCharacters(in: .whitespacesAndNewlines)
        entry.updatedAt = ISO8601DateFormatter.mediaLog.string(from: Date())

        store.saveEntry(entry)
        dismiss()
    }
}
