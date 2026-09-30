# JJM TV Player (Android TV Kiosk)

This is a Flutter-based digital signage application designed specifically for Android TV. It serves as the edge client for the JJM Hospital Digital Signage network, acting as an unattended kiosk that overlays marketing campaigns and emergency broadcasts on top of live patient queue feeds.

For a deep dive into the architecture, state machines, offline media caching, and kiosk boot logic, please read [TV_PLAYER_FLOW.md](./TV_PLAYER_FLOW.md).

## Features
- **Unattended Kiosk Mode**: Intercepts Android TV boot events and forces the app to the foreground (requires Technician Menu overlay permission grant).
- **Secure Device Pairing**: Connects to the admin dashboard via a short-lived 6-digit code.
- **Offline Resiliency**: Caches videos and images locally using `path_provider` with a strict 500MB LRU budget and SHA-256 integrity validation.
- **Queue Fallback**: Injects JavaScript mutation observers into the hospital's queue WebView to detect silent freezes and recover gracefully.
- **Real-Time Control**: Instantly responds to WebSockets for config changes, remote screen snapshots, and live-saving emergency sirens.

## Getting Started

1. Install Flutter (Channel stable, targeting `^3.9.2`).
2. Run `flutter pub get` to download dependencies.
3. To compile for Android TV hardware:
   ```bash
   flutter build apk --release
   ```
4. Transfer the generated APK (`build/app/outputs/flutter-apk/app-release.apk`) to your Android TV via a USB stick or MDM.

## Post-Install (Technician Setup)
Because this app locks the TV, standard Android menus might be disabled. To grant system-level overlay permissions natively:
1. Long-press the top right corner of the screen for 5 seconds.
2. A PIN dialog will appear. Enter the default fallback PIN (`9999`) or the custom PIN set in the Admin Website.
3. Click "Request Overlay Permission" and toggle "Kiosk Lock" as required for your hospital's rollout strategy.
