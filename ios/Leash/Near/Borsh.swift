import Foundation

/// Just enough Borsh to write a NEAR transaction: little-endian integers, length-prefixed
/// strings and byte vectors, fixed arrays written as they are.
struct BorshWriter {
    private(set) var data = Data()

    mutating func u8(_ v: UInt8) { data.append(v) }
    mutating func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
    mutating func u64(_ v: UInt64) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
    mutating func u128(_ v: UInt128) {
        u64(UInt64(truncatingIfNeeded: v))
        u64(UInt64(truncatingIfNeeded: v >> 64))
    }
    mutating func fixed(_ bytes: Data) { data.append(bytes) }
    mutating func bytes(_ bytes: Data) {
        u32(UInt32(bytes.count))
        data.append(bytes)
    }
    mutating func string(_ s: String) { bytes(Data(s.utf8)) }
}
