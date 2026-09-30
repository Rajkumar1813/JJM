import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'core/storage/storage_service.dart';
import 'models/display_models.dart';
import 'screens/pairing/pairing_view.dart';
import 'screens/display/display_engine.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Fullscreen TV Kiosk mode (hide navigation and status bars)
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);

  // Prevent TV from sleeping
  try {
    await WakelockPlus.enable();
  } catch (_) {}

  // Check existing pairing credentials
  final credentials = await StorageService.getCredentials();
  ResolvedConfig? cachedConfig;

  if (credentials != null) {
    cachedConfig = await StorageService.getCachedConfig();
  }

  runApp(JJMHospitalTVApp(
    initialScreenId: credentials?['screenId'],
    initialConfig: cachedConfig,
  ));
}

class JJMHospitalTVApp extends StatelessWidget {
  final String? initialScreenId;
  final ResolvedConfig? initialConfig;

  const JJMHospitalTVApp({
    super.key,
    this.initialScreenId,
    this.initialConfig,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'JJM Hospital Digital Signage',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B1329),
        fontFamily: 'sans-serif',
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF0284C7),
          secondary: Color(0xFF0D9488),
          surface: Color(0xFF1E293B),
        ),
      ),
      home: initialScreenId != null
          ? DisplayEngine(
              screenId: initialScreenId!,
              initialConfig: initialConfig,
            )
          : const PairingView(),
    );
  }
}
