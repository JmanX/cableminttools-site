# v1.2.5 scanner investigation — October 3, 2026

## Verified causes and limits

- v1.2.4's delivered Kotlin policy called stopDecoded() for ANY nonempty decoded payload, permanently setting enabled=false. The unrelated UPC-E values and the unassigned device-key QR in the recording therefore stop automatic zoom, even if another barcode remains undecoded. Clear codes clears the JS list; it did not re-arm the native policy. JS also reported an automatic stop for any decode.
- The live analyzer, not the still-photo OCR module, already configured enableAllPotentialBarcodes() and setZoomSuggestionOptions(). Its Gradle dependency is bundled ML Kit 17.3.0, which supports both. A clean pinned Expo Camera package was patched and checked locally, including a second idempotent application. Source compilation is required in CI; precompiled camera AARs remain prohibited.
- ML Kit documents suggestions when NO barcode successfully decodes. Unrelated readable codes can suppress this callback. Geometry fallback must operate independently of that restriction.
- The new 94.94-second recording and comparison show 1× and unrelated reads, but all diagnostic panels are collapsed. Zero distinct decoded codes is not a measurement of potential detections. No evidence establishes potential count or an attempted CameraControl request during those intervals; do not attribute them conclusively to the decode latch.
- Automatic and manual requests share CameraControl.setZoomRatio. React polls observe state; they do not drive automatic requests. The effect depends only on camera readiness/stage. Stable barcode settings and a native no-op for unchanged scanner-enabled values avoid unnecessary recreation. Camera generation and capture session counters expose rebind/reset behavior; stale callbacks/acknowledgements cannot affect the current camera.

## Focused correction

Relevance is a zoom heuristic, not MAC/SN ownership. Retail formats are irrelevant; identifier-shaped MAC/plain equipment serial values are candidates; other payloads, including the supplied device-key QR, remain unassigned. ALL original raw values still reach technician review and the existing printed-label/proximity/conflict logic. No cloud record is repaired or changed.

Choose the guide-nearest potential bounding box (corner-point bounds if needed). Require three stable frames and a small/thin target; apply 0.12× steps with 650ms cooldown, clamped to min(4×, hardware maximum). A relevant decoded target nearest the guide suspends requests for that frame, without permanently disabling later targets. Unrelated decodes cannot latch the session off. No fresh potential geometry means no zoom, including an unsupported suggestion alone. Manual buttons/pinch pause until new capture; photo stop and reset remain.

Always-visible native diagnostics show potential, decoded, relevant/irrelevant/unassigned counts, enabled state, callback count, last suggested ratio, actual ratio, policy/CameraControl/application counts and last reason. Detailed diagnostics include frame age, camera generation, capture sessions, configured ML Kit features, last source/application and bounding-box size. Added logs contain no barcode identifiers.

## Evidence and physical test

All newly added native fixtures use synthetic identifiers; no user recording/photo or equipment identifier is shipped in the repo. Twelve native tests exercise policy and the production CameraControl operation, including mixed unrelated decodes + a small potential. The CameraControl interface uses a test-double camera; CI-confirmed independent requests are 1.12× and 1.24×, with separate actual acknowledgements. This verifies the request-to-API path without manual interaction; it does not prove ML Kit optical detection or physical lens movement. GitHub run 37166331749 passed native source compilation and the explicit twelve-test evidence gate. APK assembly and independent binary verification also passed. Source c0028323ef32d86bb9ec683c254f60f596eb833b / code18; artifact11289174856; SHA256 707b7773e41473be6d8547845c75da2d302b9e8bacea352fb636a5acd0adfbfa.

On the phone, start a fresh label capture, do not touch either zoom button or pinch, and hold a genuinely distant undecodable barcode steady in the guide. Keep the visible diagnostics in the recording. Expected evidence is potential >0, increasing automatic CameraControl/application counts and actual ratio >1×. Callback count may stay zero with unrelated decodes; the bounded potential-box fallback should still request zoom. If potential=0, no zoom is correct. Record detailed diagnostics to distinguish absent detection, policy suppression, camera failure, repeated rebinds or manual pause. Then regress manual/pinch, retake reset, relevant decode stop, conflict resolution and Sync Now.

Primary references: https://developers.google.com/ml-kit/vision/barcode-scanning/android and https://developer.android.com/reference/androidx/camera/core/CameraControl#setZoomRatio(float).

Verified internal APK: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.5\CableMint-Device-Capture-v1.2.5.apk`. Optical/hardware field testing remains required.
