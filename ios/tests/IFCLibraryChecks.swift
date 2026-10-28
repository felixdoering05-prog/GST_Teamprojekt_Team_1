import Foundation

@MainActor final class LibraryFixture {
    var scope: String? = "server#1"
    var buildings = [Building(id: 1, name: "Gebäude D21", address: "Darmstadt"), Building(id: 2, name: "Technikum", address: "Darmstadt")]
    var models = [1: [BuildingDocument(id: 10, name: "D21_Lüftung.ifc", mime_type: "application/x-step", size: 1200), BuildingDocument(id: 11, name: "Grundriss.pdf", mime_type: "application/pdf", size: 100)], 2: [BuildingDocument(id: 20, name: "Tragwerk.ifc", mime_type: "application/x-step", size: 2400)]]
    var failing: Set<Int> = []
    var listFails = false
    var holdFirst = false
    var continuation: CheckedContinuation<[BuildingDocument], Never>?
    enum Failure: LocalizedError { case unavailable; var errorDescription: String? { "Testverbindung unterbrochen" } }
    func makeSource() -> IFCLibrarySource {
        IFCLibrarySource(scope: { self.scope }, buildings: {
            if self.listFails { throw Failure.unavailable }
            return self.buildings
        }, documents: { id in
            if self.holdFirst && id == 1 {
                self.holdFirst = false
                return await withCheckedContinuation { self.continuation = $0 }
            }
            if self.failing.contains(id) { throw Failure.unavailable }
            return self.models[id] ?? []
        })
    }
}

@main struct IFCLibraryChecks {
    @MainActor static func main() async {
        let fixture = LibraryFixture()
        let library = IFCLibraryState(source: fixture.makeSource())
        await library.refresh()
        assert(library.entries.count == 2, "Only IFC documents should be visible")
        assert(library.matching("luftung").map(\.id) == [10], "Search should ignore accents and case")
        assert(library.matching("TECHNIKUM").map(\.id) == [20], "Search should match building names")
        assert(library.matching("missing").isEmpty)
        assert(library.matching("   ").count == 2)

        fixture.failing = [1]
        fixture.models[2] = [BuildingDocument(id: 21, name: "Neues Tragwerk.ifc", mime_type: "application/x-step", size: 3000)]
        await library.refresh()
        assert(Set(library.entries.map(\.id)) == [10, 21], "Keep failed building's cached models while publishing successful updates")
        assert(library.buildingErrors[1] != nil && library.buildingErrors[2] == nil)
        fixture.failing = []
        fixture.models[1] = [BuildingDocument(id: 12, name: "Neues D21.ifc", mime_type: "application/x-step", size: 4000)]
        await library.retry(fixture.buildings[0])
        assert(Set(library.entries.map(\.id)) == [12, 21] && library.buildingErrors.isEmpty)

        fixture.listFails = true
        await library.refresh()
        assert(library.listError != nil && library.entries.count == 2, "A failed refresh must not erase cached results")
        fixture.listFails = false
        fixture.buildings.removeAll { $0.id == 1 }
        await library.refresh()
        assert(library.entries.map(\.id) == [21] && library.documents[1] == nil && library.listError == nil, "Prune deleted buildings only after a successful list refresh")

        fixture.scope = "server#2"; fixture.listFails = true
        await library.refresh()
        assert(library.entries.isEmpty && library.buildings.isEmpty, "Changing account must clear previous account's cache even if the new request fails")
        fixture.listFails = false; fixture.buildings = []
        await library.refresh()
        assert(library.hasLoaded && library.entries.isEmpty && library.listError == nil)

        let concurrent = LibraryFixture(); concurrent.holdFirst = true
        let state = IFCLibraryState(source: concurrent.makeSource())
        let old = Task { await state.refresh() }
        while concurrent.continuation == nil { await Task.yield() }
        concurrent.scope = "other-server#1"
        concurrent.buildings = [Building(id: 3, name: "Anderer Server", address: "")]
        concurrent.models[3] = [BuildingDocument(id: 30, name: "Anderes Modell.ifc", mime_type: "application/x-step", size: 100)]
        await state.refresh()
        concurrent.continuation?.resume(returning: [BuildingDocument(id: 99, name: "Veraltete Antwort.ifc", mime_type: "application/x-step", size: 100)])
        await old.value
        assert(state.entries.map(\.id) == [30] && !state.refreshing, "Late responses from a previous server must never replace the current account's models")
        print("IFC_LIBRARY_CHECKS_PASS: filtering, search, partial failure, retry, refresh failure, deleted buildings, account/server isolation, stale response and empty state")
    }
}
