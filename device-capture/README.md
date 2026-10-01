# CableMint Device Capture — Android Milestone 2

Version 1.1.1 adds in-app project creation and connects the existing native scanner to the existing CableMint Supabase backend. Use `../CABLEMINT_CONTEXT.md` as the technical source of truth. The sections for 1.0.x below are historical.

## Approved backend permission correction

Read-only checks found missing authenticated SELECT/INSERT/DELETE privileges on field_devices. With explicit user approval, only those three privileges were granted. Follow-up checks confirm RLS and ownership policies remain unchanged, UPDATE remains unavailable, and anonymous reads remain denied. No table structure, billing, website, or Edge Function changes were made. Actual-account phone validation remains required.

## Current workflow

Sign in with your existing CableMint email/password → select your own project → set Building, Floor/Area, Device Type, Manufacturer, Model and Unit/Room/Location → Scan with Camera or Choose Existing Photo → select/correct MAC and serial → check technician verification → Save & Next. Serial-only devices are valid. Batch settings persist per account/project on this phone; optional numbering advances only after a confirmed save. Current Project Devices supports refresh and confirmed delete.

The app reads existing active/trialing Pro entitlement from Supabase. It contains no checkout or Dodo API integration. Auth sessions are encrypted in SecureStore. The public Supabase client configuration relies on signed-in sessions and existing RLS. No production website, backend schema/policy, billing setup, or Edge Function changes are included.

Native ML Kit barcode/OCR and conservative spatial matching are preserved. Unlabelled hex codes are not automatically MACs. Ambiguous values remain selectable candidates, with assignment reasons and editable fields. Photos are processed locally and temporary cache copies are removed; original gallery photos remain. Only verified device text records are sent to Supabase.

Saving needs internet. MAC and serial duplicates are checked within the selected project, including normalized MAC and case-insensitive serial comparison. Existing schema has no atomic uniqueness constraint, so concurrent clients can still race. Uncertain saves retain the same UUID and locked fields for safe retry while the app remains open. There is no offline queue; after closing during an uncertain save, inspect project devices before rescanning.

## Implementation and verification

`src/MobileApp.tsx` owns auth/projects/batch/list screens; `src/DeviceScanner.tsx` preserves camera/gallery/review. `src/deviceService.ts` handles session-scoped access, existing entitlement reads, duplicates, insert reconciliation and delete. `src/sessionStorage.ts` provides encrypted chunked session persistence. `src/deviceWorkflow.ts` contains validation and numbering. Scanner parsing remains in `src/recognition.ts`; bundled Android ML Kit integration remains in `modules/cablemint-ocr`.

Run `npm run typecheck` and `npm run test:recognition`. Service tests use a mock, not production writes. Native compile/packaging uses the existing GitHub Actions workflow. Actual-account sign-in, token refresh/restart, ownership/RLS writes/deletes, Pro transitions, batch persistence, connection failure/retry, and camera/gallery accuracy still need phone testing in a designated test project. Test serial-only save, both duplicate identifiers, number advancement and gallery-original preservation. Do not treat synthetic parser tests as a measured field accuracy rate.
## Build a test APK with GitHub Actions (no Expo account)

The pull request workflow `.github/workflows/device-capture-android.yml` compiles an installable **standalone prototype APK** from this directory and uploads it as `cablemint-device-capture-prototype-apk` on the workflow run. Download that artifact from the GitHub Actions run, extract `app-release.apk`, and install it on an Android phone. The release variant embeds JavaScript and uses the generated debug signing key for prototype testing only; it is not a Play Store release. It needs no Expo account or running Metro server.

## Build an internal Android APK with EAS (optional)

Requires Node.js 22.13+ and an Expo account. Run commands from this directory:

