# CableMint Device Capture releases

Internal Android builds use the existing prototype package and signing setup. Update Expo version, package version, visible Account version (from Expo config), and Android versionName together. Increment Android versionCode for every testing/release build. Each release has a versioned APK copy; retain the original Gradle output and older versioned artifacts. APKs are excluded from Git.

## 1.4.1 — October 6, 2026

Android versionCode: **23**. Focused Gap photo synchronization hotfix; no visual/scanner redesign.

- Applied migration 20261006213127_gap_storage_rls_hotfix.sql: all four authenticated project-files policies validate the Storage object's name, including project subqueries. Single-backslash `\.jpg# CableMint Device Capture releases

Internal Android builds use the existing prototype package and signing setup. Update Expo version, package version, visible Account version (from Expo config), and Android versionName together. Increment Android versionCode for every testing/release build. Each release has a versioned APK copy; retain the original Gradle output and older versioned artifacts. APKs are excluded from Git.

## 1.4.1 — October 6, 2026

Android versionCode: **23**. Focused Gap photo synchronization hotfix; no visual/scanner redesign.

- Applied migration 20261006213127_gap_storage_rls_hotfix.sql: all four authenticated project-files policies validate the Storage object's name, including project subqueries. Single-backslash  filename matching is explicit. The live stored helper regex already matched normal JPGs; the verified defect was project-name shadowing in SELECT/UPDATE/DELETE.
- Bucket remains private; user/project/Gap ownership, stable UUID paths, idempotent insert/update and deletion protections remain.
- Independent Gap record/photo acknowledgements, accurate Gap synced · Photo upload failed feedback/counts and project-specific status. Confirmed operations are skipped on retry; metadata failures do not force another byte upload.
- AccessDenied/RLS/42501/permission failures wait for manual retry. Transient network/timeout/5xx failures retain automatic backoff. Existing v1.4.0 retained IDs/paths/photos upgrade without recreation.
- Local TypeScript/full regressions and rollback-only live Storage-row RLS tests passed. The user confirmed the existing v1.4.0 retained photo uploads and appears after the live fix; a read-only C1 audit confirms one file metadata record and one matching current object.
- Post-migration security/performance advisors ran; existing unrelated findings and test boundaries are documented in device-capture/GAP_PHOTO_SYNC_V1.4.1.md.

