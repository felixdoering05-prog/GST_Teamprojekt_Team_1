import Foundation

func check(_ condition: @autoclosure () throws -> Bool) rethrows {
    let success = try condition()
    precondition(success)
}
@main struct WorkflowChecks {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("D21WorkflowChecks-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let alice = BuildingDraftStore(scope: "https://server-a#1#new-building", root: root)
        let bob = BuildingDraftStore(scope: "https://server-a#2#new-building", root: root)
        let otherServer = BuildingDraftStore(scope: "https://server-b#1#new-building", root: root)
        let buildingQueue = BuildingDraftStore(scope: "https://server-a#1#building-99", root: root)
        precondition(alice.directory != bob.directory && alice.directory != otherServer.directory && alice.directory != buildingQueue.directory)
        try check(try alice.load() == nil)
        var draft = BuildingDraft()
        draft.name = "D21"; draft.address = "Darmstadt"; draft.step = .plans
        draft.building = Building(id: 99, name: "D21", address: "Darmstadt")
        let bytes = Data("%PDF-1.7\nworkflow test".utf8)
        var item = try alice.stage(data: bytes, name: "Grundriss.pdf", isPhoto: false)
        item.state = .uploading
        draft.files = [item]
        try alice.save(draft)
        let loaded = try alice.load()!
        precondition(loaded.id == draft.id && loaded.building?.id == 99 && loaded.step == .plans)
        precondition(loaded.files[0].id == item.id && loaded.files[0].state == .queued && loaded.pendingCount == 1)
        try check(try alice.data(for: loaded.files[0]) == bytes)
        try check(try bob.load() == nil && otherServer.load() == nil && buildingQueue.load() == nil)
        var completed = loaded
        completed.files[0].state = .saved
        completed.files[0].document = BuildingDocument(id: 7, name: "Grundriss.pdf", mime_type: "application/pdf", size: bytes.count)
        try alice.save(completed)
        try check(try alice.load()!.pendingCount == 0)
        try check(try alice.load()!.files[0].document?.id == 7)
        do { _ = try alice.stage(data: Data(), name: "leer.pdf", isPhoto: false); fatalError("Empty upload accepted") } catch DraftStorageError.tooLarge {}
        do { _ = try alice.stage(data: Data(count: 25 * 1024 * 1024 + 1), name: "gross.pdf", isPhoto: false); fatalError("Oversize upload accepted") } catch DraftStorageError.tooLarge {}
        try alice.removePayload(item)
        do { _ = try alice.data(for: item); fatalError("Missing payload accepted") } catch DraftStorageError.missingFile {}
        try bob.save(BuildingDraft())
        try Data("not json".utf8).write(to: alice.directory.appendingPathComponent("draft.json"))
        do { _ = try alice.load(); fatalError("Corrupt draft silently replaced") } catch is DecodingError {}
        try alice.clear()
        try check(try alice.load() == nil && bob.load() != nil)
        print("PASS: draft persistence, server/account isolation, interrupted uploads, stable retry IDs, payload limits, corruption and scoped cleanup")
    }
}
