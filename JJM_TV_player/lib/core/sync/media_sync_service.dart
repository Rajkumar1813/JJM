import 'dart:typed_data';
import 'package:crypto/crypto.dart';

class MediaSyncService {
  /// Verifies that downloaded bytes match the authoritative server SHA-256 hash.
  static bool verifyChecksum(Uint8List bytes, String? expectedSha256) {
    if (expectedSha256 == null ||
        expectedSha256.isEmpty ||
        expectedSha256.startsWith('legacy_') ||
        expectedSha256 == 'unhashed') {
      return true; // Backward compatibility for legacy unhashed files
    }

    final computedHash = sha256.convert(bytes).toString();
    return computedHash.toLowerCase() == expectedSha256.toLowerCase();
  }

  static String computeSha256(Uint8List bytes) {
    return sha256.convert(bytes).toString();
  }
}
