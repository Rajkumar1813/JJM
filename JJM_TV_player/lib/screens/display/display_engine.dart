// ignore_for_file: constant_identifier_names, deprecated_member_use
import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:video_player/video_player.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../core/network/api_service.dart';
import '../../core/storage/storage_service.dart';
import '../../core/websocket/socket_service.dart';
import '../../core/queue/queue_monitor.dart';
import '../../models/display_models.dart';
import '../pairing/pairing_view.dart';

/// 11-State Formal Finite State Machine for TV Display Engine (Production V2)
enum DisplayState {
  BOOT,
  AUTHENTICATING,
  SYNCING,
  READY,
  QUEUE,
  AD_PLAYBACK,
  EMERGENCY,
  RECOVERING,
  DEGRADED,
  OFFLINE,
  ERROR,
}

class DisplayEngine extends StatefulWidget {
  final String screenId;
  final ResolvedConfig? initialConfig;

  const DisplayEngine({
    super.key,
    required this.screenId,
    this.initialConfig,
  });

  @override
  State<DisplayEngine> createState() => _DisplayEngineState();
}

class _DisplayEngineState extends State<DisplayEngine> with SingleTickerProviderStateMixin {
  DisplayState _currentState = DisplayState.BOOT;
  ResolvedConfig? _config;
  int _currentIndex = 0;
  String _serverBaseUrl = AppConfig.defaultBackendUrl;
  String? _loadedQueueUrl;
  bool _isCampaignPaused = false;

  // Controllers & Monitors
  WebViewController? _webViewController;
  VideoPlayerController? _videoController;
  late QueueMonitor _queueMonitor;

  // Timers
  Timer? _itemTimer;
  Timer? _snapshotTimer;
  Timer? _emergencyAutoDismissTimer;

  final GlobalKey _previewContainerKey = GlobalKey();
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _config = widget.initialConfig;
    _isCampaignPaused = _config?.settings['isPaused'] == true;

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.88, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Initialize Queue Freshness Monitor with configurable threshold
    _queueMonitor = QueueMonitor(
      staleThresholdSeconds: _config?.staleThresholdSeconds ?? 180,
      onStaleDetected: _handleQueueStale,
      onConnectionChanged: (isConnected) {
        if (!isConnected && _currentState != DisplayState.EMERGENCY) {
          _transitionTo(DisplayState.DEGRADED);
        }
      },
    );