```sh
npm ci
npm run typecheck
npm run test:recognition
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile in `eas.json` requests an internally distributed APK. EAS prompts for initial project setup and Android signing if needed. Install the APK from the build link on an Android phone and grant camera access. The app does **not** need a Metro server for the `preview` build. For iterative debugging, use the `development` profile, install its APK, then run `npx expo start --dev-client` on the same network.

Chrome and the local EAS CLI are now signed in to the CableMint Tools Expo account. This app is not yet linked to that existing EAS project. The GitHub Actions prototype build is the account-free route. Real-label accuracy still requires an Android phone test. Expo Go cannot load the custom OCR module.

## Field test

Use the four reference equipment labels from the earlier conversation: Akuvox, Omada, UNV, and TP-Link. For each, note:

| Label | Barcode values seen | Printed MAC correct? | Serial correct? | Wrong MAC suggested? | Manual correction time |
| --- | --- | --- | --- | --- | --- |
| Akuvox | | | | | |
| Omada | | | | | |
| UNV | | | | | |
| TP-Link | | | | | |

Test a fresh close-up capture with good light and focus. A missed value is acceptable for a first prototype; a wrong value silently presented as confirmed is not. Test whether the still-image barcode pass adds values missed by the live preview. The UNV label may legitimately have a serial without a MAC.

## Implementation notes

- `App.tsx` owns the camera and review UI.
- `src/recognition.ts` keeps label parsing and candidate association separate from the camera. Its checks run with `npm run test:recognition`.
- `modules/cablemint-ocr` is an Android-only local Expo module generated from the official Expo module template, with native local-file barcode and OCR methods. Expo autolinking includes it during prebuild/EAS Build.
- `assets/CableMintToolsLogo.png` is an **unchanged copy** of the approved locked CableMint logo. Do not redraw or modify it.
- Generated `android/`, `node_modules/`, and `.test/` are ignored. `npm ci` uses the checked-in lockfile.

Before milestone 2, confirm scanner performance on real labels. Only then implement account access, project/location workflow, `field_devices` writes, Pro gating, and duplicate checks using the context file.

## First successful APK

GitHub Actions run [36362683802](https://github.com/JmanX/cableminttools-site/actions/runs/36362683802) passed native compilation and uploaded [the prototype APK artifact](https://github.com/JmanX/cableminttools-site/actions/runs/36362683802/artifacts/10946452017). Extract the ZIP and install app-release.apk. The archive was inspected and contains assets/index.android.bundle plus bundled barcode and Latin OCR models. Physical-device launch and recognition accuracy remain to be tested.

## Version 1.0.1 loading fix

Live decoded values are visible below the camera; Review read codes opens them without taking a photo. Capture is bounded to 10 seconds, then barcode and OCR recognition each to 12 seconds. Failures identify the stage and preserve live values for review. This removes the Expo Camera still-image URL scanner dependency on an absent optional image-loader service. Version code 2 installs over the first prototype when signed with the same generated debug key. Phone verification remains required.

Replacement build 1.0.1 passed [GitHub Actions run 36364777329](https://github.com/JmanX/cableminttools-site/actions/runs/36364777329); [APK ZIP artifact](https://github.com/JmanX/cableminttools-site/actions/runs/36364777329/artifacts/10946539958). Extract and install app-release.apk over the first prototype. Verify live-code visibility, Review read codes, and Capture label on a real phone.

## Version 1.0.2 spatial classification and gallery

Native OCR words/lines and barcodes retain bounding boxes, corner points, and image dimensions. Printed anchors determine MAC and serial ownership by spatial proximity, including tilted labels. Unique associated barcodes override nearby OCR typos; ambiguous detections remain unassigned. The Akuvox synthetic regression resolves MAC `0C:11:05:33:D7:33` and serial `P1U922QJ00465` even when OCR reads `DC110533D733` and returns shuffled lines. Geometry, raw codes, assignment reasons, and technician edit fields remain available in review.

Choose Existing Photo grants access through the system picker without broad storage permissions. It scans a temporary cache copy, deletes that copy, and preserves the original. Gallery scans never inherit live barcodes from a previous label. Flashlight controls are Turn On Flashlight / Turn Off Flashlight. No image or result is uploaded or saved to a backend.

Typecheck, recognition/timeout/privacy regression checks, and Android prebuild passed. Phone validation remains required: scan the Akuvox label using camera and gallery, confirm both fields and their assignment reasons, test ambiguous labels, cancel gallery selection, toggle the flashlight, and verify a gallery original remains available afterward.

Version 1.0.2 passed native compilation in [GitHub Actions run 36479027245](https://github.com/JmanX/cableminttools-site/actions/runs/36479027245), producing APK artifact 10996536046. Extract the downloaded ZIP and install `app-release.apk`. The APK includes its JavaScript bundle and bundled ML Kit assets. SHA-256: `8674b54da289645d57d94268ce5e7218e544fcac7a556ce45d8334688aebbbde3`.

## Version 1.0.3 explicit assignment and confirmation

Each barcode has Use as MAC and Use as Serial buttons. Selecting a valid MAC normalizes it; barcode selection is an explicit technician decision even when printed-anchor association fails. Edit the two fields and press Confirm Fields to see a local confirmation summary. At least one value is required; serial-only devices are supported. Changes reset confirmation. This milestone does not save any record.

Nearby alphabetic-only OCR words such as AKUVOX no longer qualify as automatic serial suggestions. Alphabetic serials can still be selected from barcodes or entered manually. The real-label spatial failure shown in the user's 1.0.2 screenshot remains pending reproduction with the original photo; synthetic parser tests are not proof of actual-label accuracy.

Phone check: choose the two Akuvox barcodes explicitly, verify normalized MAC and unchanged serial, confirm, edit one field and verify confirmation resets. Test a blank form, invalid MAC, serial-only confirmation, and an unlabelled barcode. Recheck camera, gallery, and flashlight.

Tests also approximate the supplied Omada/TP-Link stacked-barcode layouts and the serial-only UNV layout. A uniquely associated printed row can corroborate its matching barcode above; it takes priority over another field's barcode below. Device-key QR and distant retail barcodes stay unassigned. These are parser fixtures, not a claim that native ML Kit recognition succeeded on the actual photos; test the supplied images using Choose Existing Photo on the phone.

Version 1.0.3 passed [GitHub Actions run 36482994129](https://github.com/JmanX/cableminttools-site/actions/runs/36482994129) and produced artifact 10998186374. Download the ZIP, extract it, and install app-release.apk. SHA-256: `150aac800a0214753f45e9ae2000f18c7e632939c3d61efbb56e5cdc9f4650d9`. Bundled JavaScript and ML Kit model assets were inspected. Real-phone verification remains pending.

## Version 1.0.4 confirmation navigation

Confirm Fields opens a separate Scan Complete screen with the confirmed values. Scan Next Device clears the result and opens the camera; Edit Fields returns to review with the values preserved and requires confirmation again. The keyboard closes on confirmation. Results remain in memory and are not saved to a project. Phone feedback says scanning works, sometimes on the second attempt, and gallery recognition appears more accurate. Camera consistency still needs improvement and measurement.

Verify on the phone: confirm valid MAC/serial and serial-only scans, see the completion screen, edit and re-confirm, then start the next device and check that old fields/codes are cleared. Invalid or empty input must remain in review with an error.

Enter the optional Installation Location in Technician check (for example, Building A, Floor 2, Room 204). It appears on Scan Complete, is retained while editing, and clears for a new device. Location is kept only in memory with this scan; project saving and the structured location workflow remain outside milestone 1.

Version 1.0.4 passed [GitHub Actions run 36489054159](https://github.com/JmanX/cableminttools-site/actions/runs/36489054159), producing APK artifact 11001386946. Download the ZIP, extract it, and install app-release.apk. SHA-256: `0407d6f2837c576d92a86e0964ec640df9be8998ca69e9cad4b93754f581ab45`. New navigation and location behavior await phone validation.

## Version 1.1.0 successful internal APK

[GitHub Actions run 36632527078](https://github.com/JmanX/cableminttools-site/actions/runs/36632527078) succeeded from commit 7c34303b520ebfaab0aafbf8789092acc64237bb. APK artifact 11064075957 contains app-release.apk. SHA-256: `26067e88b7ee00bf81df1b1df49ab76fed75a338699bb0ab0af8dfd24b2807d8`. Standalone JS bundle and bundled ML Kit models were inspected. Local copy: `.artifacts/1.1.0/app-release.apk` (ignored). Extract the downloaded ZIP, install the APK, and use a designated test project for first save/delete checks. Real-account and physical-phone validation remain pending.
## Version 1.1.1 — Create New Project

Select Project now includes Create New Project and a Project / Site Name form. Create Project & Open validates a trimmed name (1–80 characters), checks your own project names, inserts with your authenticated user ID, refreshes the list and opens Batch Setup. Existing refresh and sign-out controls remain. Duplicate, permission and network errors are displayed. A retry of an uncertain insert uses the same UUID; refresh the project list after closing during an uncertain request. No backend/website/billing changes are included. Phone validation: create a project, verify it opens automatically, return to the list, reject blank/duplicate names, test a connection failure and retry, then sign out and verify another account cannot see it.
Version 1.1.1 APK passed [GitHub Actions run 36640421843](https://github.com/JmanX/cableminttools-site/actions/runs/36640421843), artifact 11066582617, source commit 5ab1a3ae42cfca575696deed651926c345c0770d. Downloaded SHA-256: `9bb3c6230de1f7bcc77c9878e47e96281dc4e53d60c188c4e7288c2e7d8c0e0a`. Local ignored APK: `.artifacts/1.1.1/app-release.apk`. Bundle and ML Kit assets are present. Actual-account project creation and navigation need phone testing.

## Native field workflow 1.2.1

See [FIELD_WORKFLOW_DECISIONS.md](FIELD_WORKFLOW_DECISIONS.md) for the new tabs, History, durable foreground upload queue, temporary installed-photo option, smart barcode zoom and backend decisions. Internal APK is a field-test build. Photos are not uploaded. A successful local save remains Pending/Failed until a matching Supabase row is confirmed. Do not clear app data while captures are pending.

Phone checks: sign in with your existing account; create/select a test project; save a verified serial-only device; verify Uploaded and the server-backed list; try the same identifier again; delete and refresh. Repeat a capture in airplane mode, close/reopen the app, restore signal and verify one row with the same ID. Check Android Back from each step, gallery/manual correction, installed-photo on/off/retake, center vs edge barcodes, pinch during auto-zoom and default zoom on retake. No actual account save/delete was performed by the agent.


### v1.2.2 field checks

- Confirm Account reports 1.2.2. With no queued captures, Sync Now should say Everything is synced.
- Save offline: pending/failed counts and meaningful errors must remain visible. Reconnect and press Sync Failed — Retry; repeated presses must be disabled during Syncing…. Synced ✓ should appear only after server confirmation and remain for about 2.5 seconds.
- Point the camera at a textured scene: Zoom In/Out and pinch must change the actual preview, with the displayed ratio following native acknowledgement. Retake/new capture should return to 1×.
- Present a small centered barcode: automatic steps should be gradual. Decode or a manual zoom adjustment must stop auto-zoom for that capture; retake enables it again. No potential barcode geometry means no automatic zoom.
- Native camera changes require a freshly compiled internal APK. The versioned delivery file is created by scripts/package-android.cjs after assembleRelease; its metadata must match app.json. See root RELEASES.md.

The camera must appear as a source module (without the 📦 marker) in Gradle output. package.json forces expo-camera to build from source. The CI binary check rejects an APK without the custom zoom command names, even if Gradle itself succeeds.

### v1.2.3 reliability field checks

Account should report 1.2.3. A conflicting label (barcode 0C110533D733; OCR 00110533D733) must show both readings with sources, leave the conflicted field unselected, and prevent Continue/Save until explicit selection or manual confirmation. Verify editing a resolved value blocks saving again, serial-only omission works, and duplicate warnings still run on the chosen identifier. Existing cloud records are not automatically edited.

Press Sync Now with zero queued records online: expect immediate spinner, disabled button, actual authenticated server read, green Synced ✓ plus Everything is synced — checked just now for three seconds, four counts and updated last-successful-check time. Repeat offline: expect red failure/retry and unchanged successful timestamp. An empty local queue is not evidence of server connectivity.

Use a genuinely distant barcode that is initially undecodable. Expand Show scanner diagnostics: No potential barcode detected means ML Kit has supplied neither potential geometry nor a fresh suggestion; Potential barcode detected — no zoom requested includes the suppression reason; requested-but-not-applied produces a camera error and actual/requested ratios. Observe gradual zoom, then decode stop. Manual button/pinch must pause auto-zoom until a new capture/retake, which resets normal zoom. A barcode decoded at normal zoom must not be reported as an auto-zoom failure. Optical detection/suggestion thresholds and physical camera behavior still need phone testing.
