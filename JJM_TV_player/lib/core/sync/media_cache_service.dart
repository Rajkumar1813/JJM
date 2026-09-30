import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../../models/display_models.dart';
import 'media_sync_service.dart';

class MediaCacheService {
  static const int maxDiskBudgetBytes = 500 * 1024 * 1024; // 500MB
  static const String _lruKey = 'media_cache_lru';

  static Directory? _cacheDir;
  static bool _isSyncing = false;
  static int _currentManifestVersion = 0;
  static bool _isManifestSynced = false;

  static Future<void> init() async {
    if (_cacheDir != null) return;
    if (kIsWeb) return;
    final appDir = await getApplicationDocumentsDirectory();
    _cacheDir = Directory('${appDir.path}/media_cache');
    if (!await _cacheDir!.exists()) {
      await _cacheDir!.create(recursive: true);
    }
  }

  static bool get isManifestSynced => _isManifestSynced;
  static int get currentManifestVersion => _currentManifestVersion;

  /// Returns local file URI if fully cached, else network URL
  static Future<String> getMediaUrl(String networkUrl) async {
    if (kIsWeb || _cacheDir == null) return networkUrl;
    final filename = MediaSyncService.computeSha256(Uint8List.fromList(utf8.encode(networkUrl)));
    final file = File('${_cacheDir!.path}/$filename');
    if (await file.exists()) {
      await _recordAccess(filename);
      return file.uri.toString();
    }
    return networkUrl;
  }

  /// Syncs a playlist's media items in the background one by one
  static Future<void> syncPlaylist(List<PlaylistItem> items, int manifestVersion) async {
    if (kIsWeb || _cacheDir == null) {
      _isManifestSynced = true;
      _currentManifestVersion = manifestVersion;
      return;
    }
    if (_isSyncing) return;
    _isSyncing = true;
    _isManifestSynced = false;

    try {
      for (final item in items) {
        final url = item.mediaUrl;
        final expectedHash = item.sha256Hash;
        if (url == null || url.isEmpty || item.type == 'queue') continue;

        final filename = MediaSyncService.computeSha256(Uint8List.fromList(utf8.encode(url)));
        final file = File('${_cacheDir!.path}/$filename');

        if (await file.exists()) {
          // If we have it and hash matches (or no expected hash), skip
          if (expectedHash == null || expectedHash.isEmpty) continue;
          final bytes = await file.readAsBytes();
          if (MediaSyncService.verifyChecksum(bytes, expectedHash)) {
            continue;
          }
          // Hash mismatch, delete and re-download
          await file.delete();
        }

        await _enforceDiskBudget();
        await _downloadFile(url, file, expectedHash);
      }
      _currentManifestVersion = manifestVersion;
      _isManifestSynced = true;
    } finally {
      _isSyncing = false;
    }
  }

  static Future<void> _downloadFile(String url, File file, String? expectedHash) async {
    try {
      final request = http.Request('GET', Uri.parse(url));
      final response = await request.send();
      if (response.statusCode == 200) {
        final bytes = await response.stream.toBytes();
        if (expectedHash == null || expectedHash.isEmpty || MediaSyncService.verifyChecksum(bytes, expectedHash)) {
          await file.writeAsBytes(bytes);
          await _recordAccess(file.uri.pathSegments.last);
        }
      }
    } catch (_) {}
  }

  static Future<void> _recordAccess(String filename) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_lruKey);
    Map<String, int> lru = {};
    if (raw != null) {
      try {
        lru = Map<String, int>.from(jsonDecode(raw));
      } catch (_) {}
    }
    lru[filename] = DateTime.now().millisecondsSinceEpoch;
    await prefs.setString(_lruKey, jsonEncode(lru));
  }

  static Future<void> _enforceDiskBudget() async {
    if (_cacheDir == null) return;
    int totalSize = 0;
    final List<File> files = [];
    
    try {
      await for (final entity in _cacheDir!.list()) {
        if (entity is File) {
          files.add(entity);
          totalSize += await entity.length();
        }
      }

      if (totalSize <= maxDiskBudgetBytes) return;

      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_lruKey);
      Map<String, int> lru = {};
      if (raw != null) {
        try {
          lru = Map<String, int>.from(jsonDecode(raw));
        } catch (_) {}
      }

      // Sort files by last access time (oldest first)
      files.sort((a, b) {
        final aTime = lru[a.uri.pathSegments.last] ?? 0;
        final bTime = lru[b.uri.pathSegments.last] ?? 0;
        return aTime.compareTo(bTime);
      });

      for (final file in files) {
        if (totalSize <= maxDiskBudgetBytes) break;
        final size = await file.length();
        await file.delete();
        lru.remove(file.uri.pathSegments.last);
        totalSize -= size;
      }

      await prefs.setString(_lruKey, jsonEncode(lru));
    } catch (_) {}
  }

  static Future<void> clearCache() async {
    if (_cacheDir != null) {
      try {
        if (await _cacheDir!.exists()) {
          await _cacheDir!.delete(recursive: true);
          await _cacheDir!.create(recursive: true);
        }
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_lruKey);
      } catch (_) {}
    }
  }
}
