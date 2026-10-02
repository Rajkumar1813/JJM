import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../storage/storage_service.dart';
import '../../models/display_models.dart';

class AuthException implements Exception {
  final String message;
  AuthException(this.message);
  @override
  String toString() => message;
}

class ReconciliationResult {
  final ResolvedConfig? config;
  final int configVersion;
  final int mediaManifestVersion;
  final Map<String, dynamic>? activeEmergency;
  final List<dynamic> pendingCommands;

  ReconciliationResult({
    this.config,
    required this.configVersion,
    required this.mediaManifestVersion,
    this.activeEmergency,
    required this.pendingCommands,
  });
}

class ApiService {
  static String? _resolvedBaseUrl;

  static Future<String> getBaseUrl() async {
    if (_resolvedBaseUrl != null) return _resolvedBaseUrl!;

    final saved = await StorageService.getBackendUrl();
    if (saved != null && saved.isNotEmpty) {
      if (await _testHealth(saved)) {
        _resolvedBaseUrl = saved;
        return saved;
      }
    }

    final candidates = [
      AppConfig.defaultBackendUrl,
      ...AppConfig.candidateUrls,
    ];

    for (final candidate in candidates) {
      if (await _testHealth(candidate)) {
        _resolvedBaseUrl = candidate;
        await StorageService.saveBackendUrl(candidate);
        return candidate;
      }
    }

    return AppConfig.defaultBackendUrl;
  }

  static Future<bool> _testHealth(String base) async {
    try {
      final res = await http.get(Uri.parse('$base/api/health')).timeout(const Duration(seconds: 60));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, String>> _getHeaders() async {
    final creds = await StorageService.getCredentials();
    final headers = {
      'Content-Type': 'application/json',
    };
    if (creds != null && creds['deviceToken'] != null) {
      headers['X-Device-Token'] = creds['deviceToken']!;
    }
    return headers;
  }

  static void _checkAuth(http.Response res) {
    if (res.statusCode == 401 || res.statusCode == 403) {
      throw AuthException('Device token invalid or expired');
    }
  }

  static Future<Map<String, dynamic>?> requestPairingSession({
    String? socketId,
    Map<String, dynamic>? metadata,
  }) async {
    final candidates = <String>[
      if (_resolvedBaseUrl != null) _resolvedBaseUrl!,
      await StorageService.getBackendUrl() ?? '',
      AppConfig.defaultBackendUrl,
      ...AppConfig.candidateUrls,
    ].where((u) => u.isNotEmpty).toSet().toList();

    for (final baseUrl in candidates) {
      try {
        final url = Uri.parse('$baseUrl/api/pairing/session');
        final res = await http.post(
          url,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'socketId': socketId,
            'deviceMetadata': metadata ?? {'platform': 'Android TV', 'version': AppConfig.appVersion},
          }),
        ).timeout(const Duration(seconds: 60));

        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          if (data != null && data['session'] != null) {
            _resolvedBaseUrl = baseUrl;
            await StorageService.saveBackendUrl(baseUrl);
            return data['session'];
          }
        }
      } catch (_) {}
    }
    return null;
  }

  static Future<Map<String, dynamic>?> checkPairingSession(String code, String secret) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/pairing/session/$code?secret=$secret');
      final res = await http.get(url).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true) {
          if (data['status'] == 'paired' && data['config'] != null) {
            final config = ResolvedConfig.fromJson(data['config']);
            await StorageService.saveCachedConfig(config);
            data['config'] = config; // replace raw JSON with parsed config for consumers if they want it
          }
          return data;
        }
      }
    } catch (_) {}
    return null;
  }

  static Future<ResolvedConfig?> fetchDisplayConfig(String screenId) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/display/$screenId/config');
      final res = await http.get(url, headers: await _getHeaders()).timeout(const Duration(seconds: 60));
      _checkAuth(res);

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['config'] != null) {
          final config = ResolvedConfig.fromJson(data['config']);
          await StorageService.saveCachedConfig(config);
          return config;
        }
      }
    } catch (e) {
      if (e is AuthException) rethrow;
    }
    return await StorageService.getCachedConfig();
  }

  static Future<ReconciliationResult?> reconcileState({
    required String screenId,
    int? appliedConfigVersion,
    int? mediaManifestVersion,
  }) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/display/$screenId/reconcile');
      final res = await http.post(
        url,
        headers: await _getHeaders(),
        body: jsonEncode({
          'appliedConfigVersion': appliedConfigVersion,
          'mediaManifestVersion': mediaManifestVersion,
          'playerVersion': AppConfig.appVersion,
        }),
      ).timeout(const Duration(seconds: 8));
      _checkAuth(res);

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true) {
          ResolvedConfig? config;
          if (data['config'] != null) {
            config = ResolvedConfig.fromJson(data['config']);
            await StorageService.saveCachedConfig(config);
          }
          return ReconciliationResult(
            config: config,
            configVersion: data['configVersion'] ?? 1,
            mediaManifestVersion: data['mediaManifestVersion'] ?? 1,
            activeEmergency: data['activeEmergency'],
            pendingCommands: data['pendingCommands'] ?? [],
          );
        }
      }
    } catch (e) {
      if (e is AuthException) rethrow;
    }
    return null;
  }

  static Future<void> acknowledgeCommand({
    required String screenId,
    required String commandId,
    Map<String, dynamic>? resultPayload,
  }) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/display/$screenId/commands/$commandId/ack');
      final res = await http.post(
        url,
        headers: await _getHeaders(),
        body: jsonEncode({'resultPayload': resultPayload ?? {}}),
      ).timeout(const Duration(seconds: 5));
      _checkAuth(res);
    } catch (e) {
      if (e is AuthException) rethrow;
    }
  }

  static Future<void> failCommand({
    required String screenId,
    required String commandId,
    required String errorMessage,
  }) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/display/$screenId/commands/$commandId/fail');
      final res = await http.post(
        url,
        headers: await _getHeaders(),
        body: jsonEncode({'errorMessage': errorMessage}),
      ).timeout(const Duration(seconds: 5));
      _checkAuth(res);
    } catch (e) {
      if (e is AuthException) rethrow;
    }
  }

  static Future<void> sendHeartbeat({
    required String screenId,
    required String currentContent,
    int? appliedConfigVersion,
    int? mediaManifestVersion,
    bool? queueConnected,
    String? queueLastUpdateAt,
    bool? hasMediaError,
  }) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/display/$screenId/heartbeat');
      final res = await http.post(
        url,
        headers: await _getHeaders(),
        body: jsonEncode({
          'currentContent': currentContent,
          'playerVersion': AppConfig.appVersion,
          'appliedConfigVersion': appliedConfigVersion,
          'mediaManifestVersion': mediaManifestVersion,
          'queueConnected': queueConnected,
          'queueLastUpdateAt': queueLastUpdateAt,
          'hasMediaError': hasMediaError,
        }),
      ).timeout(const Duration(seconds: 5));
      _checkAuth(res);
    } catch (e) {
      if (e is AuthException) rethrow;
    }
  }
}
