import SwiftUI

struct EntryEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var store: MediaLogStore
    @State private var entry: MediaEntry

    init(store: MediaLogStore, entry: MediaEntry) {
        self.store = store
        _entry = State(initialValue: entry)
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
                    Picker("Type", selection: $entry.type) {
                        ForEach(EntryType.allCases) { type in
                            Text(type.label).tag(type)
                        }
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
            .navigationTitle(entry.title.isEmpty ? "New Entry" : "Edit Entry")
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
