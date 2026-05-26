import SwiftUI

@main
struct MediaLogApp: App {
    @State private var store = MediaLogStore()

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
        }
    }
}
