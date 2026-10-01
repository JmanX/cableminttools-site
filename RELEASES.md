# CableMint Device Capture releases

Internal Android builds use the existing prototype package and signing setup. Update Expo version, package version, visible Account version (from Expo config), and Android versionName together. Increment Android versionCode for every testing/release build. Each release has a versioned APK copy; retain the original Gradle output and older versioned artifacts. APKs are excluded from Git.

## 1.2.2 — October 1, 2026

Android versionCode: **14**. Native compilation, regression checks, versioned packaging and binary verification passed in [GitHub Actions run 36923897188](https://github.com/JmanX/cableminttools-site/actions/runs/36923897188). Source builds 12–13 exposed a Kotlin nested-map inference error; build 14 constructs typed barcode/frame maps field by field. Build 10 was superseded by interrupted-sync recovery; binary inspection rejected build 11 because Expo linked an unmodified precompiled camera library. Both candidates are excluded from delivery.

- Explicit Sync Now / Syncing… / Synced ✓ / Sync Failed — Retry states, spinner, disabled repeated presses, and 2.5-second success feedback.
- Pending/uploading/failed counts, explicit empty-queue feedback, upload errors, and retries using the existing stable record IDs, including recovery after a local status write fails. Success requires server-confirmed captures.
- Manual buttons and pinch control the actual CameraX zoom ratio, clamped to hardware limits; the displayed ratio follows CameraX acknowledgement.
- Independent native scanner-state command supplies ML Kit bounding boxes/corners. Centered small barcodes trigger gradual zoom, with cooldown and a 4×/hardware cap; decode or manual control stops automatic zoom until reset.
- Normal zoom restored for each new capture/retake. Development logs include current/requested zoom, target size, trigger, and decode success.
- Camera module forced to build from source so Kotlin geometry/zoom patches reach the APK; binary verification rejects builds without the new native commands.
- Versioned APK packaging validates native metadata against Expo config and preserves the original build output.

Delivery: `device-capture/.artifacts/1.2.2/CableMint-Device-Capture-v1.2.2.apk` (137,677,046 bytes), [artifact 11194085141](https://github.com/JmanX/cableminttools-site/actions/runs/36923897188/artifacts/11194085141). SHA-256: `0175437a078745497973f2f325a1bc216e85147a5391f865fd8f5780269ac9c7`. The downloaded APK manifest confirms versionName 1.2.2 / versionCode 14; both native zoom commands, standalone JavaScript and bundled ML Kit assets are present. Source commit: `988a50c8bde054f54b5bc16c5351bde35b742821`.

Known issues: Real-phone v1.2.2 zoom and sync feedback still require field verification. Auto-zoom needs ML Kit to detect a potential barcode; absent geometry does not trigger zoom. Uploads run while the app is open. Installed photos remain temporary and are not uploaded. Internal APK uses prototype signing; it is not a store release.

## 1.2.1 — September 29, 2026

Android versionCode: **9**. Native build passed.

Durable upload queue, installed-photo review, scanner geometry integration, and camera controls. Field testing confirmed projects, navigation, Supabase save, website visibility, History, delete sync, duplicate warnings, camera/gallery and flashlight. Field testing found insufficient sync feedback and nonfunctional camera zoom; addressed in 1.2.2.

## 1.2.0 — September 29, 2026

Android versionCode: **8**. Native build passed.

Cloud-save verification, navigation and server-backed History improvements. Superseded by subsequent reliability releases.
