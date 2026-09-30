import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../storage/storage_service.dart';
import '../../models/display_models.dart';

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

    // Auto-discover candidate behind the scenes
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
      final res = await http.get(Uri.parse('$base/api/health')).timeout(const Duration(milliseconds: 1800));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // Request new pairing session from backend with auto discovery
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
        final url = Uri.parse('$baseUrl/api/screens/pair-session');
        final res = await http.post(
          url,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'socketId': socketId,
            'deviceMetadata': metadata ?? {'platform': 'Android TV', 'version': AppConfig.appVersion},
          }),
        ).timeout(const Duration(seconds: 3));

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

  // Fetch resolved display configuration for registered screen
  static Future<ResolvedConfig?> fetchDisplayConfig(String screenId) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/display/$screenId/config');
      final res = await http.get(url).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['config'] != null) {
          final config = ResolvedConfig.fromJson(data['config']);
          await StorageService.saveCachedConfig(config);
          return config;
        }
      }
    } catch (_) {}
    return await StorageService.getCachedConfig();
  }

  /// Authoritative REST State Reconciliation (Called on Boot & Socket Reconnect)
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
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'appliedConfigVersion': appliedConfigVersion,
          'mediaManifestVersion': mediaManifestVersion,
          'playerVersion': AppConfig.appVersion,
        }),
      ).timeout(const Duration(seconds: 8));

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
    } catch (_) {}
    return null;
  }

  // Fallback REST Command Acknowledgment
  static Future<void> acknowledgeCommand({
    required String screenId,
    required String commandId,
    Map<String, dynamic>? resultPayload,
  }) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/screens/$screenId/commands/$commandId/ack');
      await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'resultPayload': resultPayload ?? {}}),
      ).timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  // Fallback REST Command Failure
  static Future<void> failCommand({
    required String screenId,
    required String commandId,
    required String errorMessage,
  }) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/screens/$screenId/commands/$commandId/fail');
      await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'errorMessage': errorMessage}),
      ).timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  // Enhanced HTTP Fallback Heartbeat with rich diagnostics
  static Future<void> sendHeartbeat({
    required String screenId,
    required String currentContent,
    int? appliedConfigVersion,
    int? mediaManifestVersion,
    bool? queueConnected,
    String? queueLastUpdateAt,
  }) async {
    try {
      final baseUrl = await getBaseUrl();
      final url = Uri.parse('$baseUrl/api/display/$screenId/heartbeat');
      await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'currentContent': currentContent,
          'playerVersion': AppConfig.appVersion,
          'appliedConfigVersion': appliedConfigVersion,
          'mediaManifestVersion': mediaManifestVersion,
          'queueConnected': queueConnected,
          'queueLastUpdateAt': queueLastUpdateAt,
        }),
      ).timeout(const Duration(seconds: 5));
    } catch (_) {}
  }
}
