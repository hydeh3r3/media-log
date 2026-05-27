import SwiftUI

struct ContentView: View {
    @Bindable var store: MediaLogStore
    @State private var editorEntry: MediaEntry?

    var body: some View {
        TabView {
            NavigationStack {
                WeekView(store: store, editorEntry: $editorEntry)
            }
            .tabItem { Label("Week", systemImage: "calendar") }

            NavigationStack {
                HistoryView(store: store, editorEntry: $editorEntry)
            }
            .tabItem { Label("History", systemImage: "clock") }

            NavigationStack {
                SyncSettingsView(store: store)
            }
            .tabItem { Label("Sync", systemImage: "arrow.triangle.2.circlepath") }
        }
        .sheet(item: $editorEntry) { entry in
            EntryEditorView(store: store, entry: entry)
        }
    }
}

struct WeekView: View {
    @Bindable var store: MediaLogStore
    @Binding var editorEntry: MediaEntry?

    var body: some View {
        List {
            if let week = store.snapshot.currentWeek {
                Section {
                    ForEach(week.entries) { entry in
                        EntryRow(entry: entry)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                editorEntry = entry
                            }
                    }
                    .onDelete { offsets in
                        for index in offsets {
                            store.delete(week.entries[index])
                        }
                    }
                } header: {
                    Text("Week \(week.weekNumber), \(week.year)")
                }
            }
        }
        .overlay {
            if store.currentEntries.isEmpty {
                ContentUnavailableView("No entries yet", systemImage: "square.and.pencil")
            }
        }
        .navigationTitle("This Week")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Archive") {
                    store.archiveCurrentWeek()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    editorEntry = .blank()
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add Entry")
            }
        }
    }
}

struct HistoryView: View {
    @Bindable var store: MediaLogStore
    @Binding var editorEntry: MediaEntry?

    var body: some View {
        List {
            ForEach(store.snapshot.history) { week in
                Section("Week \(week.weekNumber), \(week.year)") {
                    ForEach(week.entries) { entry in
                        EntryRow(entry: entry)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                editorEntry = entry
                            }
                    }
                    .onDelete { offsets in
                        for index in offsets {
                            store.delete(week.entries[index])
                        }
                    }
                }
            }
        }
        .overlay {
            if store.snapshot.history.isEmpty {
                ContentUnavailableView("No archived weeks", systemImage: "archivebox")
            }
        }
        .navigationTitle("History")
    }
}

struct EntryRow: View {
    let entry: MediaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.title)
                .font(.headline)
            Text(meta)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let note = entry.note, !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var meta: String {
        var parts = [entry.type.label, entry.date]
        if let rating = entry.rating {
            parts.append("\(rating)/10")
        }
        return parts.joined(separator: " - ")
    }
}
