import Foundation
import Compression
let source = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
var output = [UInt8](repeating: 0, count: source.count + 65536)
let size = source.withUnsafeBytes { bytes in
    compression_encode_buffer(&output, output.count, bytes.bindMemory(to: UInt8.self).baseAddress!, source.count, nil, COMPRESSION_LZFSE)
}
guard size > 0 else { fatalError("IFC resource compression failed") }
var length = UInt32(source.count).littleEndian
var result = withUnsafeBytes(of: &length) { Data($0) }
result.append(contentsOf: output.prefix(size))
try result.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
