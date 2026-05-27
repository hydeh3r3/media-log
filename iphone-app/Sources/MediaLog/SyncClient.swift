import Foundation

struct SyncRecord: Codable, Equatable {
    var userId: String
    var revision: Int
    var updatedAt: String?
    var data: MediaLogSnapshot
}

struct SyncEnvelope: Codable {
    var ok: Bool
    var record: SyncRecord?
    var error: String?
}

struct SyncClient {
    let config: SyncConfig
    let token: String

    func fetchRecord() async throws -> SyncRecord {
        var components = URLComponents(url: endpointURL(), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "userId", value: config.userId)]

        guard let url = components?.url else {
            throw SyncError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        let envelope = try JSONDecoder().decode(SyncEnvelope.self, from: data)

        guard envelope.ok, let record = envelope.record else {
            throw SyncError.remote(envelope.error ?? "Sync pull failed.")
        }

        return record
    }

    func push(snapshot: MediaLogSnapshot, clientId: String) async throws -> SyncRecord {
        var request = URLRequest(url: endpointURL())
        request.httpMethod = "PUT"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder.pretty.encode(
            PushBody(userId: config.userId, clientId: clientId, data: snapshot)
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        let envelope = try JSONDecoder().decode(SyncEnvelope.self, from: data)

        guard envelope.ok, let record = envelope.record else {
            throw SyncError.remote(envelope.error ?? "Sync push failed.")
        }

        return record
    }

    private func endpointURL() -> URL {
        let endpoint = config.mode == .supabase ? config.supabaseFunctionEndpoint : config.endpoint
        guard var url = URL(string: endpoint) else {
            return URL(string: "http://127.0.0.1:43189/v1/media-log")!
        }

        if !url.path.hasSuffix("/media-log") {
            url.append(path: "v1/media-log")
        }
        return url
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(SyncEnvelope.self, from: data)
            let message = envelope?.error ?? String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw SyncError.remote(message)
        }
    }
}

struct PushBody: Codable {
    var userId: String
    var clientId: String
    var data: MediaLogSnapshot
}

enum SyncError: LocalizedError {
    case invalidEndpoint
    case remote(String)

    var errorDescription: String? {
        switch self {
        case .invalidEndpoint:
            "The sync endpoint is not valid."
        case .remote(let message):
            message
        }
    }
}

extension SyncConfig {
    var supabaseFunctionEndpoint: String {
        guard let url = URL(string: supabaseUrl) else { return endpoint }
        return "\(url.scheme ?? "https")://\(url.host ?? "")/functions/v1/media-log-sync"
    }
}
