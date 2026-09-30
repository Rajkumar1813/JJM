import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class KioskChannel {
  static const MethodChannel _channel = MethodChannel('com.jjm.tv/kiosk');

  /// Remotely brings the TV app to front, overriding whatever is running on screen
  static Future<bool> bringToFront() async {
    if (kIsWeb) return true;
    try {
      final res = await _channel.invokeMethod<bool>('bringToFront');
      return res ?? true;
    } catch (e) {
      debugPrint('[KioskChannel] Failed to bring to front: $e');
      return false;
    }
  }

  /// Remotely minimizes/exits the app back to Android TV Home launcher
  static Future<bool> minimizeApp() async {
    if (kIsWeb) return true;
    try {
      final res = await _channel.invokeMethod<bool>('minimizeApp');
      return res ?? true;
    } catch (e) {
      debugPrint('[KioskChannel] Failed to minimize app: $e');
      return false;
    }
  }

  /// Checks if SYSTEM_ALERT_WINDOW ("Draw over other apps") is granted
  static Future<bool> checkOverlayPermission() async {
    if (kIsWeb) return true;
    try {
      final res = await _channel.invokeMethod<bool>('checkOverlayPermission');
      return res ?? true;
    } catch (_) {
      return true;
    }
  }

  /// Launches settings to grant overlay permission
  static Future<void> requestOverlayPermission() async {
    if (kIsWeb) return;
    try {
      await _channel.invokeMethod('requestOverlayPermission');
    } catch (_) {}
  }
}
