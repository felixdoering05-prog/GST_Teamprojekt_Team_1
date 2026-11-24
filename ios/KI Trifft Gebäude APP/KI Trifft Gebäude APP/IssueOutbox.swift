import CryptoKit
import Foundation

struct PendingIssue: Codable, Identifiable {
    let id: UUID
    let buildingID: Int
    let title: String
    let description: String
    let room: String
    let priority: IssuePriority?
    let location: IssueLocation?
    let jpeg: Data?
    var source: String? = nil
    var serverID: Int? = nil
    var failure: String? = nil
}

enum IssueOutbox {
    private static func url(for scope: String) throws -> URL {
        let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                    appropriateFor: nil, create: true)
            .appendingPathComponent("IssueOutbox", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var protectedDirectory = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try protectedDirectory.setResourceValues(values)
        let digest = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(digest + ".json")
    }

    static func load(_ scope: String) throws -> [PendingIssue] {
        let file = try url(for: scope)
        do { return try JSONDecoder().decode([PendingIssue].self, from: Data(contentsOf: file)) }
        catch let error as CocoaError where error.code == .fileReadNoSuchFile { return [] }
    }

    static func clear(_ scope: String) throws {
        try FileManager.default.removeItem(at: url(for: scope))
    }

    static func save(_ reports: [PendingIssue], scope: String) throws {
        try JSONEncoder().encode(reports).write(to: url(for: scope), options: [.atomic, .completeFileProtection])
    }
}

extension AccountModel {
    func loadIssueOutbox() {
        pendingIssues = []
        issueQueueError = nil
        lastSynchronizedBuilding = nil
        guard let scope = issueQueueScope else { return }
        do { pendingIssues = try IssueOutbox.load(scope) }
        catch { issueQueueError = "Lokal gespeicherte Meldungen konnten nicht gelesen werden." }
    }

    func enqueueIssue(_ report: PendingIssue) throws {
        guard let scope = issueQueueScope else { throw APIError(status: 401, message: "Bitte anmelden.") }
        var reports = try IssueOutbox.load(scope)
        guard reports.count < 20 else { throw APIError(status: 409, message: "20 Meldungen warten bereits auf Übertragung.") }
        reports.append(report)
        try replaceOutbox(reports, scope: scope)
    }

    func retryIssue(_ id: UUID) async {
        guard let scope = issueQueueScope, !syncingIssues else { return }
        do {
            try updatePendingIssue(id, scope: scope) { report in
                var next = report
                next.failure = nil
                return next
            }
            _ = await syncIssueOutbox()
        } catch { issueQueueError = error.localizedDescription }
    }

    func discardPendingIssue(_ id: UUID) {
        guard let scope = issueQueueScope, !syncingIssues else { return }
        do { try updatePendingIssue(id, scope: scope) { _ in nil } }
        catch { issueQueueError = error.localizedDescription }
    }

    private func replaceOutbox(_ reports: [PendingIssue], scope: String) throws {
        try IssueOutbox.save(reports, scope: scope)
        if issueQueueScope == scope {
            pendingIssues = reports
            issueQueueError = nil
        }
    }

    private func updatePendingIssue(_ id: UUID, scope: String, change: (PendingIssue) -> PendingIssue?) throws {
        let reports = try IssueOutbox.load(scope)
        try replaceOutbox(reports.compactMap { report in report.id == id ? change(report) : report }, scope: scope)
    }

    func syncIssueOutbox() async -> [UUID: BuildingIssue] {
        guard let scope = issueQueueScope, !syncingIssues, !pendingIssues.isEmpty else { return [:] }
        syncingIssues = true
        defer { syncingIssues = false }
        var synced: [UUID: BuildingIssue] = [:]
        for draft in pendingIssues where draft.failure == nil {
            guard !Task.isCancelled, issueQueueScope == scope else { break }
            do {
                var serverID = draft.serverID
                var report: BuildingIssue?
                if serverID == nil {
                    let created = try await reportIssue(buildingID: draft.buildingID, title: draft.title,
                        description: draft.description, room: draft.room, priority: draft.priority,
                        location: draft.location, requestKey: draft.id, source: draft.source)
                    report = created
                    serverID = created.id
                    try updatePendingIssue(draft.id, scope: scope) { item in
                        var next = item
                        next.serverID = created.id
                        return next
                    }
                }
                guard !Task.isCancelled, issueQueueScope == scope else { break }
                if let jpeg = draft.jpeg, let serverID {
                    report = try await uploadIssuePhoto(buildingID: draft.buildingID, issueID: serverID, jpeg: jpeg)
                }
                try updatePendingIssue(draft.id, scope: scope) { _ in nil }
                if issueQueueScope == scope {
                    if let report { synced[draft.id] = report }
                    lastSynchronizedBuilding = draft.buildingID
                    issueSyncGeneration += 1
                }
            } catch {
                guard !Task.isCancelled, issueQueueScope == scope else { break }
                let status = (error as? APIError)?.status
                if error is URLError || status == 0 || status == 429 || (status ?? 0) >= 500 { break }
                do {
                    try updatePendingIssue(draft.id, scope: scope) { item in
                        var next = item
                        next.failure = error.localizedDescription
                        return next
                    }
                } catch { issueQueueError = "Der lokale Synchronisationsstand konnte nicht gespeichert werden." }
            }
        }
        return synced
    }
}
