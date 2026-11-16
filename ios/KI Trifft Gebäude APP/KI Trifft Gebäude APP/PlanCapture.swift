import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import VisionKit

/// Floor plans from paper: the iOS document scanner finds the sheet, straightens and crops it. Photos and image files
/// (JPG, PNG, HEIC) work too. Everything is converted to JPEG on the iPhone and saved as a plan in the building folder;
/// with plan analysis switched on, the server then starts a draft automatically.
enum PlanImage {
    /// Plans keep more detail than ordinary photos (thin wall lines, dimension figures).
    static let maxDimension = 3200
    static func jpeg(_ image: UIImage) throws -> Data {
        guard let data = image.jpegData(compressionQuality: 0.9) else { throw APIError(status: 0, message: "Der Scan konnte nicht gespeichert werden.") }
        return try PhotoPreparation.jpeg(data, dimension: maxDimension)
    }
    static func name(_ index: Int = 0) -> String {
        let stamp = Date().formatted(.dateTime.year().month(.twoDigits).day(.twoDigits).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
            .replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)
        return "Grundriss-\(stamp)" + (index > 0 ? "-\(index + 1)" : "") + ".jpg"
    }
}

struct PlanDocumentScanner: UIViewControllerRepresentable {
    let onFinish: ([UIImage]) -> Void
    let onCancel: () -> Void
    static var isSupported: Bool { VNDocumentCameraViewController.isSupported }
    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: PlanDocumentScanner
        init(_ parent: PlanDocumentScanner) { self.parent = parent }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            parent.onFinish((0..<min(scan.pageCount, 4)).map { scan.imageOfPage(at: $0) })
        }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { parent.onCancel() }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { parent.onCancel() }
    }
}

/// Three simple ways to bring a floor plan in. `tiles` uses the large cards of the new-building flow.
struct PlanCaptureButtons: View {
    @ObservedObject var flow: BuildingWorkflowModel
    var tiles = false
    var disabled = false
    @State private var scanning = false
    @State private var picking: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var preparing = false
    private var fileTypes: [UTType] { [.image, .pdf, UTType(filenameExtension: "dwg") ?? UTType(importedAs: "com.autodesk.dwg"), UTType(filenameExtension: "dxf") ?? UTType(importedAs: "com.autodesk.dxf")] }
    private var locked: Bool { disabled || preparing || flow.busy || flow.loadFailed }

    var body: some View {
        Group {
            if PlanDocumentScanner.isSupported {
                Button { scanning = true } label: {
                    item(symbol: "doc.viewfinder", color: .teal, title: "Grundriss abfotografieren", subtitle: "Der Scanner findet das Blatt, richtet es gerade aus und schneidet es zu")
                }.disabled(locked).accessibilityIdentifier("plan-scan")
            }
            PhotosPicker(selection: $picking, maxSelectionCount: 4, matching: .images) {
                item(symbol: "photo.on.rectangle", color: .pink, title: "Grundriss aus Fotos", subtitle: "Foto oder Screenshot eines Plans – auch schief oder unscharf")
            }.disabled(locked).accessibilityIdentifier("plan-photos")
            Button { importing = true } label: {
                item(symbol: "folder.fill", color: .blue, title: "Grundriss aus Dateien", subtitle: "PDF, DXF, DWG oder Bild (JPG, PNG, HEIC)")
            }.disabled(locked).accessibilityIdentifier("plan-files")
            if preparing { ProgressView("Grundriss wird vorbereitet …") }
        }
        .modifier(PlanTileStyle(on: tiles))
        .fullScreenCover(isPresented: $scanning) {
            PlanDocumentScanner(onFinish: { images in
                scanning = false
                store { for (i, image) in images.enumerated() { try flow.stage(PlanImage.jpeg(image), name: PlanImage.name(i), photo: false) } }
            }, onCancel: { scanning = false }).ignoresSafeArea()
        }
        .onChange(of: picking) { _, selection in
            guard !selection.isEmpty else { return }
            store {
                for (i, entry) in selection.enumerated() {
                    guard let data = try await entry.loadTransferable(type: Data.self) else { throw DraftStorageError.missingFile }
                    try flow.stage(PhotoPreparation.jpeg(data, dimension: PlanImage.maxDimension), name: PlanImage.name(i), photo: false)
                }
                picking = []
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: fileTypes, allowsMultipleSelection: true) { result in
            switch result {
            case .failure(let error): flow.problem = error.localizedDescription
            case .success(let urls): store { for url in urls { try flow.importFile(url, asPlan: true) } }
            }
        }
    }

    private func store(_ work: @escaping () async throws -> Void) {
        preparing = true
        Task {
            do { try await work() } catch { flow.problem = error.localizedDescription }
            preparing = false
            await flow.uploadPending()
        }
    }

    @ViewBuilder private func item(symbol: String, color: Color, title: String, subtitle: String) -> some View {
        if tiles { BuildingOptionTile(symbol: symbol, color: color, title: title, subtitle: subtitle) }
        else {
            Label { VStack(alignment: .leading, spacing: 2) { Text(title); Text(subtitle).font(.caption).foregroundStyle(.secondary) } }
            icon: { Image(systemName: symbol).foregroundStyle(color) }
        }
    }
}

private struct PlanTileStyle: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.buttonStyle(BuildingTileButtonStyle()) } else { content }
    }
}
