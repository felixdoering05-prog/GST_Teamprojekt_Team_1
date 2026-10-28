import Foundation
import Combine

@MainActor struct IFCLibrarySource {
    let scope: () -> String?
    let buildings: () async throws -> [Building]
    let documents: (Int) async throws -> [BuildingDocument]
}

struct IFCModelEntry: Identifiable {
    let building: Building
    let document: BuildingDocument
    var id: Int { document.id }
}

@MainActor final class IFCLibraryState: ObservableObject {
    @Published private(set) var buildings: [Building] = []
    @Published private(set) var documents: [Int: [BuildingDocument]] = [:]
    @Published private(set) var buildingErrors: [Int: String] = [:]
    @Published private(set) var loadingBuildings: Set<Int> = []
    @Published private(set) var refreshing = false
    @Published private(set) var hasLoaded = false
    @Published private(set) var listError: String?
    private let source: IFCLibrarySource
    private var activeScope: String?
    private var generation = UUID()

    init(source: IFCLibrarySource) { self.source = source }
    var entries: [IFCModelEntry] {
        buildings.flatMap { building in
            (documents[building.id] ?? []).map { IFCModelEntry(building: building, document: $0) }
        }.sorted {
            let order = $0.building.name.localizedStandardCompare($1.building.name)
            return order == .orderedSame
                ? $0.document.name.localizedStandardCompare($1.document.name) == .orderedAscending
                : order == .orderedAscending
        }
    }
    func matching(_ text: String) -> [IFCModelEntry] {
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return entries.filter { query.isEmpty || $0.document.name.localizedStandardContains(query) || $0.building.name.localizedStandardContains(query) }
    }
    private func valid(_ scope: String, _ operation: UUID) -> Bool {
        !Task.isCancelled && activeScope == scope && source.scope() == scope && generation == operation
    }
    func refresh() async {
        let currentScope = source.scope()
        if currentScope != activeScope {
            generation = UUID(); activeScope = currentScope
            buildings = []; documents = [:]; buildingErrors = [:]; loadingBuildings = []
            listError = nil; refreshing = false; hasLoaded = false
        }
        guard let scope = currentScope, !refreshing else { return }
        let operation = UUID(); generation = operation
        refreshing = true
        defer { if generation == operation { refreshing = false; loadingBuildings = [] } }
        do {
            let loaded = try await source.buildings()
            guard valid(scope, operation) else { return }
            buildings = loaded
            let ids = Set(loaded.map(\.id))
            documents = documents.filter { ids.contains($0.key) }
            buildingErrors = buildingErrors.filter { ids.contains($0.key) }
            loadingBuildings = ids; listError = nil
            // Publish each successful building independently; an unavailable building keeps its last results.
            for building in loaded {
                guard valid(scope, operation) else { return }
                do {
                    let result = try await source.documents(building.id)
                    guard valid(scope, operation) else { return }
                    documents[building.id] = result.filter { $0.mime_type == "application/x-step" }
                    buildingErrors.removeValue(forKey: building.id)
                } catch {
                    guard valid(scope, operation) else { return }
                    buildingErrors[building.id] = error.localizedDescription
                }
                loadingBuildings.remove(building.id)
            }
            hasLoaded = true
        } catch {
            guard valid(scope, operation) else { return }
            listError = error.localizedDescription; hasLoaded = true
        }
    }
    func retry(_ building: Building) async {
        guard let scope = activeScope, source.scope() == scope, !refreshing, !loadingBuildings.contains(building.id) else { return }
        let operation = generation
        loadingBuildings.insert(building.id)
        defer { if generation == operation { loadingBuildings.remove(building.id) } }
        do {
            let result = try await source.documents(building.id)
            guard valid(scope, operation) else { return }
            documents[building.id] = result.filter { $0.mime_type == "application/x-step" }
            buildingErrors.removeValue(forKey: building.id)
        } catch {
            guard valid(scope, operation) else { return }
            buildingErrors[building.id] = error.localizedDescription
        }
    }
}
