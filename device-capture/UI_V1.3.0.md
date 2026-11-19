# CableMint Device Capture v1.3.0

## Design and boundaries

October 4, 2026. The user confirms v1.2.5 scanner/cloud behavior is stable. This release changes presentation and navigation, with existing APIs, database columns, duplicate guards and queue publication semantics preserved. The locked logo matches the original brand asset SHA-256 `a769f60ee9947e61edaa6bb901ea4b270242507c9044056287f8c8d78e92c2c8`. Original line icons use no reference-app artwork. Theme tokens live in `src/theme.ts`; shared components in `src/components.tsx`.

The camera's native scan-guide geometry stays 8–92% horizontally / 27–73% vertically. All ML Kit configuration, native zoom control/policy, camera adapter, recognition reconciliation and service/queue files are unchanged. A focus prop only suspends the preview while other tabs are shown; React capture values remain mounted. Save retry IDs and resolution guards remain unchanged. Closed capture routes are removed so Back cannot enter an empty scanner screen.

Project device counts use available server/cache records plus distinct outstanding local records. No location-progress denominator, task backend or schema is invented. Photos stay temporary. Server sync is claimed only for uploaded queue items/server records. An unconfirmed or unavailable server check is labeled with cached-data guidance.

## Local UI preview

`npm run preview:ui` opens a development server at `http://127.0.0.1:8130`. The browser renders the **actual FieldWorkspace, DeviceScanner and shared components** using development adapters in `scripts/ui-preview/`. These adapters provide synthetic projects, memory-only storage, camera/OCR and delayed success/failure responses. They do not access Supabase or the physical camera and are never imported by the Android app entry point.

Preview controls select phone width and offline/serial-only fixtures. Field tests below must use the APK. Stop the preview terminal after inspection.

## Regression evidence and final phone checklist

| Requested flow | Verification completed | Final Android smoke check |
|---|---|---|
| 1. Sign in | Existing session/auth handling preserved; auth storage regression; new form typechecked | Sign in with existing CableMint account, keyboard/relaunch |
| 2. Create project | Service validation/ownership/idempotent creation regressions; actual UI fixture shows disabled Creating… then opens the new overview | Create a disposable test job |
| 3. Select project | Actual UI preview opens overview and capture types from server fixtures | Select existing job and inspect real counts |
| 4. Camera scan | Actual UI → existing capture/recognition handler using synthetic native adapter | Scan real equipment label |
| 5. Gallery scan | Actual UI → existing gallery/recognition handler → sourced conflict | Android picker and real label |
| 6. Automatic zoom | Unchanged native policy/guide/commands; twelve native tests pass in release build | Distant undecoded barcode, no manual interaction |
| 7. Manual zoom | Actual UI controls reach existing driver; preview ratio 1.0→1.2; adapter clamp/reset regressions | Buttons and pinch on lens |
| 8. Flashlight | Preview changes On→Off through existing torch prop | Verify physical flashlight |
| 9. MAC conflict | Preview conflict blocks Continue, source choice resolves, positive state remains across History/Capture tabs; existing exact mismatch/OCR regressions | Conflicting real OCR/barcode, edit invalidation |
| 10. Serial-only | Camera adapter with serial-only OCR leaves MAC blank and allows Continue | Real serial-only equipment |
| 11. Supabase save | Existing ownership/duplicate/idempotence/service/queue regressions; preview local confirmation before simulated server acknowledgement | Save one confirmed test device |
| 12. Website visibility | No website/service/schema changes; v1.2.5 user-confirmed | Verify new test device on website |
| 13. History | Actual preview shows saved record; compact/colon/dash/dotted MAC search tests; project/type/serial/location search regressions | Refresh/search real server History |
| 14. Duplicate warning | Existing service/queue duplicate checks and UI error/detail path preserved | Repeat test MAC/SN, ensure no extra record |
| 15. Delete sync | Existing delete handler and durable forget/restart regressions preserved; details expose delete | Delete disposable device, verify both surfaces |
| 16. Sync feedback | Preview empty local queue gives immediate disabled spinner; delayed check gives green confirmation and new timestamp; offline gives red retry; retry confirms; existing checkedSync tests | Online/offline Sync Now with zero pending |
| 17. Back/navigation | Actual preview Location→Verify Back and tab resume retain identifiers/resolution; root/stage listeners use existing guards | Hardware Back, leaving held save, different-project warning |

TypeScript and `npm run test:recognition` pass, including added presentation status scoping and no premature Synced checks. UI inspection used 360/390-point phone widths and fixed 780-point content height; bottom tabs sit outside the ScrollView and remain present during capture. The development preview is not an Android emulator.

## Known limits

Foreground-only uploads, internal prototype signing, Android-only build, no task backend, no native checkout. Installed-photo check uses existing batch option and transient photo. No attached physical Android phone is available for this agent; final APK smoke checks are explicitly pending.

Read-only live integration check on October 4 confirmed the existing project/device column contract. No schema or service changes were needed. Record details and its Back action, plus the honest Tasks empty state, were also checked in the actual UI preview.

## Verified internal APK

Source aff4a87bdb385600a8e78449228d328eff10b941 passed [GitHub Actions run 37209055014](https://github.com/JmanX/cableminttools-site/actions/runs/37209055014) / job 111456289183. TypeScript, all recognition/service/auth/queue/sync/manual zoom regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly and binary gates passed. Native tests logged independent 1.12×/1.24× requests and actual acknowledgements with a camera test double; the physical Android smoke checklist remains pending.

Downloaded artifact 11305744745 independently confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.0 / versionCode 19, native zoom commands/suggestions, shared CameraControl operation, SVG/safe-area packages, redesigned UI and standalone JS with 32 ML Kit assets. Synthetic development-preview identifiers/labels are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.0\CableMint-Device-Capture-v1.3.0.apk`

Size: 145,838,356 bytes. SHA-256: `1ad8023a0af43b749358b3ae35ccef954845873a83198041fbe901cb343c702f` (matches CI). Older versioned APKs are preserved.
