import Foundation

/// Bitcoin-alphabet base58, the encoding NEAR uses for keys, signatures and hashes.
enum Base58 {
    private static let alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".utf8)
    private static let indexes: [UInt8: Int] = Dictionary(uniqueKeysWithValues: alphabet.enumerated().map { ($1, $0) })

    static func encode(_ data: Data) -> String {
        var digits: [UInt8] = []
        for byte in data {
            var carry = Int(byte)
            for i in digits.indices {
                carry += Int(digits[i]) << 8
                digits[i] = UInt8(carry % 58)
                carry /= 58
            }
            while carry > 0 {
                digits.append(UInt8(carry % 58))
                carry /= 58
            }
        }
        let zeros = data.prefix { $0 == 0 }.count
        return String(repeating: "1", count: zeros) + String(decoding: digits.reversed().map { alphabet[Int($0)] }, as: UTF8.self)
    }

    static func decode(_ string: String) -> Data? {
        var bytes: [UInt8] = []
        for char in string.utf8 {
            guard let value = indexes[char] else { return nil }
            var carry = value
            for i in bytes.indices {
                carry += Int(bytes[i]) * 58
                bytes[i] = UInt8(carry & 0xff)
                carry >>= 8
            }
            while carry > 0 {
                bytes.append(UInt8(carry & 0xff))
                carry >>= 8
            }
        }
        let zeros = string.utf8.prefix { $0 == alphabet[0] }.count
        return Data(repeating: 0, count: zeros) + Data(bytes.reversed())
    }
}
