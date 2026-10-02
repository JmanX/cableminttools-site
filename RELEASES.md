# CableMint Device Capture releases

Internal Android builds use the existing prototype package and signing setup. Update Expo version, package version, visible Account version (from Expo config), and Android versionName together. Increment Android versionCode for every testing/release build. Each release has a versioned APK copy; retain the original Gradle output and older versioned artifacts. APKs are excluded from Git.

## 1.2.3 — October 2, 2026

Android versionCode: **15**. Focused scanner accuracy and reliability release. Source commit `11116c7e810ef99389a007e7ff55db0c83c2fb73` passed [GitHub Actions run 36937982573](https://github.com/JmanX/cableminttools-site/actions/runs/36937982573) on October 1; APK downloaded and independently verified on October 2. Fresh dependency installation, TypeScript/regression checks, native camera source compilation, Android release assembly, versioned packaging and binary checks passed.

- Original decoded barcode payloads are preserved. Formatting is normalized for comparison, without inventing OCR character corrections. Barcode/OCR disagreements show both sources and block Continue/Save until the technician explicitly chooses or confirms a correction. Edits invalidate a resolution when its selected value changes. Live decoded values still trigger conflict review if photo recognition fails; preview coordinates are never treated as photo geometry. Serial-only and multiple-barcode support and duplicate checks remain.
- Sync Now shows immediate spinner/disabled state even for an empty journal, performs an authenticated server History read, refreshes all four upload counts and the durable last-check timestamp, then confirms in green for three seconds. An empty local queue alone never claims server connectivity; failures show red retry feedback. Manual checks serialize with deletion/refresh.
- Small native change enables ML Kit 17.3.0 zoom suggestions alongside potential-barcode geometry. Suggestions use the existing acknowledged CameraX command with gradual 0.12× steps, stability/cooldown guards and a 4×/hardware cap. Decode/manual adjustment stops auto-zoom; capture/retake resets zoom. Expandable scanner diagnostics distinguish no potential barcode, detected/no request, and requested/not applied. Manual buttons and pinch are preserved.
- Regression coverage includes exact 0C110533D733 / 00110533D733 disagreement, 0/O, C/0, 8/B, formatted equivalence, serial conflicts, live/photo mismatch, explicit resolution and edit invalidation; empty-queue server success/failure, timestamps/counts; suggestions without geometry, stale suggestions, already-decoded inputs, manual override/hardware limits, and a camera acknowledging an unapplied request.

Delivery: [artifact 11198574951](https://github.com/JmanX/cableminttools-site/actions/runs/36937982573/artifacts/11198574951), copied without overwriting older builds to:

`C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.3\CableMint-Device-Capture-v1.2.3.apk`

Size: 137,692,474 bytes. SHA-256: `b3828ef115e4f40b47b55126312bd333854ef798878509c3f11cfcddfafb5f31` (matches CI). Actual manifest: package com.cableminttools.devicecapture.prototype, versionName 1.2.3, versionCode 15. DEX contains both acknowledged zoom commands and the ML Kit suggestion bridge; standalone JavaScript bundle and 32 bundled ML Kit asset entries are present.

Known issues / remaining tests: A physical Android phone must verify the conflict UI with the supplied label, zero-record online/offline Sync Now feedback, and a genuinely distant undecodable barcode. Synthetic geometry tests are not ML Kit optical field tests. No potential detection or suggestion means no automatic zoom. Uploads remain foreground-only; installed photos remain temporary and are not uploaded. Prototype signing; internal testing only. Existing cloud records, website, schema, Dodo and Edge Functions are unchanged.

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
