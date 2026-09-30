import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/network/api_service.dart';
import '../../core/storage/storage_service.dart';
import '../../core/websocket/socket_service.dart';
import '../../models/display_models.dart';
import '../display/display_engine.dart';

class PairingView extends StatefulWidget {
  const PairingView({super.key});

  @override
  State<PairingView> createState() => _PairingViewState();
}

class _PairingViewState extends State<PairingView> {
  String _pairingCode = "------";
  bool _isLoading = true;
  String _statusMessage = "Connecting to JJM Hospital Control Server...";
  bool _isServerConnected = false;
  bool _isRetrying = false; // Guard: prevent concurrent background retries
  Timer? _refreshTimer;
  Timer? _autoRetryTimer;

  // JJM Hospital Signature Palette
  static const Color _primaryPurple = Color(0xFF6B3A8A);
  static const Color _accentPurple = Color(0xFF9D6BBA);
  static const Color _lightPurple = Color(0xFFC084FC);
  static const Color _bgDark = Color(0xFF0D0B18);
  static const Color _cardBg = Color(0xFF181528);

  @override
  void initState() {
    super.initState();
    _initPairing();
    // Auto-retry in background every 3 seconds if not connected yet
    _autoRetryTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if ((_pairingCode == "------" || !_isServerConnected) && mounted) {
        _silentBackgroundRetry();
      }
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _autoRetryTimer?.cancel();
    super.dispose();
  }

  Future<void> _silentBackgroundRetry() async {
    if (_isServerConnected && _pairingCode != "------") return;
    if (_isRetrying) return; // Already in-flight, skip
    _isRetrying = true;
    try {
      final session = await ApiService.requestPairingSession();
      if (session != null && session['pairingCode'] != null && mounted) {
        _applyPairingSession(session);
      }
    } finally {
      _isRetrying = false;
    }
  }

  Future<void> _initPairing() async {
    setState(() {
      _isLoading = true;
      _statusMessage = "Connecting to JJM Hospital Server...";
    });

    final session = await ApiService.requestPairingSession();

    if (session != null && session['pairingCode'] != null) {
      if (mounted) {
        _applyPairingSession(session);
      }
    } else {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isServerConnected = false;
          _statusMessage = "Auto-discovering server on hospital network... Retrying automatically.";
        });
      }
    }
  }

  void _applyPairingSession(Map<String, dynamic> session) {
    final code = session['pairingCode'].toString();
    setState(() {
      _pairingCode = code;
      _isLoading = false;
      _isServerConnected = true;
      _statusMessage = "Ready! Enter this code in Admin Panel ➔ Screens to activate.";
    });

    // Connect socket to listen for immediate pairing event
    SocketService.init(
      pairingCode: code,
      onPaired: (data) async {
        if (data['screen'] != null && data['deviceToken'] != null) {
          final screenId = data['screen']['id'];
          final token = data['deviceToken'];
          await StorageService.saveCredentials(screenId: screenId, deviceToken: token);

          ResolvedConfig? config;
          if (data['config'] != null) {
            config = ResolvedConfig.fromJson(data['config']);
            await StorageService.saveCachedConfig(config);
          }

          if (mounted) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => DisplayEngine(screenId: screenId, initialConfig: config),
              ),
            );
          }
        }
      },
    );

    // Auto-refresh pairing code every 14 minutes
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(minutes: 14), (_) {
      _initPairing();
    });
  }

  @override
  Widget build(BuildContext context) {
    final formattedCode = _pairingCode.length == 6
        ? "${_pairingCode.substring(0, 3)}  ${_pairingCode.substring(3)}"
        : _pairingCode;

    return Scaffold(
      backgroundColor: _bgDark,
      body: Stack(
        children: [
          // Background Gradient Orbs in JJM Purple
          Positioned(
            top: -120,
            right: -120,
            child: Container(
              width: 450,
              height: 450,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _primaryPurple.withValues(alpha: 0.18),
              ),
            ),
          ),
          Positioned(
            bottom: -120,
            left: -120,
            child: Container(
              width: 450,
              height: 450,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accentPurple.withValues(alpha: 0.14),
              ),
            ),
          ),

          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 30),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Hospital Brand
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [_primaryPurple, _accentPurple],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: _primaryPurple.withValues(alpha: 0.4),
                              blurRadius: 20,
                              offset: const Offset(0, 6),
                            )
                          ],
                        ),
                        child: const Icon(Icons.local_hospital_rounded, color: Colors.white, size: 36),
                      ),
                      const SizedBox(width: 16),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text(
                            "JJM HOSPITAL KASHIPUR",
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                            ),
                          ),
                          Text(
                            "DIGITAL SIGNAGE & QUEUE DISPLAY PLAYER",
                            style: TextStyle(
                              color: _lightPurple,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.2,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),

                  const SizedBox(height: 38),

                  // Pairing Code Card
                  Container(
                    width: 580,
                    padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 34),
                    decoration: BoxDecoration(
                      color: _cardBg,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: _primaryPurple.withValues(alpha: 0.4), width: 1.5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.6),
                          blurRadius: 40,
                          offset: const Offset(0, 15),
                        )
                      ],
                    ),
                    child: Column(
                      children: [
                        const Text(
                          "SCREEN PAIRING CODE",
                          style: TextStyle(
                            color: Color(0xFFB3B0C7),
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 2.0,
                          ),
                        ),
                        const SizedBox(height: 18),

                        // The 6-digit Code
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F0D1C),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: _isServerConnected ? _accentPurple : const Color(0xFF3B3355),
                              width: 2,
                            ),
                          ),
                          child: _isLoading && _pairingCode == "------"
                              ? const SizedBox(
                                  height: 48,
                                  width: 48,
                                  child: CircularProgressIndicator(color: _accentPurple, strokeWidth: 3),
                                )
                              : Text(
                                  formattedCode,
                                  style: TextStyle(
                                    color: _isServerConnected ? _lightPurple : const Color(0xFF6B6582),
                                    fontSize: 48,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 8.0,
                                    fontFamily: 'monospace',
                                  ),
                                ),
                        ),

                        const SizedBox(height: 20),

                        // Status line with connection dot
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _isServerConnected ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                _statusMessage,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: _isServerConnected ? const Color(0xFFE2E8F0) : const Color(0xFFFDE68A),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 28),
                        Divider(color: _primaryPurple.withValues(alpha: 0.2)),
                        const SizedBox(height: 20),

                        // 3-step Instructions
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildStep("1", "Open Admin Panel", "on any hospital computer"),
                            const SizedBox(width: 16),
                            _buildStep("2", "Screens ➔ Pair", "click 'Pair New Screen'"),
                            const SizedBox(width: 16),
                            _buildStep("3", "Enter Code", "TV will auto-start queue"),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 26),

                  // Refresh Button (No server configuration inputs)
                  TextButton.icon(
                    onPressed: _initPairing,
                    icon: const Icon(Icons.refresh_rounded, color: Color(0xFF9D9AA8), size: 18),
                    label: const Text("Re-check Server", style: TextStyle(color: Color(0xFF9D9AA8))),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep(String num, String title, String subtitle) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF0F0D1C).withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _primaryPurple.withValues(alpha: 0.15)),
        ),
        child: Column(
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [_primaryPurple, _accentPurple],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text(
                num,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF8C889E), fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}
