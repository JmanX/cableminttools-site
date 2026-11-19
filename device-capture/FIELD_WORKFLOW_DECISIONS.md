# CableMint Device Capture 1.2 — implementation and backend decisions
Date: September 30, 2026

## Reference comparison
The supplied screenshots/video are UX references only. The supplied app file is not installed, executed, decompiled, or copied. No reference code, assets, customer/site names, branding, progress percentages, location catalogs, badges, material requests or task schemas are incorporated.
CableMint retains its navy/green identity. Its generic device types are WAP, Intercom, Network Switch, Security Camera, Access Control, Fiber / Other and custom text.

## Implemented
- Own-session Supabase device insert/delete with exact message/code/details/hint. Stable UUID reconciliation; verified text only. Project list re-fetch after upload and History re-fetch after delete.
- Navigation stack and visible Back; native Back pops deeper screens and scanner stages. Root Android Back may exit normally.
- Projects, History, central Capture, Tasks shell, Account. Active project is retained across tabs; Capture selects a project when none is active.
- Identification, conservative barcode/OCR candidates and manual MAC/serial correction, installation location, technician confirmation, optional installed photo, save/next.
- Project metrics derived from server rows, cached check time, pending counts; no invented completion denominator.
- History searches project/type/location/MAC/serial/building/floor/vendor/model with project and All/Synced/Pending/Failed filters.
- Durable per-account AsyncStorage journal, with serialized whole-snapshot writes. On Android this uses the existing native persistent store. Failed writes are not acknowledged as locally saved. Queue records use stable UUID and original capture timestamp.
- One upload worker per signed-in workspace. Interrupted Uploading entries recover as Pending. A timeout after insert is reconciled by ID. Only a matching server row with the original fields/owner/project/timestamp becomes Uploaded. Corrupt journals cannot be overwritten by refresh; delete waits for active uploads before removing the cloud and local records.
- Transient network failures automatically retry with exponential backoff (30-second foreground checks, capped 5-minute delay); other failures require explicit Retry. Uploads also start after local save, refresh and foreground resume. Background OS execution is not implemented.
- Cached own projects/server records enable offline capture after a successful online session. Pro is displayed as last checked; every upload validates the current user, project and existing Pro entitlement again.
- Optional installed photo is a temporary visual check. It is deleted on local save, retake or scanner unmount, never put in the queue or uploaded. An app/process crash can leave native temporary cache files until OS cache cleanup; photos are not permanent evidence.
- Smart zoom uses ML Kit potential barcode geometry, including bounds/corners, upright image size and CameraX max zoom. It prefers the guide center; +0.12× steps after three frames with a 650ms cooldown, capped at min(4×, hardware max). Larger undecoded targets require eight unsuccessful frames. Any decode stops auto zoom for that capture. Pinch/buttons remain available; manual gestures suppress automatic changes for 2.5s after release. New capture/retake resets to 1×.
- Camera integration is a guarded reproducible config plugin for the MIT-licensed expo-camera 57.0.5 dependency. No proprietary app source is used. Both native prebuild and Android compilation are required gates.

## Backend/schema decisions — no changes made
1. Permanent label/installed photos: existing field_devices has no attachment field. Requires private Storage bucket, owner/project policies, attachment metadata relationship, file type/size limits, retention, delete cleanup and rollout decisions. Do not implement before approval.
2. Tasks and Record a Gap/punch list: no existing task/site-note model verified. Shell/roadmap only; future schema requires approval.
3. Project progress: counts and last capture are supported. Percentage complete needs an approved expected-device/location denominator.
4. Identifier uniqueness: existing table has no project-scoped MAC/serial uniqueness constraint. Client checks prevent ordinary duplicates; simultaneous different clients can still race. A database uniqueness decision is deferred.
5. Queue is private app data, not end-to-end encrypted; Supabase session tokens remain in SecureStore. Local cache survives sign-out for the same account. Clearing app data/uninstalling destroys pending captures. Server records are unaffected.
6. Pro enforcement uses the existing website-compatible client gate; this update does not alter production RLS/billing authorization.
7. No native billing, Dodo, website, Edge Function, Supabase schema/policy/privilege changes.

## Verification
TypeScript and parser/workflow/service/session-storage checks passed. Added exact insert/delete errors, owner scope, history search/Back stack, real file persistence restart tests, lost server response reconciliation, single-worker concurrency, disk write failures, account isolation and zoom controller checks.
Live read-only query confirmed field_devices remains empty with authenticated SELECT/INSERT/DELETE privileges. No real account test record was inserted by the agent; actual phone save/delete, permissions, image cleanup, connectivity changes, camera zoom smoothness and barcode accuracy still require field validation.


## September 30, 2026 — verified internal Android builds
- Steps 1–4 build: version 1.2.0 / code 8, source f114f027dc40df0fb2f2fa0e88dbfd4d1d29c58a, GitHub run 36647777234, artifact 11068968574. APK SHA-256: b4bf2ae2043871c4e1fa99165993c3245abd3dfe6e78c299f0f632b52aff0342.
- Full field workflow build: version 1.2.1 / code 9, source 315899b8c98d289e2aa38141b5cf30fe6ff0b9ae, GitHub run 36780357498, artifact 11127616948. APK SHA-256: 400dcd4b4727525e33c682e6bd74f368ccdc5ec2d435b81c6f091759b9b0ef8c.
- CI install, TypeScript, recognition/workflow/service/session/queue/zoom regression checks, native prebuild and Android release compilation all succeeded. Final APK manifest confirms com.cableminttools.devicecapture.prototype, version 1.2.1, code 9. Standalone Hermes bundle contains the smart barcode event integration; 24 bundled ML Kit asset entries are present.
- Final APK is saved locally in device-capture/.artifacts/1.2.1/app-release.apk. Prototype/debug signing; not a store release.
- Live read-only Supabase check on September 30 confirmed device count 0, RLS enabled and authenticated SELECT/INSERT/DELETE privileges present. The agent did not make an authenticated test-device write. Phone validation of real saves/deletes, camera/pinch/zoom, Back, offline recovery and temporary-photo cleanup remains required.
