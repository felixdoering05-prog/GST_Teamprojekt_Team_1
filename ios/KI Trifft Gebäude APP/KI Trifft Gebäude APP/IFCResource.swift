import Foundation
import Compression

// The first four bytes specify the decoded size; resources are bundled, never downloaded.
func decodeIFCResource(_ data: Data) throws -> Data {
    guard data.count > 4 else { throw CocoaError(.fileReadCorruptFile) }
    let count = data.prefix(4).enumerated().reduce(0) { $0 | (Int($1.element) << ($1.offset * 8)) }
    guard count > 0, count <= 16 * 1024 * 1024 else { throw CocoaError(.fileReadCorruptFile) }
    var decoded = Data(count: count)
    let size = decoded.withUnsafeMutableBytes { output in
        data.dropFirst(4).withUnsafeBytes { input in
            compression_decode_buffer(output.bindMemory(to: UInt8.self).baseAddress!, count, input.bindMemory(to: UInt8.self).baseAddress!, data.count - 4, nil, COMPRESSION_LZFSE)
        }
    }
    guard size == count else { throw CocoaError(.fileReadCorruptFile) }
    return decoded
}