    _initFSM();
  }

  @override
  void dispose() {
    _itemTimer?.cancel();
    _snapshotTimer?.cancel();
    _emergencyAutoDismissTimer?.cancel();
    _videoController?.dispose();
    _pulseController.dispose();
    _queueMonitor.dispose();
    SocketService.disconnect();
    super.dispose();
  }

  void _transitionTo(DisplayState newState) {
    if (_currentState == newState) return;
    debugPrint('[FSM Transition] $_currentState -> $newState');
    setState(() {
      _currentState = newState;
    });

    SocketService.updateDiagnostics(
      content: newState == DisplayState.AD_PLAYBACK
          ? 'ad'
          : (newState == DisplayState.EMERGENCY ? 'emergency' : 'queue'),
    );
  }

  Future<void> _initFSM() async {
    _transitionTo(DisplayState.BOOT);
    _serverBaseUrl = await ApiService.getBaseUrl();

    // STAGE 2: AUTHENTICATING
    _transitionTo(DisplayState.AUTHENTICATING);
    final creds = await StorageService.getCredentials();

    await SocketService.init(
      screenId: widget.screenId,
      deviceToken: creds?['deviceToken'],
      appliedConfigVersion: _config?.configVersion ?? 0,
      mediaManifestVersion: _config?.mediaManifestVersion ?? 1,
    );

    _bindSocketCallbacks();

    // STAGE 3: SYNCING (Authoritative REST State Reconciliation)
    await _reconcileAuthoritativeState();
  }

  Future<void> _reconcileAuthoritativeState() async {
    _transitionTo(DisplayState.SYNCING);

    final result = await ApiService.reconcileState(
      screenId: widget.screenId,
      appliedConfigVersion: _config?.configVersion,
      mediaManifestVersion: _config?.mediaManifestVersion,
    );

    if (result != null && result.config != null) {
      _applyResolvedConfig(result.config!);

      // Process any active targeted emergency
      if (result.activeEmergency != null) {
        _applyEmergency(result.activeEmergency);
      }

      // Process pending unacknowledged commands
      for (final cmd in result.pendingCommands) {
        if (cmd is Map) {
          final commandId = cmd['id']?.toString() ?? '';
          final commandType = cmd['command_type']?.toString() ?? '';
          final payload = cmd['payload'];
          if (commandId.isNotEmpty && commandType.isNotEmpty) {
            _executeCommand(commandId, commandType, payload);
          }
        }
      }
    } else {
      // Fallback to cached configuration
      _config ??= await StorageService.getCachedConfig();
      if (_config != null) {
        _applyResolvedConfig(_config!);
      }
    }

    _transitionTo(DisplayState.READY);
    _startDisplayLoop();
  }

  void _applyResolvedConfig(ResolvedConfig newConfig) {
    final queueUrlChanged = _loadedQueueUrl != newConfig.queueUrl;
    _config = newConfig;
    if (_currentIndex >= newConfig.playlist.length) {
      _currentIndex = 0;
    }
    _isCampaignPaused = newConfig.settings['isPaused'] == true;
    _queueMonitor.updateThreshold(newConfig.staleThresholdSeconds);

    SocketService.updateDiagnostics(
      appliedVersion: newConfig.configVersion,
      manifestVersion: newConfig.mediaManifestVersion,
    );

    if (queueUrlChanged || _webViewController == null) {
      _setupWebView(newConfig.queueUrl);
    }

    // Check embedded emergency in settings
    final emergency = newConfig.settings['emergencyAnnouncement'];
    if (emergency is Map) {
      _applyEmergency(Map<String, dynamic>.from(emergency));
    }
  }

  void _setupWebView(String url) {
    if (url.isEmpty) return;
    _loadedQueueUrl = url;

    if (!kIsWeb) {
      try {
        final controller = WebViewController()
          ..setJavaScriptMode(JavaScriptMode.unrestricted)
          ..setBackgroundColor(const Color(0xFF0B1329))
          ..setNavigationDelegate(
            NavigationDelegate(
              onPageFinished: (_) {
                _queueMonitor.notifyQueueUpdated();
                _injectDOMMutationObserver();
              },
              onWebResourceError: (_) {
                _queueMonitor.notifyConnectionError();
              },
            ),
          )
          ..loadRequest(Uri.parse(url));

        setState(() {
          _webViewController = controller;
        });
      } catch (_) {}
    }
  }

  /// Injects DOM Mutation Observer to detect real patient call number updates
  void _injectDOMMutationObserver() {
    if (_webViewController != null && !kIsWeb) {
      const js = '''
        (function() {
          const observer = new MutationObserver(function() {
            window.lastMutation = Date.now();
          });
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        })();
      ''';
      _webViewController!.runJavaScript(js).catchError((_) {});
    }
  }

  void _handleQueueStale() {
    debugPrint('[QueueMonitor] Stale queue detected! Attempting recovery reload...');
    _transitionTo(DisplayState.RECOVERING);

    if (_webViewController != null && !kIsWeb) {
      _webViewController!.reload().then((_) {
        _queueMonitor.notifyQueueUpdated();
        _transitionTo(DisplayState.QUEUE);
      }).catchError((_) {
        _transitionTo(DisplayState.DEGRADED);
      });
    }
  }

  void _bindSocketCallbacks() {
    SocketService.onConfigUpdate = (config) {
      if (mounted) {
        setState(() {
          _applyResolvedConfig(config);
        });
        _startDisplayLoop();
      }
    };

    SocketService.onReconcileRequested = () {
      _reconcileAuthoritativeState();
    };

    SocketService.onCommandReceived = (commandId, commandType, payload) {
      _executeCommand(commandId, commandType, payload);
    };

    SocketService.onEmergencyUpdate = (announcement) {
      _applyEmergency(announcement);
    };

    SocketService.onRequestSnapshot = () {
      _captureAndSendSnapshot();
    };

    SocketService.onUnpaired = () async {
      await StorageService.clearCredentials();
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const PairingView()),
        );
      }
    };

    // Periodic CCTV snapshot (every 30s)
    _snapshotTimer?.cancel();
    _snapshotTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _captureAndSendSnapshot();
    });
  }

  // ==========================================
  // 5-STAGE COMMAND EXECUTION ENGINE
  // ==========================================
  Future<void> _executeCommand(String commandId, String commandType, dynamic payload) async {
    debugPrint('[Command Engine] Executing $commandType ($commandId)');
    final stopwatch = Stopwatch()..start();

    try {
      switch (commandType) {
        case 'SYNC_CONFIG':
          await _reconcileAuthoritativeState();
          SocketService.sendCommandApplied(commandId);
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'appliedConfigVersion': _config?.configVersion ?? 1,
          });
          break;

        case 'RELOAD_QUEUE':
          _transitionTo(DisplayState.RECOVERING);
          if (_webViewController != null && !kIsWeb) {
            await _webViewController!.reload();
            _queueMonitor.notifyQueueUpdated();
          }
          SocketService.sendCommandApplied(commandId);
          _transitionTo(DisplayState.QUEUE);
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'webViewReloaded': true,
          });
          break;

        case 'RESTART_PLAYER':
          SocketService.sendCommandApplied(commandId);
          _itemTimer?.cancel();
          _videoController?.dispose();
          _videoController = null;
          await _initFSM();
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'restarted': true,
          });
          break;

        case 'CLEAR_CACHE':
          SocketService.sendCommandApplied(commandId);
          // Only clear WebView cache — DO NOT clear credentials (would force re-pair)
          if (_webViewController != null && !kIsWeb) {
            await _webViewController!.clearCache();
          }
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'cacheCleared': true,
          });
          break;

        case 'TAKE_SNAPSHOT':
          SocketService.sendCommandApplied(commandId);
          await _captureAndSendSnapshot();
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'snapshotCaptured': true,
          });
          break;

        case 'PLAY_CAMPAIGN':
          setState(() {
            _isCampaignPaused = false;
          });
          SocketService.sendCommandApplied(commandId);
          _startDisplayLoop();
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'isPaused': false,
          });
          break;

        case 'STOP_CAMPAIGN':
          setState(() {
            _isCampaignPaused = true;
          });
          _itemTimer?.cancel();
          _videoController?.pause();
          _videoController?.dispose();
          _videoController = null;
          _transitionTo(DisplayState.QUEUE);
          SocketService.sendCommandApplied(commandId);
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'isPaused': true,
          });
          break;

        case 'EMERGENCY_OVERRIDE':
          if (payload is Map) {
            _applyEmergency(Map<String, dynamic>.from(payload));
          }
          SocketService.sendCommandApplied(commandId);
          SocketService.sendCommandAck(commandId, {
            'durationMs': stopwatch.elapsedMilliseconds,
            'emergencyApplied': true,
          });
          break;

        default:
          SocketService.sendCommandFail(commandId, 'Unsupported command type: $commandType');
      }
    } catch (e) {
      SocketService.sendCommandFail(commandId, e.toString());
    }
  }

  void _applyEmergency(Map<String, dynamic>? announcement) {
    _emergencyAutoDismissTimer?.cancel();
    _emergencyAutoDismissTimer = null;

    if (announcement != null && announcement['active'] != false) {
      _transitionTo(DisplayState.EMERGENCY);
      final duration = announcement['durationSeconds'] ?? announcement['duration'];
      if (duration != null) {
        final sec = int.tryParse(duration.toString()) ?? 0;
        if (sec > 0) {
          _emergencyAutoDismissTimer = Timer(Duration(seconds: sec), () {
            _clearEmergency();
          });
        }
      }
    } else {
      _clearEmergency();
    }
  }

  void _clearEmergency() {
    if (_currentState == DisplayState.EMERGENCY) {
      _transitionTo(DisplayState.QUEUE);
      _startDisplayLoop();
    }
  }

  void _startDisplayLoop() {
    _itemTimer?.cancel();
    if (_currentState == DisplayState.EMERGENCY) return;

    if (_config == null || _config!.playlist.isEmpty || _isCampaignPaused) {
      _transitionTo(DisplayState.QUEUE);
      return;
    }

    if (_currentIndex >= _config!.playlist.length) {
      _currentIndex = 0;
    }

    final currentItem = _config!.playlist[_currentIndex];
    final durationSeconds = currentItem.duration > 0 ? currentItem.duration : 15;

    if (currentItem.type == 'queue') {
      _transitionTo(DisplayState.QUEUE);
    } else {
      _transitionTo(DisplayState.AD_PLAYBACK);
      if (currentItem.type == 'video' && currentItem.mediaUrl != null) {
        _playVideo(currentItem.mediaUrl!);
      }
    }

    if (_config!.playlist.length > 1 && !_isCampaignPaused) {
      _itemTimer = Timer(Duration(seconds: durationSeconds), () {
        _nextPlaylistItem();
      });
    }
  }

  void _nextPlaylistItem() {
    if (_config == null || _config!.playlist.isEmpty) return;
    _videoController?.pause();
    _videoController?.dispose();
    _videoController = null;

    setState(() {
      _currentIndex = (_currentIndex + 1) % _config!.playlist.length;
    });

    _startDisplayLoop();
  }

  void _playVideo(String rawUrl) {
    _videoController?.dispose();
    final url = _resolveMediaUrl(rawUrl);
    if (url.isEmpty) {
      _nextPlaylistItem();
      return;
    }

    try {
      final controller = VideoPlayerController.networkUrl(Uri.parse(url));
      controller.initialize().then((_) {
        if (mounted && _currentState == DisplayState.AD_PLAYBACK) {
          controller.setLooping(true); // Loop video so screen doesn't go black
          setState(() {
            _videoController = controller;
          });
          controller.play();
        } else {
          controller.dispose(); // Mounted check failed, discard
        }
      }).catchError((_) {
        _nextPlaylistItem();
      });
    } catch (_) {
      _nextPlaylistItem();
    }
  }

  String _resolveMediaUrl(String? rawUrl) {
    if (rawUrl == null || rawUrl.isEmpty) return '';
    String url = rawUrl.trim();
    final base = (_serverBaseUrl.isNotEmpty ? _serverBaseUrl : AppConfig.defaultBackendUrl).replaceAll(RegExp(r'/+$'), '');
    if (url.startsWith('/')) {
      url = '$base$url';
    }
    if (!kIsWeb && base.isNotEmpty && url.contains('localhost')) {
      final serverUri = Uri.tryParse(base);
      if (serverUri != null && serverUri.host.isNotEmpty && serverUri.host != 'localhost') {
        url = url.replaceAll('localhost', serverUri.host);
      }
    }
    return url;
  }

  Future<void> _captureAndSendSnapshot() async {
    try {
      final boundary = _previewContainerKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary != null) {
        final image = await boundary.toImage(pixelRatio: 0.5);
        final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
        if (byteData != null) {
          final bytes = byteData.buffer.asUint8List();
          final base64String = 'data:image/png;base64,${base64Encode(bytes)}';
          SocketService.sendSnapshot(base64String);
        }
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final currentItem = (_config != null && _config!.playlist.isNotEmpty)
        ? _config!.playlist[_currentIndex]
        : null;
    final mediaUrl = _resolveMediaUrl(currentItem?.mediaUrl);

    final emergency = _config?.settings['emergencyAnnouncement'];
    final bool isEmergencyActive = _currentState == DisplayState.EMERGENCY && emergency != null;

    return Scaffold(
      backgroundColor: const Color(0xFF0B1329),
      body: RepaintBoundary(
        key: _previewContainerKey,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // LAYER 1: Doctor OPD Live Queue (WebView)
            if (!kIsWeb && _webViewController != null)
              WebViewWidget(controller: _webViewController!)
            else
              _buildQueuePlaceholder(),

            // LAYER 2: Scheduled Campaign Ad (Video / Poster Overlay)
            if (_currentState == DisplayState.AD_PLAYBACK && !_isCampaignPaused)
              _buildAdOverlay(currentItem, mediaUrl),

            // LAYER 3: Emergency Broadcast Override
            if (isEmergencyActive)
              _buildEmergencyOverlay(emergency),

            // LAYER 4: State Diagnostics Pill (Only in Degraded / Recovering state)
            if (_currentState == DisplayState.RECOVERING || _currentState == DisplayState.DEGRADED)
              _buildStatusPill(),
          ],
        ),
      ),
    );
  }

  Widget _buildQueuePlaceholder() {
    return Container(
      color: const Color(0xFF0B1329),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.tv, size: 72, color: Color(0xFF6B3A8A)),
            const SizedBox(height: 16),
            Text(
              _config?.screenName ?? 'JJM Hospital Queue Display',
              style: const TextStyle(fontSize: 28, color: Colors.white, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Doctor OPD Queue: ${_config?.queueUrl ?? "Connecting..."}',
              style: const TextStyle(fontSize: 16, color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAdOverlay(PlaylistItem? item, String url) {
    return Container(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (item?.type == 'video')
            (_videoController != null && _videoController!.value.isInitialized)
                ? Center(
                    child: AspectRatio(
                      aspectRatio: _videoController!.value.aspectRatio,
                      child: VideoPlayer(_videoController!),
                    ),
                  )
                : const Center(
                    child: CircularProgressIndicator(color: Color(0xFF6B3A8A)),
                  )
          else if (item?.type == 'image' && url.isNotEmpty)
            CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.contain,
              placeholder: (_, __) => const Center(
                child: CircularProgressIndicator(color: Color(0xFF6B3A8A)),
              ),
              errorWidget: (_, err, ___) => Container(
                color: const Color(0xFF0B1329),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.broken_image, size: 64, color: Colors.white38),
                      const SizedBox(height: 12),
                      Text(
                        item?.title ?? 'Advertisement',
                        style: const TextStyle(fontSize: 20, color: Colors.white),
                      ),
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Text(
                          url,
                          style: const TextStyle(fontSize: 12, color: Colors.white38),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            _buildQueuePlaceholder(),
        ],
      ),
    );
  }

  Widget _buildEmergencyOverlay(Map<String, dynamic> emergency) {
    final title = emergency['title'] ?? 'EMERGENCY ANNOUNCEMENT';
    final message = emergency['message'] ?? '';
    final severity = emergency['severity'] ?? 'critical';

    final Color alertColor = severity == 'warning' ? const Color(0xFFD97706) : const Color(0xFFDC2626);

    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        return Container(
          decoration: BoxDecoration(
            color: alertColor.withOpacity(0.95),
            border: Border.all(color: Colors.white, width: 8 * _pulseAnimation.value),
          ),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(40),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.warning_amber_rounded, size: 100, color: Colors.white),
                  const SizedBox(height: 24),
                  Text(
                    title.toUpperCase(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 48,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 28,
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildStatusPill() {
    return Positioned(
      bottom: 20,
      right: 20,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.8),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.amber, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.amber),
            ),
            const SizedBox(width: 8),
            Text(
              _currentState == DisplayState.RECOVERING ? 'Reloading Queue...' : 'Degraded Signal',
              style: const TextStyle(color: Colors.amber, fontSize: 13, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}
