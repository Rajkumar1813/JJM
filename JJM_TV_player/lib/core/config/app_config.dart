class AppConfig {
  static const String appVersion = "2.0.0-PROD";
  static const String defaultFallbackQueue = "https://hms.jjmhospitalkashipur.com/qd";

  // Production live backend URL (configurable via build argument --dart-define=BACKEND_URL=...)
  static const String productionBackendUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: "https://jjm-advertising.onrender.com",
  );

  // Candidate hosts for auto discovery (production first, then local hospital LAN fallback)
  static const List<String> candidateUrls = [
    productionBackendUrl,
    "http://10.0.2.2:5000",        // Android Emulator Loopback
    "http://localhost:5000",       // Local fallback
  ];

  static String get defaultBackendUrl => productionBackendUrl;
}
