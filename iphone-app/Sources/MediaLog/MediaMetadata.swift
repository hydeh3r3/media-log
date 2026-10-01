import Foundation
import JavaScriptCore

struct MediaMetadataSuggestion: Equatable, Sendable {
    let title: String
    let type: String?
    let pageLoaded: Bool
}

enum MediaMetadataError: Error {
    case invalidURL
    case unavailableEngine
    case invalidResponse
    case pageTooLarge
}

enum MediaMetadataEngine {
    /// Runs the bundled rules with page data as values, never as executable source.
    static func detect(url: String, html: String, source: String, pageLoaded: Bool) throws -> MediaMetadataSuggestion {
        guard let context = JSContext() else { throw MediaMetadataError.unavailableEngine }
        context.evaluateScript(source)
        guard context.exception == nil,
              let engine = context.objectForKeyedSubscript("MediaLogMetadata"),
              !engine.isUndefined,
              let signals = engine.invokeMethod("signalsFromHTML", withArguments: [html, url]),
              context.exception == nil,
              let result = engine.invokeMethod("detect", withArguments: [["url": url, "signals": signals]]),
              context.exception == nil,
              let fields = result.toDictionary() as? [String: Any] else {
            throw MediaMetadataError.unavailableEngine
        }
        return MediaMetadataSuggestion(title: fields["title"] as? String ?? "", type: fields["type"] as? String, pageLoaded: pageLoaded)
    }
}

enum MediaMetadataLookup {
    /// Fetches one page without saved cookies. Only static metadata is read.
    static func fetch(_ rawURL: String) async throws -> MediaMetadataSuggestion {
        guard let url = URL(string: rawURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil, url.user == nil, url.password == nil else {
            throw MediaMetadataError.invalidURL
        }
        guard let sourceURL = Bundle.main.url(forResource: "media-metadata", withExtension: "js") else {
            throw MediaMetadataError.unavailableEngine
        }
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 15
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        do {
            var request = URLRequest(url: url)
            request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse,
                  (200..<300).contains(response.statusCode),
                  ["text/html", "application/xhtml+xml"].contains(response.mimeType?.lowercased() ?? "") else {
                throw MediaMetadataError.invalidResponse
            }
            let limit = 2_000_000
            guard response.expectedContentLength <= limit else { throw MediaMetadataError.pageTooLarge }
            var data = Data()
            for try await byte in bytes {
                if data.count >= limit { throw MediaMetadataError.pageTooLarge }
                data.append(byte)
            }
            try Task.checkCancellation()
            guard let html = String(data: data, encoding: .utf8) else { throw MediaMetadataError.invalidResponse }
            return try MediaMetadataEngine.detect(url: response.url?.absoluteString ?? rawURL, html: html, source: source, pageLoaded: true)
        } catch {
            try Task.checkCancellation()
            // A login wall or offline page can still have a useful domain classification.
            return try MediaMetadataEngine.detect(url: rawURL, html: "", source: source, pageLoaded: false)
        }
    }
}
