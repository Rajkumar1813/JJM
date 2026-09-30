import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';
import '../storage/storage_service.dart';
import '../network/api_service.dart';
import '../../models/display_models.dart';

class SocketService {
  static io.Socket? _socket;
  static Timer? _heartbeatTimer;
  static String? _currentScreenId;
  static String? _currentContent = 'queue';
  static int _appliedConfigVersion = 0;
  static int _mediaManifestVersion = 1;
  static bool _queueConnected = true;
  static DateTime _queueLastUpdateAt = DateTime.now();

  static Function(ResolvedConfig)? onConfigUpdate;
  static Function()? onReconcileRequested;
  static Function(String commandId, String commandType, dynamic payload)? onCommandReceived;
  static Function()? onUnpaired;
  static Function(bool isConnected)? onConnectionChanged;
  static Function(Map<String, dynamic>? announcement)? onEmergencyUpdate;
  static Function()? onRequestSnapshot;

  static Future<void> init({
    String? screenId,
    String? deviceToken,
    String? pairingCode,
    int appliedConfigVersion = 0,
    int mediaManifestVersion = 1,
    Function(Map<String, dynamic>)? onPaired,
  }) async {
    _currentScreenId = screenId;
    _appliedConfigVersion = appliedConfigVersion;
    _mediaManifestVersion = mediaManifestVersion;
    final baseUrl = await ApiService.getBaseUrl();

    disconnect();

    try {
      _socket = io.io(
        baseUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .enableAutoConnect()
            .enableReconnection()
            .setReconnectionDelay(2000)
            .setReconnectionAttempts(999)
            .build(),
      );

      _socket!.onConnect((_) {
        onConnectionChanged?.call(true);

        if (_currentScreenId != null) {
          _socket!.emit('screen:register', {
            'screenId': _currentScreenId,
            'deviceToken': deviceToken,
            'appVersion': AppConfig.appVersion,
            'configVersion': _appliedConfigVersion,
          });
          _startHeartbeat();

          // Trigger authoritative REST reconciliation after socket reconnect
          onReconcileRequested?.call();
        }
      });

      _socket!.onDisconnect((_) {
        onConnectionChanged?.call(false);
      });

      // Listen for pairing event if code provided
      if (pairingCode != null && onPaired != null) {
        _socket!.on('pair:$pairingCode', (data) {
          if (data is Map<String, dynamic>) {
            onPaired(data);
          }
        });
      }

      // Live configuration push
      _socket!.on('config:update', (data) {
        if (data != null && data['config'] != null && onConfigUpdate != null) {
          final config = ResolvedConfig.fromJson(data['config']);
          StorageService.saveCachedConfig(config);
          onConfigUpdate!(config);
        }
      });

      // -------------------------------------------------------------
      // TARGETED COMMAND CENTER LISTENER (V2 5-Stage Lifecycle Handshake)
      // -------------------------------------------------------------
      _socket!.on('device:command', (data) {
        if (data != null && data is Map) {
          final commandId = data['commandId']?.toString();
          final targetScreenId = data['screenId']?.toString();
          final commandType = data['commandType']?.toString();
          final payload = data['payload'];

          // Strictly filter: Only execute if targeted to THIS exact TV
          if (commandId != null &&
              commandType != null &&
              (targetScreenId == null || targetScreenId == _currentScreenId)) {

            // 1. Immediately emit STAGE: RECEIVED back to server
            _socket!.emit('command:received', {
              'commandId': commandId,
              'screenId': _currentScreenId,
            });

            // 2. Dispatch to Display Engine for execution
            onCommandReceived?.call(commandId, commandType, payload);
          }
        }
      });

      // Snapshot request listener
      _socket!.on('command:request_snapshot', (data) {
        if (onRequestSnapshot != null) {
          onRequestSnapshot!();
        }
      });

      // Emergency alert listener
      _socket!.on('emergency:update', (data) {
        if (onEmergencyUpdate != null) {
          try {
            if (data == null) {
              onEmergencyUpdate!(null);
              return;
            }
            final dynamic inner = data is Map ? (data['announcement'] ?? data) : null;
            if (inner is Map) {
              onEmergencyUpdate!(Map<String, dynamic>.from(inner));
            } else {
              onEmergencyUpdate!(null);
            }
          } catch (_) {}
        }
      });

      _socket!.on('emergency:dismiss', (_) {
        onEmergencyUpdate?.call(null);
      });

      // Unpair listener
      _socket!.on('screen:unpaired', (data) {
        final Map map = data is Map ? data : {};
        if (map['screenId'] == null || map['screenId'] == _currentScreenId) {
          onUnpaired?.call();
        }
      });
    } catch (_) {}
  }

  // Notify server of STAGE: APPLIED
  static void sendCommandApplied(String commandId) {
    if (_socket != null && _socket!.connected && _currentScreenId != null) {
      _socket!.emit('command:applied', {
        'commandId': commandId,
        'screenId': _currentScreenId,
      });
    }
  }

  // Notify server of STAGE: ACKNOWLEDGED
  static void sendCommandAck(String commandId, [Map<String, dynamic>? resultPayload]) {
    if (_socket != null && _socket!.connected && _currentScreenId != null) {
      _socket!.emit('command:ack', {
        'commandId': commandId,
        'screenId': _currentScreenId,
        'resultPayload': resultPayload ?? {},
      });
    } else if (_currentScreenId != null) {
      // Fallback via HTTP REST
      ApiService.acknowledgeCommand(
        screenId: _currentScreenId!,
        commandId: commandId,
        resultPayload: resultPayload,
      );
    }
  }

  // Notify server of STAGE: FAILED
  static void sendCommandFail(String commandId, String errorMessage) {
    if (_socket != null && _socket!.connected && _currentScreenId != null) {
      _socket!.emit('command:fail', {
        'commandId': commandId,
        'screenId': _currentScreenId,
        'errorMessage': errorMessage,
      });
    } else if (_currentScreenId != null) {
      ApiService.failCommand(
        screenId: _currentScreenId!,
        commandId: commandId,
        errorMessage: errorMessage,
      );
    }
  }

  static void updateDiagnostics({
    String? content,
    int? appliedVersion,
    int? manifestVersion,
    bool? queueConnected,
    DateTime? queueLastUpdate,
  }) {
    if (content != null) _currentContent = content;
    if (appliedVersion != null) _appliedConfigVersion = appliedVersion;
    if (manifestVersion != null) _mediaManifestVersion = manifestVersion;
    if (queueConnected != null) _queueConnected = queueConnected;
    if (queueLastUpdate != null) _queueLastUpdateAt = queueLastUpdate;
  }

  static void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_socket != null && _socket!.connected && _currentScreenId != null) {
        _socket!.emit('screen:heartbeat', {
          'screenId': _currentScreenId,
          'currentContent': _currentContent,
          'playerVersion': AppConfig.appVersion,
          'appliedConfigVersion': _appliedConfigVersion,
          'mediaManifestVersion': _mediaManifestVersion,
          'queueConnected': _queueConnected,
          'queueLastUpdateAt': _queueLastUpdateAt.toIso8601String(),
        });
      }
    });
  }

  static void sendSnapshot(String base64Image) {
    if (_socket != null && _socket!.connected && _currentScreenId != null) {
      _socket!.emit('screen:snapshot', {
        'screenId': _currentScreenId,
        'image': base64Image,
      });
    }
  }

  static void disconnect() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _socket?.dispose();
    _socket = null;
  }
}