Source 3c98c1bb319c8481320af3f3ecbddd2d999119d4 passed [GitHub Actions run 37535636205](https://github.com/JmanX/cableminttools-site/actions/runs/37535636205) / job 112515701967. Fresh TypeScript/full regressions, Android generation, twelve native camera/zoom tests, release assembly, versioned packaging and binary gates passed.

Artifact 11446274323 independently verified: versionName 1.4.1 / versionCode 23, native zoom bridge/suggestions, standalone JavaScript, 32 ML Kit model entries, native ImageManipulator and compiled hotfix feedback/retry logic. Fixture strings are absent. ZIP digest and APK hash match CI.

Size: 145,950,036 bytes. SHA-256: 58539c302515f3c9978b8b35a56292e0b431da6fcbcdf034f3951e54c043bb07.

Delivery: C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.4.1\CableMint-Device-Capture-v1.4.1.apk. Older artifacts preserved.


Known issues / remaining tests: v1.4.1 phone validation of new record/photo states, per-project badges/counts, permission retry pause and offline/restart recovery. Foreground-only uploads and internal prototype signing remain. Scanner/recognition/auto-zoom, field_devices schema, production website, Dodo and Edge Functions unchanged.

## 1.4.0 — October 5, 2026

Android versionCode: **22**. Internal release candidate from user-confirmed stable v1.3.1. Native compilation, regression gates, twelve native tests, release assembly and independent APK verification passed; field acceptance pending.

- Project Dashboard with real Captures/open-Gap counts, recent captures/batch context, honest Project Report coming soon and read-only existing Saved Calculations counts.
- Project Gaps/Punch List: Location → Category → Description → 1–3 optimized photos → Save; Open/Resolved/All, private evidence detail, Resolve/Reopen preserving photos and confirmed deletion with safe cleanup.
- Authorized backend additions only: field_gaps, generic project_files, field_gap_deletions retry tombstones; private project-files bucket; ten authenticated ownership table policies, four Storage policies and four invoker identity/path/cleanup helpers. Existing field_devices schema, production website, Dodo/payment/Edge Functions are unchanged.
- Durable app-document JPEG evidence (1800 px max long edge, .8 quality); user-scoped offline journal, stable client IDs/paths, retryable failures and complete database/Storage/metadata acknowledgement before Synced. Scanner photos remain temporary.
- Combined device/Gap/photo Sync & Uploads, actionable retries, confirmed server checks, Account storage-used/last-check display. Scanner/recognition/zoom pipeline and stable Capture Next behavior unchanged.
- Local TypeScript/core regressions and new Gap service/journal tests pass. Live transactional RLS ownership/cleanup tests pass and roll back. Synthetic browser QA covers 360/390 width, photos/status/context/reset/offline retry/deletion and zero-queue feedback. See device-capture/PROJECT_GAPS_V1.4.0.md for exact files, policies and test boundaries.

Source 15a64ffb44adea0d8404a9ce833ee56c3d9635a5 passed [GitHub Actions run 37247593583](https://github.com/JmanX/cableminttools-site/actions/runs/37247593583) / job 111568448885. TypeScript and all existing/new regressions, fresh Android generation, twelve native automatic/manual zoom policy and CameraControl tests, native release assembly, packaging and binary gates passed. Independent native requests acknowledged 1.12× and 1.24× with a camera test double, not physical optics.

Artifact 11320125290 was downloaded and independently verified on October 5, 2026. Actual manifest: package com.cableminttools.devicecapture.prototype, versionName 1.4.0 / versionCode 22. All native zoom commands/suggestions, standalone JavaScript, 32 ML Kit assets and the native Expo ImageManipulator module are present. The Gap workflow/table/bucket strings are in the release bundle; synthetic preview identifiers/photos are absent.

Size: 145,943,480 bytes. SHA-256: `24ea6de116793137a7f549796143f3745b025c6fef34a6f3742c6797d307b032` (matches CI). Older APKs preserved. Independent binary evidence is saved beside the APK as apk-verification.json and native-ci-evidence.txt.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.4.0\CableMint-Device-Capture-v1.4.0.apk`. Older artifacts preserved.

Known issues / required field tests: real Gap camera/gallery/compression/private Storage upload, offline app restart/reconnection, cross-phone cleanup and account isolation need physical Android acceptance; all stable capture flows remain on the checklist. Uploads remain foreground-only; unsaved Gap drafts are memory-only; synced Gap photos remain locally until deletion. Projects with remaining evidence require Gap cleanup first. Generic file schema is prepared for future entities; v1.4.0 writes only Gap JPEG evidence. Internal prototype signing; no customer storage quota or combined report.

## 1.3.1 — October 4, 2026

**Current stable baseline — user-confirmed October 4, 2026.** The user reported this delivered build is working properly and designated it stable.

Android versionCode: **20**. Focused Capture Next workflow update from the user-approved stable v1.3.0 UI. Local/CI regression gates, native compilation, twelve native tests, release assembly and independent APK verification passed.

- Save & Capture Next returns directly to What are you capturing? / Device Type, retaining the project. Choose a different type and proceed directly to Scan.
- Completed identifiers, OCR/barcode candidates, verification/conflict state, diagnostics, device fields and zoom reset for each next capture. Manufacturer/Model/type clear.
- Building / Floor / Area remain. Unit / Room clears unless the existing explicit auto-advance creates a different numeric location; nonnumeric/unincrementable locations clear.
- Durable local-save and server-confirmed status remain distinct, with confirmation on the Device Type screen. Existing finish/Back navigation remains.
- Local TypeScript and all existing recognition/service/auth/queue/sync/manual zoom regressions pass. New tests exercise routing/reset/context and two different-type records through the real queue with synthetic server acknowledgement. Actual screens passed WAP gallery/conflict resolution → save → Type → Intercom serial-only → save → Type, fresh 1× zoom/empty diagnostics, retained Building/Floor, cleared Room and both History entries.
- No visual redesign, native scanner/auto-zoom policy, recognition, sync/Supabase service, production website, schema, Dodo or Edge Function changes.

Source 117264a1c943c77d1bffd8cb4f5d970d276cf404 passed [GitHub Actions run 37227558977](https://github.com/JmanX/cableminttools-site/actions/runs/37227558977) / job 111510256399. TypeScript and all core/new Capture Next regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly, packaging and binary gates passed. Existing native tests independently requested/acknowledged 1.12× and 1.24× with a camera test double; this is not a physical optics test.

Artifact 11312902152 downloaded without replacing older versioned APKs. Independent local inspection confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.1 / versionCode 20, all native zoom commands/suggestions, shared camera operation, standalone JavaScript and 32 ML Kit assets. New room-reset copy is included; synthetic preview/test identifiers are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.1\CableMint-Device-Capture-v1.3.1.apk`

Size: 145,839,372 bytes. SHA-256: `770f57859e76b615e5dfa0e3fa18f2305eef03d713095507cb6bb9225210d1ba` (matches CI). Older APKs preserved.

Field acceptance: User-confirmed stable on October 4, 2026, superseding the earlier pending overall phone-acceptance note. Automated/browser test evidence remains separate from this user confirmation. Existing limitations: foreground-only uploads, temporary/not-uploaded installed photos and internal prototype signing.

## 1.3.0 — October 4, 2026

Android versionCode: **19**. UI/workflow overhaul from the user-confirmed stable v1.2.5 scanner. Native compilation, regression gates, release assembly and independent APK verification passed.

- Original CableMint charcoal/green design system, shared components and line icons; approved logo unchanged. High-contrast controls, 48px touch targets and safe-area-aware persistent Projects / History / Capture / Tasks / Account navigation.
- Field-job project cards, project overview with real counts/recent captures, concise type selection and remembered batch/location settings.
- Simplified Scan → Verify → Location → Save flow, selected MAC/serial at the top, sourced explicit conflict choices and positive resolved state. Advanced OCR/barcode/diagnostic information is collapsed by default.
- Open captures and safe retries survive tab changes; hidden camera preview stops. Existing native scan guide, optical recognition, zoom policy, duplicate safeguards, Supabase services and durable queue remain intact.
- Compact searchable/filterable History and record details; app-wide sync badges and dedicated upload screen. Local-save confirmation is distinct from server-confirmed save. Account and honest Tasks empty state match the new shell.
- Local TypeScript/core regressions and presentation-status tests pass. Actual production screens were exercised in a browser using synthetic camera/gallery/OCR/storage/server adapters at 360/390-point widths: source conflict/resolve, serial-only capture, manual zoom/torch controls, tab resume, location/save-next/reset, History formatting/search, empty-queue spinner/success/failure/retry. See UI_V1.3.0.md.

Source aff4a87bdb385600a8e78449228d328eff10b941 passed [GitHub Actions run 37209055014](https://github.com/JmanX/cableminttools-site/actions/runs/37209055014) / job 111456289183. TypeScript, all recognition/service/auth/queue/sync/manual zoom regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly and binary gates passed. Native tests logged independent 1.12×/1.24× requests and actual acknowledgements with a camera test double; the physical Android smoke checklist remains pending.

Downloaded artifact 11305744745 independently confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.0 / versionCode 19, native zoom commands/suggestions, shared CameraControl operation, SVG/safe-area packages, redesigned UI and standalone JS with 32 ML Kit assets. Synthetic development-preview identifiers/labels are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.0\CableMint-Device-Capture-v1.3.0.apk`

Size: 145,838,356 bytes. SHA-256: `1ad8023a0af43b749358b3ae35ccef954845873a83198041fbe901cb343c702f` (matches CI). Older versioned APKs are preserved.

Known issues / remaining tests: A final physical Android smoke test is required for the redesigned keyboard/safe-area behavior and all 17 requested flows with real labels/cloud data. Browser camera/server adapters prove presentation/state wiring, not optical accuracy or live connectivity. v1.2.5 optical/cloud behavior is user-confirmed and its implementation is preserved. Uploads remain foreground-only; installed photos remain temporary and are not uploaded. Prototype signing; internal testing only.

## 1.2.5 — October 3, 2026

Android versionCode: **18**. Implementation/diagnostics ready before preparing the build. [Native build 37166331749](https://github.com/JmanX/cableminttools-site/actions/runs/37166331749) passed from source c0028323ef32d86bb9ec683c254f60f596eb833b, and the downloaded APK was independently verified. Focused scanner correction; physical automatic zoom is not yet claimed fixed.

- Verified v1.2.4 bug: every decoded UPC-E/QR latched automatic zoom off. Clear codes did not re-arm it. ML Kit also suppresses built-in suggestions when any barcode decodes. The existing live ML Kit 17.3.0 configuration supports potentials and suggestions.
- Guide-nearest stable small/thin potential boxes independently trigger bounded zoom through the same production CameraControl operation as manual input. Relevant decoded targets suspend requests per frame; unrelated reads cannot permanently disable the session. No fresh potential means no blind zoom. Manual/pinch/photo stop, cooldown, limits and capture reset remain.
- Always-visible potential/decoded/relevance counts, automatic mode, callback count, suggested/actual ratios, request/API/application counts and last reason. Expanded state includes frame age, camera generation/session, configuration and source/application. Stale camera work is ignored; redundant scanner props do not recreate the camera.
- Local clean-source/idempotence validation, TypeScript and existing conflict/sync/queue/manual zoom regressions pass. Twelve native tests include independent requests through the production CameraControl operation with a camera test double; CI verified all twelve results and logged independent 1.12×/1.24× CameraControl requests and actual acknowledgements. See device-capture/SCANNER_V1.2.5_FINDINGS.md.

Delivery: [artifact 11289174856](https://github.com/JmanX/cableminttools-site/actions/runs/37166331749/artifacts/11289174856), saved without overwriting older APKs to:

`C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.5\CableMint-Device-Capture-v1.2.5.apk`

Size: 137,710,826 bytes. SHA-256: `707b7773e41473be6d8547845c75da2d302b9e8bacea352fb636a5acd0adfbfa` (matches CI). Actual manifest confirms versionName 1.2.5 / versionCode 18; all four commands, ML Kit suggestions, shared native camera operation and new request/relevance/generation diagnostic fields are present in DEX. Standalone JavaScript and 32 bundled ML Kit asset entries are present. Native release assembly and binary gates passed.

Known issues: Physical distant-barcode detection and automatic camera movement remain unverified. The recording's zero-decoded intervals lack potential diagnostics. No potential detection must not cause arbitrary zoom. Relevant means identifier-shaped candidate, not confirmed MAC/SN ownership; raw values and explicit conflicts remain. Foreground-only uploads and temporary installed photos remain. Prototype signing; internal testing only. No production backend/site/billing/function or existing cloud-record changes.

## 1.2.4 — October 2, 2026

Android versionCode: **17**. Focused correction to v1.2.3 automatic zoom and resolved-conflict text. Build 16 passed native controller tests; build 17 also suppresses an intentional canceled automatic request from becoming a red error after manual override. Final code-17 build passed [GitHub Actions run 37084671054](https://github.com/JmanX/cableminttools-site/actions/runs/37084671054) from source `dae185c3449ac5fc76400f89dcbcaf663a1fb85c`; downloaded APK independently verified locally.

- ML Kit potential-barcode detection and zoom suggestions remain enabled with bundled barcode-scanning 17.3.0. Automatic decisions now run beside ML Kit in Kotlin, directly invoking the same acknowledged CameraX operation as manual zoom. The former callback only exported suggestions and returned false; JavaScript polling, suggestion expiry and repeated observation gates made that handoff fragile. The recording confirms no automatic movement at 1× but its collapsed diagnostics cannot identify which gate stopped that phone.
- Small centered undecoded barcodes, including thin wide 1D codes, trigger 0.12× steps with 650ms cooldown, hardware/4× cap and native acknowledgement. ML Kit suggestions directly request a bounded step without waiting for JavaScript polls. Decode, photo capture and manual button/pinch adjustment stop automatic requests; new capture/retake resets normal zoom and re-arms scanning.
- Internal APK logs include potential/decode detection, requested/source/current zoom and CameraX actual/application result. Expanded diagnostics show native frames, potential count/size, suggestions, request/applied counts and stalled frames. The displayed zoom follows native lens acknowledgement, including automatic movement. No label identifiers are logged by the added diagnostics.
- The saving-blocked message appears only while conflicts remain unresolved. Source choices and existing conflict/save guards are preserved.
- Tests cover the actual Kotlin automatic controller with a simulated camera acknowledgement and no manual zoom input, direct ML Kit suggestion handoff, cooldown, decode stop, manual override/reset, thin/large/outside-guide codes, hardware caps and rejected/unapplied requests. The TypeScript camera adapter observes automatic movement without a manual request. Existing identification, sync, queue, History and service regressions remain.

Delivery: [artifact 11259718413](https://github.com/JmanX/cableminttools-site/actions/runs/37084671054/artifacts/11259718413), copied without overwriting older builds to:

`C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.4\CableMint-Device-Capture-v1.2.4.apk`

Size: 137,693,070 bytes. SHA-256: `44f262bc6dfe6781f614550661fa58d49e27b1499e45baec29396ff48a26117b` (matches CI). Actual manifest confirms package com.cableminttools.devicecapture.prototype, versionName 1.2.4 and versionCode 17. DEX includes all four zoom commands, ZoomSuggestionOptions, the Kotlin automatic controller and shared camera operation. Standalone JavaScript and 32 ML Kit asset entries are present. Native source and unit-test compilation, six automatic-controller tests, existing TypeScript/regression checks, release assembly, versioned packaging and binary verification passed. Build 16 also passed run 37084285755; code 17 is the delivered candidate.

Known issues / remaining tests: October 3 field testing confirms v1.2.4 automatic zoom still fails; see the v1.2.5 investigation of unrelated-decode suppression. No physical Android camera is attached to this workspace. Controller tests use synthetic geometry/suggestion inputs; they do not prove optical detection of a genuinely distant barcode. Field-test the new APK without touching zoom controls and keep Show scanner diagnostics expanded. No potential detection or ML Kit suggestion means there is insufficient evidence to zoom. Existing cloud/service behavior and other v1.2.3 features are unchanged. Prototype signing; internal testing only.

## 1.2.3 — October 2, 2026

Android versionCode: **15**. Focused scanner accuracy and reliability release. Source commit `11116c7e810ef99389a007e7ff55db0c83c2fb73` passed [GitHub Actions run 36937982573](https://github.com/JmanX/cableminttools-site/actions/runs/36937982573) on October 1; APK downloaded and independently verified on October 2. Fresh dependency installation, TypeScript/regression checks, native camera source compilation, Android release assembly, versioned packaging and binary checks passed.

- Original decoded barcode payloads are preserved. Formatting is normalized for comparison, without inventing OCR character corrections. Barcode/OCR disagreements show both sources and block Continue/Save until the technician explicitly chooses or confirms a correction. Edits invalidate a resolution when its selected value changes. Live decoded values still trigger conflict review if photo recognition fails; preview coordinates are never treated as photo geometry. Serial-only and multiple-barcode support and duplicate checks remain.
- Sync Now shows immediate spinner/disabled state even for an empty journal, performs an authenticated server History read, refreshes all four upload counts and the durable last-check timestamp, then confirms in green for three seconds. An empty local queue alone never claims server connectivity; failures show red retry feedback. Manual checks serialize with deletion/refresh.
- Small native change enables ML Kit 17.3.0 zoom suggestions alongside potential-barcode geometry. Suggestions use the existing acknowledged CameraX command with gradual 0.12× steps, stability/cooldown guards and a 4×/hardware cap. Decode/manual adjustment stops auto-zoom; capture/retake resets zoom. Expandable scanner diagnostics distinguish no potential barcode, detected/no request, and requested/not applied. Manual buttons and pinch are preserved.
- Regression coverage includes exact 0C110533D733 / 00110533D733 disagreement, 0/O, C/0, 8/B, formatted equivalence, serial conflicts, live/photo mismatch, explicit resolution and edit invalidation; empty-queue server success/failure, timestamps/counts; suggestions without geometry, stale suggestions, already-decoded inputs, manual override/hardware limits, and a camera acknowledging an unapplied request.

Delivery: [artifact 11198574951](https://github.com/JmanX/cableminttools-site/actions/runs/36937982573/artifacts/11198574951), copied without overwriting older builds to:

`C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.3\CableMint-Device-Capture-v1.2.3.apk`

Size: 137,692,474 bytes. SHA-256: `b3828ef115e4f40b47b55126312bd333854ef798878509c3f11cfcddfafb5f31` (matches CI). Actual manifest: package com.cableminttools.devicecapture.prototype, versionName 1.2.3, versionCode 15. DEX contains both acknowledged zoom commands and the ML Kit suggestion bridge; standalone JavaScript bundle and 32 bundled ML Kit asset entries are present.

Known issues / remaining tests: October 2 field correction: automatic zoom did not activate; visible recording zoom was manual. Superseded by the v1.2.4 native correction. A physical Android phone must verify the conflict UI with the supplied label, zero-record online/offline Sync Now feedback, and a genuinely distant undecodable barcode. Synthetic geometry tests are not ML Kit optical field tests. No potential detection or suggestion means no automatic zoom. Uploads remain foreground-only; installed photos remain temporary and are not uploaded. Prototype signing; internal testing only. Existing cloud records, website, schema, Dodo and Edge Functions are unchanged.

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
