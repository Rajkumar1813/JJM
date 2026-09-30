import 'dart:async';

class QueueMonitor {
  DateTime _lastUpdate = DateTime.now();
  int staleThresholdSeconds;
  bool _isConnected = true;
  Timer? _freshnessTimer;
  Function()? onStaleDetected;
  Function(bool isConnected)? onConnectionChanged;

  QueueMonitor({
    this.staleThresholdSeconds = 180,
    this.onStaleDetected,
    this.onConnectionChanged,
  }) {
    startMonitoring();
  }

  DateTime get lastUpdate => _lastUpdate;
  bool get isConnected => _isConnected;

  bool get isStale {
    final diff = DateTime.now().difference(_lastUpdate).inSeconds;
    return diff > staleThresholdSeconds;
  }

  int get ageInSeconds {
    return DateTime.now().difference(_lastUpdate).inSeconds;
  }

  void notifyQueueUpdated() {
    _lastUpdate = DateTime.now();
    _setConnected(true);
  }

  void notifyConnectionError() {
    _setConnected(false);
  }

  void _setConnected(bool connected) {
    if (_isConnected != connected) {
      _isConnected = connected;
      onConnectionChanged?.call(_isConnected);
    }
  }

  void updateThreshold(int seconds) {
    if (seconds > 0) {
      staleThresholdSeconds = seconds;
    }
  }

  void startMonitoring() {
    _freshnessTimer?.cancel();
    _freshnessTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (isStale) {
        onStaleDetected?.call();
      }
    });
  }

  void dispose() {
    _freshnessTimer?.cancel();
    _freshnessTimer = null;
  }
}
