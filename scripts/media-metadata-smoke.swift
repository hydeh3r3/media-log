import Foundation
import JavaScriptCore

@main
enum MediaMetadataSmoke {
    static func main() throws {
        let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let source = try String(contentsOf: root.appendingPathComponent("shared/media-metadata.js"), encoding: .utf8)
        let fixtureData = try Data(contentsOf: root.appendingPathComponent("shared/media-detection-fixtures.json"))
        guard let fixtures = try JSONSerialization.jsonObject(with: fixtureData) as? [[String: Any]],
              let context = JSContext() else { fatalError("Cannot load test cases") }
        context.evaluateScript(source)
        guard context.exception == nil, let engine = context.objectForKeyedSubscript("MediaLogMetadata") else {
            fatalError("Cannot load metadata engine")
        }
        for fixture in fixtures {
            let input = fixture["input"] as! [String: Any]
            let expected = fixture["expected"] as! [String: Any]
            let actual = engine.invokeMethod("detect", withArguments: [input])?.toDictionary() as? [String: Any]
            guard context.exception == nil,
                  actual?["title"] as? String == expected["title"] as? String,
                  actual?["type"] as? String == expected["type"] as? String else {
                fatalError("JavaScriptCore failed: \(fixture["name"] ?? "unnamed case")")
            }
        }
        let html = """
        <html><head><title>Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto</title>
        <meta property='og:title' content='Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto'>
        </head><body><h1>Naruto: Shippuden</h1><script>throw new Error('must not execute');</script></body></html>
        """
        let result = try MediaMetadataEngine.detect(url: "https://anikoto.cz/watch/naruto/ep-24", html: html, source: source, pageLoaded: true)
        guard result.title == "Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto", result.type == "anime", result.pageLoaded else {
            fatalError("Native HTML metadata bridge failed: \(result)")
        }
        let fallback = try MediaMetadataEngine.detect(url: "https://anikoto.cz/watch/naruto", html: "", source: source, pageLoaded: false)
        guard fallback.type == "anime", fallback.title.isEmpty, !fallback.pageLoaded else {
            fatalError("Native offline fallback failed")
        }
        let editor = try String(contentsOf: root.appendingPathComponent("iphone-app/Sources/MediaLog/EntryEditorView.swift"), encoding: .utf8)
        guard let lookupStart = editor.range(of: "private func fillMetadata()"),
              let lookupEnd = editor.range(of: "private var ratingBinding"),
              !editor[lookupStart.lowerBound..<lookupEnd.lowerBound].contains("entry.title"),
              !editor.contains("lastSuggestedTitle") else {
            fatalError("The iOS type lookup must not read or change the title field")
        }
        print("JavaScriptCore passed \(fixtures.count) shared cases, native HTML/offline checks, and the manual iOS title guard.")
    }
}
