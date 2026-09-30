import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/display_models.dart';

class StorageService {
  static const String _keyBackendUrl = "backend_url";
  static const String _keyScreenId = "screen_id";
  static const String _keyDeviceToken = "device_token";
  static const String _keyCachedConfig = "cached_display_config";

  static Future<void> saveBackendUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyBackendUrl, url);
  }

  static Future<String?> getBackendUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyBackendUrl);
  }

  static Future<void> saveCredentials({
    required String screenId,
    required String deviceToken,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyScreenId, screenId);
    await prefs.setString(_keyDeviceToken, deviceToken);
  }

  static Future<Map<String, String?>?> getCredentials() async {
    final prefs = await SharedPreferences.getInstance();
    final screenId = prefs.getString(_keyScreenId);
    final token = prefs.getString(_keyDeviceToken);
    if (screenId != null && token != null) {
      return {'screenId': screenId, 'deviceToken': token};
    }
    return null;
  }

  static Future<void> clearCredentials() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyScreenId);
    await prefs.remove(_keyDeviceToken);
    await prefs.remove(_keyCachedConfig);
  }

  static Future<void> saveCachedConfig(ResolvedConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyCachedConfig, jsonEncode(config.toJson()));
  }

  static Future<ResolvedConfig?> getCachedConfig() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_keyCachedConfig);
    if (raw != null) {
      try {
        final decoded = jsonDecode(raw);
        return ResolvedConfig.fromJson(decoded);
      } catch (_) {}
    }
    return null;
  }
}
