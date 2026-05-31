import SwiftUI

extension Color {
    static let medialogAccent = Color(red: 0xDA / 255, green: 0x77 / 255, blue: 0x56 / 255)
}

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
            .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .sheet(item: $editorEntry) { entry in
            EntryEditorView(store: store, entry: entry)
        }
    }
}

struct WeekView: View {
    @Bindable var store: MediaLogStore
    @Binding var editorEntry: MediaEntry?
    @AppStorage("medialog.userName") private var userName: String = ""

    private var greeting: String {
        let trimmed = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty
            ? "Hey, time to log what you enjoyed this week!"
            : "Hey, \(trimmed) time to log what you enjoyed this week!"
    }

    // Entries grouped by day, ordered Monday → Sunday (ascending date).
    private func groupedDays(_ week: MediaWeek) -> [(key: String, entries: [MediaEntry])] {
        let groups = Dictionary(grouping: week.entries, by: { $0.date })
        return groups.keys.sorted().map { (key: $0, entries: groups[$0] ?? []) }
    }

    private func dayHeader(_ dateString: String) -> String {
        guard let date = DateFormatter.mediaLogDay.date(from: dateString) else { return dateString }
        return DateFormatter.mediaLogDayHeader.string(from: date)
    }

    var body: some View {
        List {
            Section {
                Text(greeting)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let week = store.snapshot.currentWeek {
                ForEach(groupedDays(week), id: \.key) { day in
                    Section {
                        ForEach(day.entries) { entry in
                            EntryRow(entry: entry, showDate: false)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    editorEntry = entry
                                }
                        }
                        .onDelete { offsets in
                            for index in offsets {
                                store.delete(day.entries[index])
                            }
                        }
                    } header: {
                        Text(dayHeader(day.key))
                            .font(.caption.weight(.bold))
                            .textCase(.uppercase)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.medialogAccent)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
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
    var showDate: Bool = true

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
        var parts = [entry.type.label]
        if showDate {
            parts.append(entry.date)
        }
        if let rating = entry.rating {
            parts.append("\(rating)/10")
        }
        return parts.joined(separator: " - ")
    }
}
