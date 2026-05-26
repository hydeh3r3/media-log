import Foundation

struct SupabaseSession: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userEmail: String
}

struct SupabaseAuthClient {
    let config: SyncConfig

    func signIn(password: String) async throws -> SupabaseSession {
        guard !config.email.isEmpty, !password.isEmpty else {
            throw SyncError.remote("Email and password are required.")
        }

        return try await tokenRequest(
            grantType: "password",
            body: [
                "email": config.email,
                "password": password
            ]
        )
    }

    func signUp(password: String) async throws -> SupabaseSession? {
        guard !config.email.isEmpty, !password.isEmpty else {
            throw SyncError.remote("Email and password are required.")
        }

        return try await authAction(
            path: "signup",
            body: [
                "email": config.email,
                "password": password
            ]
        )
    }

    func requestPasswordReset() async throws {
        guard !config.email.isEmpty else {
            throw SyncError.remote("Email is required.")
        }

        _ = try await authAction(
            path: "recover",
            body: [
                "email": config.email
            ]
        )
    }

    func refresh(refreshToken: String) async throws -> SupabaseSession {
        guard !refreshToken.isEmpty else {
            throw SyncError.remote("Sign in to Supabase first.")
        }

        return try await tokenRequest(
            grantType: "refresh_token",
            body: [
                "refresh_token": refreshToken
            ]
        )
    }

    func signOut(accessToken: String) async throws {
        var request = URLRequest(url: try authURL(path: "logout"))
        request.httpMethod = "POST"
        request.setValue(config.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
    }

    private func authAction(path: String, body: [String: String]) async throws -> SupabaseSession? {
        var request = URLRequest(url: try authURL(path: path))
        request.httpMethod = "POST"
        request.setValue(config.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder.pretty.encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        let authResponse = try? JSONDecoder().decode(SupabaseActionResponse.self, from: data)
        return authResponse?.session(fallbackEmail: config.email)
    }

    private func tokenRequest(grantType: String, body: [String: String]) async throws -> SupabaseSession {
        var components = URLComponents(url: try authURL(path: "token"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "grant_type", value: grantType)]

        guard let url = components?.url else {
            throw SyncError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(config.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder.pretty.encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        let authResponse = try JSONDecoder().decode(SupabaseTokenResponse.self, from: data)

        return authResponse.session(fallbackEmail: config.email)
    }

    private func authURL(path: String) throws -> URL {
        guard
            let baseURL = URL(string: config.supabaseUrl),
            baseURL.scheme == "https",
            let host = baseURL.host,
            !config.supabasePublishableKey.isEmpty
        else {
            throw SyncError.remote("Supabase URL and publishable key are required.")
        }

        return URL(string: "https://\(host)/auth/v1/\(path)")!
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            if
                let envelope = try? JSONDecoder().decode(SupabaseErrorResponse.self, from: data),
                let message = envelope.message
            {
                throw SyncError.remote(message)
            }

            let message = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw SyncError.remote(message)
        }
    }
}

private struct SupabaseTokenResponse: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int
    var user: SupabaseUser?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }

    func session(fallbackEmail: String) -> SupabaseSession {
        SupabaseSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(max(expiresIn - 30, 1))),
            userEmail: user?.email ?? fallbackEmail
        )
    }
}

private struct SupabaseActionResponse: Codable {
    var accessToken: String?
    var refreshToken: String?
    var expiresIn: Int?
    var user: SupabaseUser?
    var nestedSession: SupabaseTokenResponse?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
        case nestedSession = "session"
    }

    func session(fallbackEmail: String) -> SupabaseSession? {
        if let nestedSession {
            return nestedSession.session(fallbackEmail: user?.email ?? fallbackEmail)
        }

        guard let accessToken, let refreshToken else {
            return nil
        }

        return SupabaseSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(max((expiresIn ?? 3600) - 30, 1))),
            userEmail: user?.email ?? fallbackEmail
        )
    }
}

private struct SupabaseUser: Codable {
    var email: String?
}

private struct SupabaseErrorResponse: Codable {
    var error: String?
    var errorDescription: String?
    var msg: String?

    var message: String? {
        errorDescription ?? msg ?? error
    }

    enum CodingKeys: String, CodingKey {
        case error
        case errorDescription = "error_description"
        case msg
    }
}
