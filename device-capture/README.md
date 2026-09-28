# CableMint Device Capture — Android scanner prototype

This is **milestone 1** from `../CABLEMINT_CONTEXT.md`: a minimal Android scanner for testing real equipment labels. It has no Supabase client, login, Dodo code, project selection, record save, image upload, or offline queue. The production website and backend are not dependencies of this scanner test.

## What it does

- Uses `expo-camera`'s Android ML Kit barcode scanner during live preview, plus direct local-file ML Kit barcode scanning in the custom module for captured images.
- Uses a local Expo Android module with Google's **bundled** ML Kit Latin text-recognition model (`com.google.mlkit:text-recognition:16.0.1`) on the same captured image.
- Shows printed-label MAC and serial candidates, all decoded barcode values, raw OCR text, and editable technician-check fields.
- Does not treat an unlabelled 12-character hexadecimal barcode as an authoritative MAC. A serial-only label is valid for the scanner test.
- Keeps **Scan with Camera** primary and **Choose Existing Photo** secondary. Both use the same on-device native pipeline. Temporary app-cache photos are deleted after recognition; original gallery photos are preserved. Captured values exist only in memory.

The barcode and OCR models run on the device. No device-label image or scan result is sent to CableMint or another server by this app.

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
