import Foundation

struct SyncCheckoutEnvelope: Codable {
    var ok: Bool
    var checkoutUrl: URL?
    var error: String?
}

struct SyncCheckoutClient {
    let config: SyncConfig
    let token: String

    func createCheckoutURL() async throws -> URL {
        guard config.mode == .supabase else {
            throw SyncError.remote("Switch sync mode to Supabase first.")
        }

        var request = URLRequest(url: try checkoutEndpointURL())
        request.httpMethod = "POST"
        request.setValue(config.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data("{}".utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        let envelope = try JSONDecoder().decode(SyncCheckoutEnvelope.self, from: data)

        guard envelope.ok, let checkoutUrl = envelope.checkoutUrl else {
            throw SyncError.remote(envelope.error ?? "Checkout could not start.")
        }

        return checkoutUrl
    }

    private func checkoutEndpointURL() throws -> URL {
        guard let url = URL(string: config.supabaseCheckoutEndpoint) else {
            throw SyncError.invalidEndpoint
        }
        return url
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(SyncCheckoutEnvelope.self, from: data)
            let message = envelope?.error ?? String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw SyncError.remote(message)
        }
    }
}

extension SyncConfig {
    var supabaseCheckoutEndpoint: String {
        guard let url = URL(string: supabaseUrl) else { return endpoint }
        return "\(url.scheme ?? "https")://\(url.host ?? "")/functions/v1/media-log-checkout"
    }
}
