# v1.3.1 Capture Next workflow

Version 1.3.1 / Android versionCode 20. October 4, 2026.

## Behavior

Save → durable local success → Device Type → choose type → Scan → Verify → Location → Save. The existing queue syncs independently; confirmation on Device Type only says Saved & synced after the server acknowledges the exact record. No offline-save regression or queue rewrite. Failed enqueue keeps the original capture.

Project, Building, Floor / Area and explicit batch options remain. Completed equipment type/manufacturer/model and all scanner/recognition/verification/photo/device state clear. Default Room is blank; explicit numeric auto-advance carries only a different next value. Back from completed Type exits to project overview.

## Regression evidence

| Requested check | Verified here |
| --- | --- |
| Project remains selected | Route/reset tests and actual preview screens retain North Tower |
| Next type can change | Actual WAP save → Type → Intercom → Scan |
| No old MAC/serial | Fresh scanner mount; synthetic serial-only second capture has blank MAC, distinct serial and correct History |
| Automatic zoom | Production native policy/CameraControl unchanged; twelve native tests passed in release CI; fresh mount re-arms existing initialization |
| Manual zoom/reset | Existing controller/gesture tests pass; preview 1.2× first capture → 1.0× second capture |
| MAC conflict | Existing exact OCR mismatch/explicit resolution tests pass; actual preview choice removes blocked warning |
| Serial-only | Existing recognition tests and actual Intercom serial-only preview pass |
| Save & sync | Existing service/queue/server-confirmation tests plus actual preview local Pending → acknowledged Synced |
| History both records | Real queue integration with synthetic server and actual History show distinct WAP/Intercom records |

Local gates: npm run typecheck, npm run test:recognition, npx expo prebuild --platform android --no-install passed. Source 117264a1c943c77d1bffd8cb4f5d970d276cf404 passed [GitHub Actions run 37227558977](https://github.com/JmanX/cableminttools-site/actions/runs/37227558977) / job 111510256399. TypeScript and all core/new Capture Next regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly, packaging and binary gates passed. Existing native tests independently requested/acknowledged 1.12× and 1.24× with a camera test double; this is not a physical optics test.

Artifact 11312902152 downloaded without replacing older versioned APKs. Independent local inspection confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.1 / versionCode 20, all native zoom commands/suggestions, shared camera operation, standalone JavaScript and 32 ML Kit assets. New room-reset copy is included; synthetic preview/test identifiers are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.1\CableMint-Device-Capture-v1.3.1.apk`

Size: 145,839,372 bytes. SHA-256: `770f57859e76b615e5dfa0e3fa18f2305eef03d713095507cb6bb9225210d1ba` (matches CI). Older APKs preserved.

## Physical Android follow-up

Install the versioned APK and, in one project, capture a WAP with a genuine distant label (no manual input initially), then use manual zoom and resolve a real conflict if encountered. Confirm verification/location, save, and check direct Device Type return. Select Intercom or another serial-only type. Check 1× reset, empty diagnostics/candidates, no prior MAC/SN, retained Building/Floor and blank Room (or explicitly advanced next numeric Room). Save a different identifier/location; confirm both on native History and website after actual cloud acknowledgement. Back from Type should finish to the project overview. Test default Room clearing and explicit numeric/non-numeric auto-advance separately.

The preview uses synthetic native/network adapters and is excluded from the production bundle. This workspace has no attached physical Android camera/account session for live saves. Existing scanner/integration behavior is user-confirmed field-stable; this release changes only the completed-save navigation/reset behavior.
