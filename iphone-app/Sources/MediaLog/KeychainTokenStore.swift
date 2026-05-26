import Foundation
import Security

protocol KeychainCredentialStoring {
    func readCredential() throws -> SyncCredential
    func saveCredential(_ credential: SyncCredential) throws
}

struct KeychainCredentialStore: KeychainCredentialStoring {
    private let service = "com.media-log.sync"
    private let account = "sync-credential"

    func readCredential() throws -> SyncCredential {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return .empty
        }
        guard status == errSecSuccess else {
            throw KeychainTokenError.unexpectedStatus(status)
        }
        guard
            let data = result as? Data
        else {
            return .empty
        }

        return (try? JSONDecoder().decode(SyncCredential.self, from: data)) ?? .empty
    }

    func saveCredential(_ credential: SyncCredential) throws {
        if credential == .empty {
            try deleteToken()
            return
        }

        let data = try JSONEncoder.pretty.encode(credential)
        var query = baseQuery()
        let attributes: [String: Any] = [
            kSecValueData as String: data
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

        if status == errSecSuccess {
            return
        }
        if status != errSecItemNotFound {
            throw KeychainTokenError.unexpectedStatus(status)
        }

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw KeychainTokenError.unexpectedStatus(addStatus)
        }
    }

    private func deleteToken() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            return
        }
        throw KeychainTokenError.unexpectedStatus(status)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

enum KeychainTokenError: LocalizedError {
    case unexpectedStatus(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unexpectedStatus(let status):
            "Keychain returned status \(status)."
        }
    }
}
