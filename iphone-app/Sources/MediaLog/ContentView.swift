import SwiftUI

extension Color {
    init(rgb: UInt) {
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

struct MediaLogTheme: Identifiable, Hashable {
    let id: String
    let name: String
    let isDark: Bool
    let bg: Color
    let card: Color
    let text: Color
    let muted: Color
    let accent: Color
    let accentContrast: Color
    let danger: Color
}

enum Themes {
    static let monet = MediaLogTheme(
        id: "monet", name: "Monet (default)", isDark: false,
        bg: Color(rgb: 0xF5EEE6), card: Color(rgb: 0xFFFFFF), text: Color(rgb: 0x2D2B2A),
        muted: Color(rgb: 0x8B8478), accent: Color(rgb: 0xDA7756),
        accentContrast: Color(rgb: 0xFFFFFF), danger: Color(rgb: 0xCC4444))

    static let catppuccin = MediaLogTheme(
        id: "catppuccin", name: "Catppuccin", isDark: true,
        bg: Color(rgb: 0x1E1E2E), card: Color(rgb: 0x313244), text: Color(rgb: 0xCDD6F4),
        muted: Color(rgb: 0xA6ADC8), accent: Color(rgb: 0xCBA6F7),
        accentContrast: Color(rgb: 0x1E1E2E), danger: Color(rgb: 0xF38BA8))

    static let tokyoNight = MediaLogTheme(
        id: "tokyo-night", name: "Tokyo Night", isDark: true,
        bg: Color(rgb: 0x1A1B26), card: Color(rgb: 0x24283B), text: Color(rgb: 0xC0CAF5),
        muted: Color(rgb: 0x787C99), accent: Color(rgb: 0x7AA2F7),
        accentContrast: Color(rgb: 0x1A1B26), danger: Color(rgb: 0xF7768E))

    static let dracula = MediaLogTheme(
        id: "dracula", name: "Dracula", isDark: true,
        bg: Color(rgb: 0x282A36), card: Color(rgb: 0x343746), text: Color(rgb: 0xF8F8F2),
        muted: Color(rgb: 0x6272A4), accent: Color(rgb: 0xBD93F9),
        accentContrast: Color(rgb: 0x282A36), danger: Color(rgb: 0xFF5555))

    static let nier = MediaLogTheme(
        id: "nier", name: "NieR: Automata", isDark: false,
        bg: Color(rgb: 0xC9C3AA), card: Color(rgb: 0xD6D1BB), text: Color(rgb: 0x454138),
        muted: Color(rgb: 0x736D5A), accent: Color(rgb: 0x4E4B42),
        accentContrast: Color(rgb: 0xD6D1BB), danger: Color(rgb: 0x8A3B32))

    static let all: [MediaLogTheme] = [monet, catppuccin, tokyoNight, dracula, nier]

    static func byId(_ id: String) -> MediaLogTheme {
        all.first { $0.id == id } ?? monet
    }
}

private struct MediaLogThemeKey: EnvironmentKey {
    static let defaultValue: MediaLogTheme = Themes.monet
}

extension EnvironmentValues {
    var medialogTheme: MediaLogTheme {
        get { self[MediaLogThemeKey.self] }
        set { self[MediaLogThemeKey.self] = newValue }
    }
}

struct ContentView: View {
    @Bindable var store: MediaLogStore
    @State private var editorEntry: MediaEntry?
    @AppStorage("medialog.theme") private var themeId: String = "monet"

    private var theme: MediaLogTheme { Themes.byId(themeId) }

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
        .tint(theme.accent)
        .preferredColorScheme(theme.isDark ? .dark : .light)
        .environment(\.medialogTheme, theme)
        .sheet(item: $editorEntry) { entry in
            EntryEditorView(store: store, entry: entry)
                .environment(\.medialogTheme, theme)
                .tint(theme.accent)
                .preferredColorScheme(theme.isDark ? .dark : .light)
        }
    }
}

struct WeekView: View {
    @Bindable var store: MediaLogStore
    @Binding var editorEntry: MediaEntry?
    @Environment(\.medialogTheme) private var theme
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
                    .foregroundStyle(theme.muted)
            }
            .listRowBackground(Color.clear)

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
                        .listRowBackground(Color.clear)
                    } header: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(dayHeader(day.key))
                                .font(.caption.weight(.bold))
                                .textCase(.uppercase)
                                .foregroundStyle(theme.accent)
                            Rectangle()
                                .fill(theme.accent)
                                .frame(height: 1)
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.bg)
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
    @Environment(\.medialogTheme) private var theme

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
                    .listRowBackground(theme.card)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.bg)
        .overlay {
            if store.snapshot.history.isEmpty {
                ContentUnavailableView("No archived weeks", systemImage: "archivebox")
            }
        }
        .navigationTitle("History")
    }
}

struct EntryRow: View {
    @Environment(\.medialogTheme) private var theme
    let entry: MediaEntry
    var showDate: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.title)
                .font(.headline)
                .foregroundStyle(theme.text)
            Text(meta)
                .font(.subheadline)
                .foregroundStyle(theme.muted)
            if let note = entry.note, !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(theme.muted)
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
