# CableMint Device Capture: technical context

**Status:** v1.3.1 / Android versionCode 20 is the current stable baseline. On October 4, 2026, the user reported that this build is working properly and designated it stable. This field confirmation supersedes the prior pending overall v1.3.1 phone-acceptance note. The approved v1.3.0 design, stable scanner/recognition/zoom and synchronization remain the baseline for future changes. Local/CI regressions, twelve native tests, release assembly and independent APK verification passed.

**v1.4.1 verified internal hotfix:** Real v1.4.0 Gap photo upload failed under Storage RLS. The October 6 live ownership-policy fix is applied, and the user confirmed the retained photo uploads and appears without recreating the Gap. Version 1.4.1/code23 adds independent record/photo feedback, project status isolation and authorization retry controls; native compilation and independent versioned APK verification passed. See device-capture/GAP_PHOTO_SYNC_V1.4.1.md. v1.3.1 remains the last explicitly user-designated stable build.

**Milestone 1 implementation, September 27, 2026:** The Android scanner prototype now lives in `device-capture/`. It uses Expo SDK 57, `expo-camera`'s native Android ML Kit barcode scanner, and a local Android Expo module with bundled ML Kit Latin OCR. It presents printed-label MAC/serial candidates and all raw barcodes for technician review, with no Supabase/Dodo connection or record writes. See `device-capture/README.md` for build and field-test steps. TypeScript and parser checks passed. GitHub Actions run 36362683802 successfully compiled the native Android release variant with prototype debug signing and uploaded artifact 10946452017. The APK contains the JavaScript bundle and bundled barcode/OCR models. Real-label accuracy remains unverified until phone testing.

## Sources and precedence

- The open ChatGPT conversation [“Check Etsy Traffic”](https://chatgpt.com/g/g-p-6a933f65f48c8191bda776ab70aedca3/c/6aaefb8f-a950-83e9-9b83-ce4f04bcec7d) contains the product history and decisions. Later decisions in that conversation supersede earlier experiments.
- The live Supabase project `kgbrhdjbeosljpwghxte` was inspected read-only on September 27, 2026 for public table columns, RLS policies, and Edge Function names. Those observations take precedence over older chat claims about the *current* schema.
- `CABLEMINT_CHANNEL.md` governs CableMint video production and locked brand assets. Device Capture is an app, but it should still use the established CableMint Tools identity and keep JayroVibe separate.
- This file is in the root of `JmanX/cableminttools-site`. The Android prototype lives in `device-capture/`; its presence does not change the production website.
- Never copy secret keys, passwords, webhook secrets, user data, or contents of `Supabase.txt` into app code, Git, documentation, logs, or client bundles. Existing secrets must be rotated if their exposure is suspected.

## Product boundary

CableMint Tools serves low-voltage and IT infrastructure technicians. The existing **CableMint Field Tools** website/PWA at `https://cableminttools.com` provides field calculators, cloud projects and calculation history, branded PDF project reports, billing, and the current Device Capture interface. The native app is a focused companion front end for reliable field device capture, using the **same Supabase Auth accounts, projects, device records, and Dodo Pro entitlement**. Do not rebuild or change the production website for this prototype.

The website/PWA is already usable, and its project PDF can report saved calculations. The conversation describes later expansion of closeout reports to devices, notes, and punch items; that is future web work, not part of the first native milestone. Native billing/checkout is also outside the first app scope. The app should consume existing entitlement state rather than process payments or hold Dodo secrets.

## Supabase architecture (September 27 snapshot; v1.4.0 additions below)

Project ref: `kgbrhdjbeosljpwghxte` (`https://kgbrhdjbeosljpwghxte.supabase.co`). Public tables observed:

| Area | Tables | Purpose |
| --- | --- | --- |
| App | `field_projects`, `field_project_calculations`, `field_devices` | User-owned projects, calculator results, and device text records |
| Billing | `dodo_customers`, `dodo_subscriptions`, `dodo_webhook_events` | Dodo customer/subscription state and processed webhook IDs |

All six public tables have RLS enabled. At inspection, `field_projects` had 2 rows, `field_project_calculations` 4, and `field_devices` 0; these counts are only a snapshot. The project and device rows link to `auth.users` through `user_id`. `field_devices.project_id` references `field_projects.id`.

`field_projects`: `id uuid` primary key (default generated), `user_id uuid`, `name text` (1–80 characters), `created_at timestamptz`, `updated_at timestamptz`. An authenticated user can manage rows where `auth.uid() = user_id`.

`field_project_calculations`: `id uuid`, `project_id uuid`, `user_id uuid`, `tool_name text` (1–80), `result_text text` (up to 4000), `created_at timestamptz`. It has an own-user policy and checks that the parent project belongs to the user.

### Exact current `public.field_devices` columns

| Column | Type | Existing rule/default | Capture meaning |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | Record ID |
| `project_id` | `uuid` | FK to `field_projects.id` | Selected project |
| `user_id` | `uuid` | FK to `auth.users.id` | Signed-in owner |
| `building` | `text` | default `''`, max 100 | Batch context |
| `floor_area` | `text` | default `''`, max 100 | Floor or area |
| `unit_location` | `text` | default `''`, max 120 | Room, unit, or location |
| `device_type` | `text` | 1–80 characters | Required device category |
| `manufacturer` | `text` | default `''`, max 100 | Vendor |
| `model` | `text` | default `''`, max 120 | Model |
| `mac_address` | `text` | default `''`, max 32 | Verified, normalized MAC if present |
| `serial_number` | `text` | default `''`, max 160 | Verified serial if present |
| `ip_address` | `text` | default `''`, max 64 | Optional network detail |
| `switch_name` | `text` | default `''`, max 120 | Optional switch |
| `switch_port` | `text` | default `''`, max 80 | Optional port |
| `vlan` | `text` | default `''`, max 40 | Optional VLAN |
| `notes` | `text` | default `''`, max 2000 | Optional notes |
| `verified` | `boolean` | default `true` | Tech confirmation flag |
| `captured_at` | `timestamptz` | default `now()` | Capture time |
| `updated_at` | `timestamptz` | default `now()` | Update time |

The live table has **no image/blob column**, no built-in unique MAC/serial constraint, and no dedicated offline-sync identifier. Do not assume that duplicate protection exists at the database layer. The conversation describes project-scoped duplicate MAC and serial checks in the PWA; recreate and test them explicitly in the native app without inventing a schema change. A record may have a serial without a MAC when the label genuinely has no MAC. Only save `verified: true` after the tech confirms the fields.

Live RLS policies for `field_devices` allow `authenticated` users to select/delete only rows with their `user_id`. Insert requires both `auth.uid() = user_id` and ownership of the referenced `field_projects` row. Update has the same ownership checks in `USING`/`WITH CHECK`. The native client must use the user's Supabase session and the public/publishable client key; never use a service-role or secret key on the device. Project listing must be scoped to the signed-in user. The Dodo subscription read policy matches `customer_email` to the email in the authenticated JWT (case insensitive); confirm entitlement handling in the actual client before relying on it for access control.

## Dodo billing and Pro state

The latest conversation says **Dodo is the only active billing source** for CableMint Pro. Paddle's live application was rejected; its webhook and secret were removed, and the live public-table listing contains no Paddle tables. Earlier chat messages mentioning Paddle fallback are superseded. The user completed a Dodo test payment, and the conversation reports Dodo → Supabase → Pro unlock working in **test mode**. Dodo product information was submitted for review; live-mode approval was still pending at the end of the conversation. Recheck that status before any live-billing work.

Live Edge Functions observed: `dodo-webhook` (active, `verify_jwt: false`) and `dodo-checkout` (active, `verify_jwt: false`). The conversation says webhook signatures are verified server-side, events are stored/idempotently tracked in `dodo_webhook_events`, and `dodo_subscriptions` drives Pro access. `dodo_customers` and `dodo_subscriptions` were populated in test mode at inspection. The native app must not call checkout with embedded Dodo credentials or duplicate webhook logic. The website remains the payment surface; the app should read the existing entitlement through the permitted user path and show a clear signed-in/Pro state. Test-mode status must not be presented as proof that live payments are enabled.

Do not put actual Dodo API keys or webhook signing values in this file. The conversation names server-side Supabase secrets `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY`; their values must remain secret. Monthly and annual products both map to CableMint Pro; product IDs should be obtained from the deployed configuration when needed, not guessed.

## Existing Device Capture workflow

The current PWA flow is **Project → Building → Floor/Area → Device Type → Scan → Verify → Save & Next**. A technician signs in, chooses a project and location context, scans a device label, reviews candidate MAC/serial/model values, corrects mistakes manually, then saves a verified text record to `field_devices`. Manufacturer and model can carry forward across a batch. Project, building, floor, and device type persist for the next scan. An optional unit/room auto-advance supports sequences such as Apartment 101 → 102 → 103. Optional IP, switch, port, VLAN, and notes can be entered. The project has a device inventory and delete control. The PWA is Pro-gated.

The captured photo is used transiently for recognition and is **not uploaded or retained** by CableMint according to the conversation. Keep that privacy behavior in the prototype unless the user explicitly changes it. Store only verified text values in Supabase. A field tech should be able to save a serial-only device if there is no MAC on its label. Warn about duplicate MACs **and** serials within the project, while allowing the technician to inspect and resolve the conflict.

## Scanner failure and recognition rules

The browser/PWA implementation tried browser barcode support, then ZXing, image resizing/contrast passes, and OCR (described elsewhere as Quagga/Tesseract-style browser scanning). Multiple parser/cache revisions attempted OCR splits, common `O/0`, `I/1`, `S/5` errors, and vendor label variants. The user reported that clear labels sometimes produced “could not confidently read label,” that browser and installed PWA results differed, and that the MAC was frequently **wrong**. All four supplied real label photos failed in both browser and PWA during one test. Treat web scanning as unproven for commissioning; do not port its guesswork unchanged.

Real examples include Omada/TP-Link labels with dashed or compact MACs, Akuvox labels with compact 12-character MACs, and a UNV camera box where serial may be available but no MAC is printed. Labels may include multiple 1D/2D barcodes encoding a serial, device key, product ID, SSID-related value, or MAC. **Twelve hex characters alone do not prove a MAC.** The strongest association is explicit printed `MAC` text next to a value, or a barcode clearly correlated with that printed row. Read printed text even when barcodes are found. Show all plausible barcode and OCR candidates with source/confidence and require a technician's selection or correction when ambiguous. Never silently choose a random barcode as the MAC. Normalize a confirmed MAC to one consistent form before saving (proposed display/storage form: uppercase colon-separated octets), but preserve the raw scan candidate in memory until verification. Serial recognition is independent of MAC recognition.

The user supplied an APK from a company Device Capture app as a reference. The conversation's APK inspection reported ML Kit Barcode Scanning 17.3.0, ML Kit Text Recognition 16.0.1, Expo Camera/Android CameraX, and native Barcode/OCR components. Its App Store listing described barcode/QR, photos, offline operation, location validation, and sync. These are **reference observations**, not a dependency requirement or a claim that CableMint already implements those features. Do not copy proprietary app code/assets.

## Native app decision and sequence

Build **CableMint Device Capture** as an **Android-first Expo/React Native app** sharing the existing Supabase backend. Use native Google ML Kit barcode scanning and text recognition through an Expo-compatible native module or custom native integration. The exact package/integration is not yet chosen; verify current package maintenance, Android compatibility, Expo SDK compatibility, license, and whether it actually uses native ML Kit before committing to it. A custom **development build/internal APK** is required for native modules; Expo Go alone is not the target runtime. The conversation favors a bundled Android barcode model so first use can work without downloading the model in the field. OCR should run on-device. Evaluate camera focus/resolution and multi-barcode capture against real labels.

Priority order from the latest chat:

1. Put a minimal Android scanner prototype on Jairo's phone. Test against the same Akuvox, Omada, UNV, and TP-Link labels that defeated the PWA. Measure correct MAC/serial assignment, missing values, false assignments, and manual correction time.
2. Once scanning is reliable, connect the full sign-in → own project selection → building/floor/device type → scan → verify → save/next flow to existing `field_projects` and `field_devices`. Preserve batch context. Add proper duplicate checking and Pro entitlement behavior.
3. Add a durable offline queue and sync after recognition works. Earlier discussion listed offline as a desirable field capability; the **latest explicit milestone deferred it**, so do not claim offline sync exists in v1. When implemented, design idempotent retries and conflict handling before relying on it in the field.
4. Add iOS after Android recognition is proven. Store release follows field validation; it is not part of the initial APK milestone.

Use EAS configuration for an internal Android build. On September 27, 2026, Chrome was signed in as `cableminttools` with project `@cablemint-tools/cablemint-tools` linked to `JmanX/cableminttools-site`; the local EAS CLI was subsequently authenticated as `cableminttools`. Browser and CLI sessions are separate. GitHub Actions produced the first standalone APK; an EAS build was not needed. The app remains unlinked locally pending a future approved EAS build. The user does not need to write code or install Android Studio just to test an EAS-built APK. Expo account authorization and installing/testing the APK on a real Android phone are user/device steps. Do not assume an Expo connection or account session is available to Codex. Document exact build commands once the project and package versions are chosen.

## Build constraints and unresolved checks

- Do **not** modify the production website, deployed Edge Functions, Dodo setup, or Supabase schema for this handoff or the scanner prototype. The user’s v1.4.0 authorization permits only the Gap tables, generic file metadata, one private bucket and their ownership policies documented below. If a later requirement truly needs such a change, explain the specific gap, migration/rollout, and effect on existing users before making it.
- Verify the current website's actual client mapping and Pro entitlement query before implementing mobile access; the conversation reports behavior, while this file's live check verified tables/policies/function existence, not deployed source code.
- Verify `field_devices` column nullability, length checks, and RLS with an authenticated non-production/test account before the first write. Do not test by inserting production-like records into a user's real project without an explicit test plan.
- Decide how to handle project-scoped duplicate queries, serial-only captures, verification state, and retry safety in code. The current schema permits an empty `mac_address`; it does not itself enforce MAC/serial uniqueness.
- Select and test an actual Expo-compatible native ML Kit integration. “Expo Camera barcode scanning” and “native ML Kit OCR” are distinct capabilities; confirm both in an Android development build.
- Avoid shipping real device-label photos or identifiable equipment data in the repository. Use consented/redacted test assets or on-device test cases.
- This context file is the planning baseline. Update it when implementation evidence or later user decisions supersede a statement, noting the date and source.

## Milestone 1 phone feedback and correction — September 27, 2026

The user installed the first APK and reported that Reading label stayed loading although two live barcodes had been counted. Inspection found Expo Camera scanFromURLAsync depends on an optional ImageLoaderInterface service; no implementation is installed, and its absent-service path does not settle the promise. Version 1.0.1 replaces that still-image call with direct local-file ML Kit scanning in the local native module, shows live barcode values immediately, adds Review read codes, bounds photo capture to 10 seconds and recognition calls to 12 seconds, and falls back to available live codes on failure. Late photos are deleted. Regression checks cover never-settling calls and late-photo cleanup. GitHub Actions run 36364777329 passed all checks and native compilation and produced replacement APK artifact 10946539958. Phone verification of the corrected capture path remains pending.

## Spatial recognition and gallery decision — September 28, 2026

The user confirmed version 1.0.1 reads Akuvox barcodes `0C110533D733` (MAC) and `P1U922QJ00465` (serial), but flattened OCR order incorrectly offered `DC110533D733` as a serial and left barcodes unassigned. This supersedes the pending capture-path verification above.

Version 1.0.2 (Android version code 3) preserves native ML Kit line/element/barcode bounding boxes, corner points, and image dimensions. Printed MAC/SN/S/N/SERIAL/SERIAL NUMBER anchors associate values by same-row or immediately-below proximity in the anchor's rotated coordinate frame. Barcode association must be unique in both directions; ambiguity remains unassigned. A barcode can also corroborate uniquely associated nearby printed text despite one OCR character error. Barcode data takes precedence; confirmed MAC values normalize to uppercase colon-separated octets. Shape alone never assigns a MAC, and serial matching is independent. Review retains raw geometry and shows assignment reasons with editable technician fields. Live-preview coordinates are excluded from captured-image classification.

Scan with Camera is primary. Choose Existing Photo uses the Android system picker and the same local native pipeline, without upload, permanent CableMint storage, or broad media access. Only app-cache copies are deleted after recognition; the original gallery image is preserved. Flashlight controls read Turn On Flashlight / Turn Off Flashlight. Gallery scans clear previous live-code context. Milestone 1 still has no record saving or backend integration.

TypeScript, parser, timeout, and cache-path privacy checks passed locally. Synthetic spatial fixtures cover the Akuvox values and OCR typo, shuffled OCR order, tilted labels, competing/shared barcodes, serial-only hex values, and coordinate-frame mismatch. Native prebuild passed. Physical camera/gallery accuracy and temporary-file cleanup require testing on the phone after the replacement APK build. Production website, Supabase, Dodo, and Edge Functions remain unchanged.

Replacement APK 1.0.2 built successfully in GitHub Actions run 36479027245 from commit cb4d67ac46ff3d6884cae51939b5a8afa8b5a56a; artifact 10996536046. The downloaded APK contains the JavaScript bundle and bundled ML Kit barcode/OCR assets. APK SHA-256: `8674b54da289645d57d94268ce5e7218e544fcac7a556ce45d8334688aebbbde3`. This is a standalone prototype with debug signing, not a store release. Phone accuracy remains unverified for this version.

## Manual assignment and confirmation feedback — September 28, 2026

The user's version 1.0.2 phone screenshot shows both decoded Code128 values unassigned and `AKUVOX` incorrectly suggested as an OCR serial. The barcode rows lacked selection buttons; technician fields were editable but had no explicit confirmation action. This is evidence that automatic spatial classification remains unproven on the actual label, despite synthetic test success. Obtain the original label photo before adjusting association thresholds; do not infer the missing native geometry from a review-screen screenshot.

Version 1.0.3 (Android version code 4) adds explicit Use as MAC / Use as Serial buttons on every barcode row. MAC selection is enabled only for a valid 12-hex value and normalizes it; this is a technician choice, never shape-only automatic classification. Confirm Fields validates optional MAC, requires at least one field, limits serial length, and displays the confirmed in-memory values. Edits and new scans reset confirmation. No records are saved. Detached alphabetic-only OCR values no longer auto-fill serials; barcode and manual alphabetic serials remain supported. Regression checks reject the nearby AKUVOX vendor word.

The supplied reference APK was inspected locally, without running it or contacting its services. It contains bundled ML Kit OCR/barcode assets and Expo components. Its Hermes bytecode is version 96; the installed compiler reads version 98, so its scanner/confirmation UI could not be verified from bytecode. A screen recording and original Akuvox photo were requested. No proprietary APK, code, assets, or inspection output is committed or reused in CableMint. No live integrations are involved in these milestone 1 changes.

The user subsequently supplied four work-label images: Omada EAP653, UNV camera box, TP-Link SG2005P-PD, and Akuvox. These show stacked barcodes above printed values on TP-Link/Omada, a serial-only UNV label with a separate retail barcode, and side-by-side anchors/barcodes on Akuvox. Version 1.0.3 prioritizes a uniquely owned printed row and matching nearby barcode above it over a different barcode below that anchor. Multiple printed owners of one barcode remain ambiguous. Tests use synthetic geometry approximating the visible photo positions; native ML Kit has not been run on these files here. Device-key QR and distant retail barcodes remain unassigned in these fixtures. Photos remain outside the repository.

Version 1.0.3 build succeeded in GitHub Actions run 36482994129 from commit 3ba84f6548450954693d177c44743201699faee8; APK artifact 10998186374. Downloaded APK SHA-256: `150aac800a0214753f45e9ae2000f18c7e632939c3d61efbb56e5cdc9f4650d9`. JavaScript bundle and bundled ML Kit barcode/OCR assets are present. A limited string inspection of the reference APK also found Confirm capture, MAC barcode selection, and retake wording; these are UI-string observations, not verified runtime behavior.

## Confirmation navigation and phone feedback — September 28, 2026

The user reports version 1.0.3 scanning works, sometimes after a second attempt; Choose Existing Photo appears more accurate than camera capture. This is qualitative field feedback, not a measured accuracy rate or proof that every supplied label passes. The user also reports Confirm Fields stays on the same screen. Version 1.0.4 (Android version code 5) replaces inline confirmation with a separate Scan Complete screen showing the confirmed MAC/serial. Scan Next Device clears the previous result and returns to the camera. Edit Fields preserves the values and returns to review for re-confirmation. Confirmation dismisses the keyboard and the new screen opens at the top. This remains milestone 1: in-memory confirmation only, no project save or backend changes. Camera consistency remains an unresolved field check.

The user also requested where to enter installation location. Version 1.0.4 adds an optional freeform Installation Location field (up to 240 characters) in technician review, displayed with the confirmed device values. Edit Fields preserves it; Scan Next Device and new image recognition clear it to prevent carrying the previous device's room into the next scan. It is transient prototype metadata, with no Supabase column mapping, project linkage, persistence, or sync. The full structured project/building/floor/unit workflow remains milestone 2.

Version 1.0.4 passed typecheck, parser checks, native compilation, and packaging in GitHub Actions run 36489054159 from commit 3dec911393e33ff87995acdf2ab9f4582b1ae168; artifact 11001386946. Downloaded APK SHA-256: `0407d6f2837c576d92a86e0964ec640df9be8998ca69e9cad4b93754f581ab45`. The standalone JavaScript bundle is present. New navigation and location behavior await phone validation. Production website, Supabase, Dodo, and Edge Functions are unchanged.

## Milestone 2 integration — September 29, 2026

The user authorized milestone 2 only. Version 1.1.0 adds Supabase email/password sign-in with the existing account, own-project selection, persistent batch Building/Floor/Area/Device Type/Manufacturer/Model, Unit/Room/Location with optional final-number increment, technician verification, online Save & Next, and Current Project Devices with confirmed delete. Serial-only devices are supported. Recognition geometry, conservative assignments, manual selection, camera/gallery processing, and flashlight labels are retained. Images remain temporary and are never uploaded. This supersedes milestone 1's transient location/completion flow: confirmed saves return to the camera with batch context retained.

Read-only live verification on September 28 confirmed current columns, lengths, RLS and constraints. `field_devices_identifier_required` requires at least one nonblank MAC or serial. Device insert/update requires row ownership and parent project ownership; read/delete requires row ownership. There is still no project-scoped identifier uniqueness constraint. On September 29, REST connectivity checks with the existing public client key confirmed anonymous project reads are denied (42501); no privileges were changed. Email/password Auth was enabled when checked. No authenticated production-like test rows were inserted.

The deployed website was read to verify the actual entitlement mapping: select `status` from `dodo_subscriptions`, filter customer email case-insensitively to the signed-in email and status to `active`/`trialing`, limit 1. The app consumes that existing state and fails closed on read errors. Subscription RLS ties customer email to JWT email. It does not invent product, expiry, or migration rules; Dodo production migration is separate. It rechecks session and entitlement before save/delete. This is client entitlement gating under existing ownership RLS, not a new server-side billing enforcement policy.

The mobile client uses the existing enabled public Supabase publishable key, which is intended for client bundles, and the user's access token. No service-role, Dodo secret, or webhook credential is used. Auth sessions are encrypted in Expo SecureStore, chunked for large sessions. Passwords are not persisted. AppState manages token refresh. Batch settings are stored locally with separate user/project keys; unsaved scans and retry IDs are memory-only. No offline queue or sync is implemented.

Before insertion, all current project device pages are checked for normalized MAC and case-insensitive trimmed serial duplicates independently. Ambiguous scanner values remain unassigned. Each save has a client-generated UUID; an uncertain response locks the fields and retries/reconciles the same ID instead of creating another record. Unit numbering advances only after acknowledged success. Duplicate checks can still race between simultaneous clients because the existing schema has no unique identifier constraint; no schema change was made. Closing the app during an uncertain save loses the in-memory attempt: inspect Current Project Devices before rescanning that device.

Local checks cover recognition, timeouts, temporary photo paths, serial-only/length validation, batch restoration, numbering, duplicate matching, owner/project filters, Pro failures, stale sessions, and uncertain-save reconciliation using a mocked service. These do not prove authenticated live RLS operations. Phone testing must cover real account sign-in/session restoration, active/inactive Pro state, project ownership, camera/gallery accuracy, verified save and serial-only save, duplicate rejection, Save & Next numbering, batch restoration after restart/project switch, list/delete, and connection failure/retry. Use a deliberately designated test project for save/delete validation. No website, table structure, RLS policy, billing table, Dodo setup, or Edge Function was modified. The separately approved table grants are recorded below.
### Confirmed backend permission blocker — September 29, 2026

A final read-only `has_table_privilege` check confirmed the authenticated role can SELECT field_projects and dodo_subscriptions, but cannot SELECT, INSERT, or DELETE field_devices. RLS ownership policies alone do not grant table access. Thus device listing, pre-save duplicate queries, verified insertion and deletion are blocked against the current backend. No permission change was made. A minimal proposed fix is granting only SELECT/INSERT/DELETE on public.field_devices to authenticated while retaining existing RLS; explicit user authorization is required because backend changes are prohibited in this milestone. Source implementation and automated mock tests are complete; functional live saving is not complete until this blocker is resolved and tested with an actual signed-in account. This supersedes any earlier implication that RLS inspection alone proved API write availability.
### Permission blocker resolved with explicit approval — September 29, 2026

The user approved only SELECT, INSERT and DELETE grants on field_devices. Applied migration `grant_authenticated_field_device_capture_access` containing exactly `GRANT SELECT, INSERT, DELETE ON TABLE public.field_devices TO authenticated;`. Follow-up read-only checks confirm those three authenticated privileges are now true, UPDATE remains false, anonymous SELECT remains false, RLS remains enabled, and the four ownership policies are unchanged. No device data was inserted/deleted for verification. The permission blocker above is resolved; actual-account phone validation is still required. No column/constraint, policy, billing table, Dodo configuration, production website or Edge Function was changed.
Milestone 2 APK 1.1.0 (Android version code 6) built successfully in GitHub Actions run 36632527078 from source commit 7c34303b520ebfaab0aafbf8789092acc64237bb; artifact 11064075957. TypeScript, parser/timeout/privacy, workflow/service and encrypted session storage checks passed in CI. Downloaded APK SHA-256: `26067e88b7ee00bf81df1b1df49ab76fed75a338699bb0ab0af8dfd24b2807d8`. Standalone JavaScript bundle and bundled ML Kit barcode/OCR assets are present. Prototype debug signing is retained; this is an internal test APK, not a store release. Actual-account sign-in, session restore, verified writes/deletes, Pro transitions and field scanning still need phone validation in a designated test project. Do not claim end-to-end live save validation from mocked tests or permission metadata.
## In-app project creation — September 29, 2026

The user authorized adding Create New Project to the existing Select Project screen. Version 1.1.1 (Android version code 7) adds a project/site name form, blank and 80-character validation, case-insensitive trimmed duplicate precheck among the user's own projects, useful unique-constraint/permission/network errors, and automatic list refresh plus opening the new project's Batch Setup. If refresh fails after a confirmed insert, the new project still opens with a refresh warning. Refresh Projects & Access and Sign Out are retained. Existing Pro gating and scanner behavior are unchanged.

Live read-only checks reconfirmed authenticated SELECT/INSERT privileges and enabled RLS on field_projects. The existing ALL ownership policy requires auth.uid() = user_id in USING and WITH CHECK. Existing constraints include name length 1–80 and UNIQUE(user_id, name). Inserts use only id, authenticated user_id and trimmed name through the existing public-key client/session, with no service-role key. A stable UUID permits retry after an uncertain response by checking the same owned row. Unsaved creation attempts remain memory-only; refresh projects after closing during an uncertain request. No backend grants, schema, RLS, billing/Dodo, website or Edge Function changes were made for this update.

TypeScript and regression checks passed locally, including blank/long names, duplicate prechecks and server conflicts, permission/network failures, owner filters, stale-session rejection and uncertain-create reconciliation. Live table metadata was verified read-only; actual-account project creation and automatic screen navigation require testing on Android. No production test project was inserted by the agent.
Version 1.1.1 native APK build succeeded in GitHub Actions run 36640421843 from source commit 5ab1a3ae42cfca575696deed651926c345c0770d; artifact 11066582617. CI typecheck, recognition/workflow/service/session-storage checks and Android compilation all passed. Downloaded APK SHA-256: `9bb3c6230de1f7bcc77c9878e47e96281dc4e53d60c188c4e7288c2e7d8c0e0a`. Standalone JavaScript bundle and 24 bundled ML Kit asset entries were inspected. Installation and actual-account project creation/navigation/error handling remain phone validation steps. This update made no Supabase schema/privilege/policy, Dodo, production website, or Edge Function changes.

## September 29, 2026 — native field workflow and scanner enhancement
Written user requirements supersede earlier offline deferral. Source is in device-capture/ on the existing prototype branch. See device-capture/FIELD_WORKFLOW_DECISIONS.md for implemented navigation/History, exact cloud errors, stable-ID durable upload queue, optional temporary installed photo, ML Kit geometry/gradual smart zoom and the outstanding permanent-photo/tasks/progress/uniqueness decisions. No new backend/schema, website, billing or Edge Function changes. Native build and actual phone validation are tracked separately; local checks do not prove a real authenticated insert.


## September 30, 2026 — verified internal Android builds
- Steps 1–4 build: version 1.2.0 / code 8, source f114f027dc40df0fb2f2fa0e88dbfd4d1d29c58a, GitHub run 36647777234, artifact 11068968574. APK SHA-256: b4bf2ae2043871c4e1fa99165993c3245abd3dfe6e78c299f0f632b52aff0342.
- Full field workflow build: version 1.2.1 / code 9, source 315899b8c98d289e2aa38141b5cf30fe6ff0b9ae, GitHub run 36780357498, artifact 11127616948. APK SHA-256: 400dcd4b4727525e33c682e6bd74f368ccdc5ec2d435b81c6f091759b9b0ef8c.
- CI install, TypeScript, recognition/workflow/service/session/queue/zoom regression checks, native prebuild and Android release compilation all succeeded. Final APK manifest confirms com.cableminttools.devicecapture.prototype, version 1.2.1, code 9. Standalone Hermes bundle contains the smart barcode event integration; 24 bundled ML Kit asset entries are present.
- Final APK is saved locally in device-capture/.artifacts/1.2.1/app-release.apk. Prototype/debug signing; not a store release.
- Live read-only Supabase check on September 30 confirmed device count 0, RLS enabled and authenticated SELECT/INSERT/DELETE privileges present. The agent did not make an authenticated test-device write. Phone validation of real saves/deletes, camera/pinch/zoom, Back, offline recovery and temporary-photo cleanup remains required.


## v1.2.2 reliability release — September 30, 2026

Scope is limited to sync feedback, functional camera zoom, and release packaging. The user's v1.2.1 field-test confirmation supplies current live integration evidence; this release keeps the existing authenticated save/History/delete service and backend contracts.

Sync button states are Sync Now, spinner + Syncing…, green Synced ✓ for 2.5 seconds, and red Sync Failed — Retry. Queue results count only records matching the server-returned attempt. Pending/uploading/failed counts and upload errors are visible; an empty queue says Everything is synced. Manual retry includes failed records, retains stable IDs, and joins the single upload worker. A stranded Uploading state after a local journal write failure is retried with its existing ID; it cannot be mistaken for an empty queue. Build 11 superseded build 10 following this final-review fix; binary inspection then rejected build 11 because it linked a precompiled camera.

The actual camera stack is expo-camera 57.0.5 / Android CameraX, with bundled ML Kit 17.3.0. The local cablemint-ocr module handles still-image recognition, not the live preview. v1.2.1 learned its zoom maximum exclusively through a custom barcode event, with a 1× fallback and unacknowledged Expo normalized zoom props. v1.2.2 adds two narrowly scoped Expo native view commands through the existing build plugin: getCableMintScannerState (actual ratio, min/max hardware limits, latest geometry and frame sequence) and setCableMintZoom (clamped CameraControl.setZoomRatio, resolved only when CameraX's future succeeds). The pinned Expo view adapter exposes these commands without changing capture/gallery/torch behavior. APK inspection uncovered the v1.2.1 root cause: Expo selected its precompiled expo-camera AAR ([📦] in Gradle logs), ignoring the source patches. The SDK documents opting out through package.json expo.autolinking.android.buildFromSource; this release requires ["expo-camera"] and verifies the command names in the APK DEX before uploading it. This removes the barcode-event dependency from manual zoom and delivers geometry through a bounded 200ms poll for automatic zoom. Controls display the acknowledged ratio and surface native failures.

Smart zoom selects the potential barcode nearest the scan-guide center, increases by 0.12× after three target observations with at least 650ms between steps, and caps at min(4×, hardware maximum). It stops on decode or any manual adjustment until the next capture/retake resets it. Manual buttons and pinch serialize/coalesce hardware zoom commands. Each camera session resets to 1×, clamped to the reported range. Development-only logs report current/requested ratios, barcode sizes, triggers and decode success, without identifiers.

Release standard: root RELEASES.md records each version/date/fixes/known issues. Expo config drives the visible Account version and generated native versionName; Android versionCode increments per testing/release build. scripts/package-android.cjs validates native output metadata against app.json, keeps app-release.apk for Gradle, and creates CableMint-Device-Capture-v<version>.apk without overwriting an existing copy. The workflow uploads the versioned copy.

TypeScript and regression checks passed locally. Actual source compilation and APK DEX verification are required; the successful earlier builds linked an unmodified precompiled camera and do not prove the new Kotlin code compiled. v1.2.2 phone testing remains. No Supabase schema, production website, Dodo configuration or deployed Edge Functions were changed.

## October 1, 2026 — v1.2.2 native compilation repair

GitHub Actions run 36789096585 (versionCode 12) correctly compiled expo-camera from source, exposing a Kotlin type-inference error in the mixed barcode geometry map at ExpoCameraView.kt:591. The plugin now uses explicit Map<String, Any> types for both the frame and per-barcode geometry. The next testing build increments versionCode to 13. This is a source compilation repair; actual APK and phone zoom remain unverified until their respective checks pass.

Build 13 (run 36922528269) passed TypeScript/regression checks but Kotlin still rejected the nested geometry-map expression, even with explicit map type arguments. Build 14 replaces nested mapOf/to expressions with typed mutable maps populated field by field. The payload shape and zoom algorithm are unchanged. versionCode increments to 14.

### Verified v1.2.2 delivery — October 1, 2026

Version 1.2.2 / Android versionCode 14 passed GitHub Actions run 36923897188 from source commit 988a50c8bde054f54b5bc16c5351bde35b742821. expo-camera:compileReleaseKotlin ran successfully from source. TypeScript, recognition, sync/queue and native-command controller regression checks, native release compilation, versioned packaging and APK verification all passed. Artifact 11194085141 was downloaded as device-capture/.artifacts/1.2.2/CableMint-Device-Capture-v1.2.2.apk (137677046 bytes). SHA-256 0175437a078745497973f2f325a1bc216e85147a5391f865fd8f5780269ac9c7 matches CI. Actual manifest confirms com.cableminttools.devicecapture.prototype, versionName 1.2.2 and versionCode 14; DEX contains getCableMintScannerState and setCableMintZoom; standalone JavaScript and 32 bundled ML Kit asset entries are present. Earlier precompiled-camera candidates are excluded from delivery; the rejected build 11 APK remains in its own build-11 folder. Physical-phone v1.2.2 zoom and sync feedback await user field testing. This internal APK retains prototype signing. No schema, website, Dodo or Edge Function changes.

## v1.2.3 scanner reliability — October 1, 2026

The user's v1.2.2 screen-recording findings confirm MAC barcode/ML Kit 0C110533D733 while the review/upload used OCR 00110533D733. The user confirms existing projects/navigation/cloud saves/History/delete/duplicates/camera-gallery/torch/manual zoom/reset work. This is current integration evidence; existing authenticated deviceService contracts are preserved and no cloud record is repaired automatically.

Recognition previously selected one strongest candidate but discarded disagreement evidence, while live geometry could not assign a still-photo field. analyzeScan now preserves raw decoded payloads, compares normalized MACs, records source-labelled conflicts, and retains printed-anchor/proximity ownership. A live/unassigned valid MAC differing from a printed MAC blocks OCR autofill without treating preview coordinates as image coordinates. Both MAC and serial conflicts require explicit resolution; Continue and save handlers guard unresolved/changed selections. Manual correction and explicit serial-only omission remain possible. Existing duplicate checks run unchanged on the final chosen values.

The empty-queue early return caused Sync Now to skip both visual activity and the server. Manual sync now always calls the existing authenticated paginated loadHistory service, including an empty queue, and caches server devices/check time without extending the Pro entitlement timestamp. All four queue-state counts refresh; the spinner remains visible at least 300ms, confirmed success for 3000ms. Green empty success reads Everything is synced — checked just now. Failed checks preserve the previous successful timestamp and show retry feedback. Manual sync holds the workspace operation guard to serialize with deletion/refresh. Automatic uploads retain their existing confirmed-attempt logic.

Camera remains Expo Camera 57.0.5 built from source / CameraX 1.6.0, bundled ML Kit barcode 17.3.0. The existing build plugin adds ZoomSuggestionOptions and defers scanner initialization until the bound camera reports its hardware limit. A callback exports the suggested ratio/sequence/age; it returns false because no synchronous zoom change occurs there. The JS controller gradually applies the suggestion through the proven setCableMintZoom CameraX command, accepting only actual acknowledgement. Potential bounding-box fallback remains. Guide-center preference, three observations, 650ms cooldown, 0.12× steps, min(4×,hardware) cap, manual latch, decode stop and capture reset remain. Expandable diagnostics work in the internal release APK; development logs report sizes, suggestions, triggers, requested/actual zoom and decode success without identifiers. An unchanged camera acknowledgement surfaces requested-but-not-applied failure.

References checked: https://developers.google.com/ml-kit/vision/barcode-scanning/android and https://developers.google.com/android/reference/com/google/mlkit/vision/barcode/ZoomSuggestionOptions.Builder. Supabase select documentation/changelog were reviewed; no SDK/backend changes are necessary. Versions align at 1.2.3; Android testing build code 15. Local and CI TypeScript and recognition/service/queue/session/zoom regressions passed. Native release build and APK verification passed; see verified delivery below. Physical distant-barcode optical testing is unavailable here and remains required; a barcode already decoded at 1× is correctly a stopped auto-zoom state, not evidence of failure.

### Verified v1.2.3 delivery — October 2, 2026

Source 11116c7e810ef99389a007e7ff55db0c83c2fb73 passed GitHub Actions run 36937982573 / job 110622622957 on October 1. The job compiled expo-camera from source (expo-camera:compileReleaseKotlin), assembled the release APK, validated versioned packaging and confirmed the native zoom commands and suggestion bridge in DEX. Artifact 11198574951 was downloaded on October 2 to C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.3\CableMint-Device-Capture-v1.2.3.apk without overwriting older versioned APKs. Independent local binary verification confirms filename, package com.cableminttools.devicecapture.prototype, versionName 1.2.3, versionCode 15, both zoom commands, ZoomSuggestionOptions/suggestedZoom/suggestionSequence, standalone JS bundle and 32 ML Kit asset entries. Size 137692474 bytes; SHA-256 b3828ef115e4f40b47b55126312bd333854ef798878509c3f11cfcddfafb5f31 matches CI.

Implemented and automatically tested: exact MAC/OCR mismatch and confusable characters with explicit conflict guards, serial-only/multiple barcode support, real-read empty-queue sync feedback logic, suggested/geometry zoom control and native acknowledgement failures. Physical-phone conflict interaction, online/offline zero-queue sync UI and genuinely distant undecodable-barcode auto-zoom remain unverified here. Manual zoom/pinch/reset and all user-confirmed service contracts are preserved, but must be included in the phone regression check. Existing cloud records were not modified; no production website, Supabase schema, Dodo or Edge Function changes. Prototype signing remains internal-only.

## v1.2.3 field correction and v1.2.4 native zoom — October 2, 2026

The user explicitly confirms automatic zoom never activated in v1.2.3; visible zoom was entirely manual. The supplied 31.79-second recording holds 1× with zero decoded barcodes; its diagnostics panel is collapsed, so it does not establish whether potential detection, requesting or application failed. This supersedes any suggestion that automatic zoom was field-validated. Manual zoom remains confirmed working.

ML Kit 17.3.0 potential detection and ZoomSuggestionOptions were already enabled. The old callback exported a suggestion and always returned false, with a later JS poll/frame stability/age/size gate controlling the lens. v1.2.4/code16 replaces that fragile automatic handoff with a pure Kotlin controller beside ML Kit. Both native automatic requests and the preserved manual command call one applyCableMintZoom CameraX CameraControl.setZoomRatio operation and read actual zoom after its future settles. JS polls only display state; automatic movement no longer depends on React frame delivery. The ML Kit callback now returns whether a real camera request was submitted, following the documented asynchronous CameraControl pattern; the subsequent native acknowledgement independently reports success/failure.

The native fallback considers thin 1D codes as well as small bounding boxes, prefers the guide center, waits three stable geometry observations, and ramps by 0.12× with 650ms cooldown and min(4×,hardware) cap. Native decode, manual buttons/pinch and photo stop suppress requests. Initialization acknowledges 1× before enabling automatic mode; installed-photo mode does not enable it. Empty payloads are not classified as successful decodes. Added release diagnostics/logs expose detection, request, application, frame age/count, suggestions and suppression reason without identifiers. Native Kotlin unit tests exercise the delivered controller with simulated camera acknowledgement and no manual interaction; real optical/camera testing is still required.

Resolved conflicts retain their source/audit choices but no longer show the saving-blocked text. Identification, sync, database, website, billing and Edge Functions are unchanged. Local TypeScript/regression checks and Android prebuild passed; native CI release and APK verification are pending.

Build 16 passed native Kotlin controller tests and source compilation. Final testing build code increments to 17 for a UI guard: automatic-request cancellation after a deliberate manual override/photo stop is logged but is not surfaced as an automatic camera failure. Active automatic application failures still surface. Final release verification pending.

### Verified v1.2.4 delivery — October 2, 2026

Final source dae185c3449ac5fc76400f89dcbcaf663a1fb85c passed GitHub Actions run 37084671054 / job 111092362050. The logs confirm expo-camera:compileReleaseKotlin, compileReleaseUnitTestKotlin and testReleaseUnitTest executed successfully (not NO-SOURCE). Six Kotlin controller tests cover automatic requests without manual input using simulated camera acknowledgement. Release assembly and strengthened binary gates passed. Build 16 also passed run 37084285755; the final delivered candidate is versionCode 17 with the manual-cancellation UI guard.

Artifact 11259718413 was downloaded to C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.4\CableMint-Device-Capture-v1.2.4.apk. Independent local binary verification confirms filename, package com.cableminttools.devicecapture.prototype, versionName 1.2.4 / versionCode 17, getCableMintScannerState/setCableMintZoom/setCableMintAutoZoom/pauseCableMintAutoZoom, ML Kit suggestions, CableMintAutoZoom and applyCableMintZoom in DEX, standalone JS and 32 bundled ML Kit asset entries. Size 137693070; SHA256 44f262bc6dfe6781f614550661fa58d49e27b1499e45baec29396ff48a26117b matches CI. The older v1.2.3 APK is intact.

A physical distant undecodable barcode test, without manual input, remains required. This workspace has no attached Android camera; unit fixtures and the prior recording do not prove optical detection or hardware movement for the new build. Keep the diagnostic panel expanded during that test; also check manual buttons/pinch, reset, decode stop and resolved-conflict wording. No production integration changes or automatic cloud-record edits.

## v1.2.4 field failure and v1.2.5 investigation — October 3, 2026

The supplied 94.94-second recording and comparison confirm 1× throughout, unrelated UPC-E values and a device-key QR, and intervals with zero distinct decoded results. Native potential/request diagnostics are collapsed. The verified source bug is CableMintAutoZoom.frame stopping permanently on ANY decoded payload; JS also announced a stop for any decode. Clear codes did not re-arm native automatic mode. ML Kit 17.3.0 is already configured for potentials/suggestions in the LIVE analyzer. Its documented built-in callback requires no successful decode, so unrelated readable codes can suppress suggestions. Zero decoded results do not prove zero potential detections; those intervals remain optically unexplained.

v1.2.5 uses guide-centered stable potential geometry independently of unrelated decodes, with corner-point fallback, gradual steps/cooldown/hardware cap, and no blind zoom without fresh potential evidence. Relevance is a zoom-only candidate heuristic; all raw values, printed-label association and conflict/save checks are unchanged. The shared production CameraControl operation reads the captured camera's actual ratio after its future and rejects stale generation/session callbacks. Native diagnostics expose all requested counts/status/ratios plus camera generations and capture resets. Stable RN settings and unchanged scanner-enabled guards avoid redundant rebinds.

See device-capture/SCANNER_V1.2.5_FINDINGS.md for investigation and the no-manual-input field protocol. Twelve native policy/CameraControl tests are prepared; the production API operation uses a camera test double, not physical hardware. Existing TypeScript/identification/sync/queue/service/manual zoom checks and clean-source/idempotent native patch validation pass locally. Version 1.2.5 / testing code18 was prepared only after implementation/diagnostics readiness. Native compilation and delivery passed (see verified delivery below); do not claim optical auto-zoom fixed until phone diagnostics show independent requests and actual movement. Existing working service integrations are field-confirmed and untouched; no website, schema, Dodo, Edge Function or cloud-record changes.

### Verified v1.2.5 internal delivery — October 3, 2026

Source c0028323ef32d86bb9ec683c254f60f596eb833b passed GitHub Actions run 37166331749 / job 111329867593. The logs show expo-camera:compileReleaseKotlin, compileReleaseUnitTestKotlin and testReleaseUnitTest executed from source. Twelve policy/production CameraControl tests passed; their explicit XML evidence gate logged independent setZoomRatio requests 1.12× and 1.24× and separate actual acknowledgements without manual input, using a camera test double. Existing TypeScript/recognition/conflict/service/sync/queue/manual-zoom checks, fresh native prebuild, release assembly, versioned packaging and strengthened DEX gates passed.

Artifact 11289174856 was downloaded to C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.5\CableMint-Device-Capture-v1.2.5.apk. Independent binary verification confirms package com.cableminttools.devicecapture.prototype, versionName 1.2.5 / versionCode 18, all four native commands, ML Kit suggestions, shared CableMintZoomOperation, automatic request/relevance/generation diagnostics, standalone JS and 32 ML Kit assets. Size 137710826 bytes; SHA256 707b7773e41473be6d8547845c75da2d302b9e8bacea352fb636a5acd0adfbfa matches CI. Older versioned APKs remain intact. Physical distant-barcode optical detection and actual hardware movement are still unverified; this release is a diagnostic/internal test candidate, not a declaration that field auto-zoom is fixed. No production integration changes.


## v1.3.0 UI/workflow decisions — October 4, 2026

Source: user confirms v1.2.5 field stability and requests a complete native UI/UX overhaul, with the supplied locked CableMint logo/banner as the color reference. Shared theme uses charcoal blue, CableMint green, white and cool gray; logo is reused byte-for-byte. Reference work-app screenshots contribute workflow inspiration only; no proprietary code, assets or exact layouts are used.

- Shared components centralize headers, buttons/fields, original line icons, project/type cards, status badges, compact History rows, step headers, advanced panels, confirmation and persistent bottom tabs. Safe-area insets keep content and tabs clear of Android system bars.
- Projects use server/cache records plus outstanding local records without duplicate counting; project overview shows actual counts, recent captures, existing batch context and capture/History actions. No invented progress denominator or task data.
- An open scanner remains mounted in React when using other tabs, retaining selected identifiers, conflict resolution and pending save. Its camera view is unmounted while hidden, so camera/torch and zoom polling stop; the existing initialization restores zoom when the preview resumes. Project changes require explicit discard confirmation. Back uses existing capture guards; closing capture removes stale scan routes.
- Verification shows selected MAC/serial with Edit first, sourced conflicts require explicit choice, and resolved warnings become a compact positive state. Barcode/OCR/confidence information is behind Advanced scan details. All native diagnostics are hidden behind Developer · scanner diagnostics by default. The native scan-guide geometry remains exactly 8–92% horizontally and 27–73% vertically.
- Location carries forward the existing per-project building/floor/unit batch. Existing auto-advance and temporary installed-photo settings remain editable. Photos are not persisted/uploaded. Save & Capture Next publishes locally through the unchanged queue; confirmation reads that exact queue item's state and only says Saved & synced after server acknowledgement.
- History merges server and local records, uses compact sourced status rows and search/filter controls. MAC searches accept compact, colon, dash and dotted forms. Record details retain cloud deletion; errors show actionable copy and optional technical detail. Sync Now's authenticated server check, three-second confirmation, counts and retries are unchanged.
- Account shows email, existing entitlement check, sync access, config-derived version and Sign Out. Tasks remains an honest empty state. No production website, schema, billing, Edge Function or native scanner policy changes.
- Development-only browser preview compiles the actual screen/components with synthetic native/network adapters. It is not imported by App.tsx and is not evidence of physical optics or live cloud connectivity. See device-capture/UI_V1.3.0.md for regression evidence and remaining phone checks.

Read-only live check October 4, 2026 reconfirmed the public.field_projects / public.field_devices column contract above; the v1.3.0 UI uses the same existing fields. No live records or infrastructure were changed.

### Verified v1.3.0 internal delivery — October 4, 2026

Source aff4a87bdb385600a8e78449228d328eff10b941 passed [GitHub Actions run 37209055014](https://github.com/JmanX/cableminttools-site/actions/runs/37209055014) / job 111456289183. TypeScript, all recognition/service/auth/queue/sync/manual zoom regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly and binary gates passed. Native tests logged independent 1.12×/1.24× requests and actual acknowledgements with a camera test double; the physical Android smoke checklist remains pending.

Downloaded artifact 11305744745 independently confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.0 / versionCode 19, native zoom commands/suggestions, shared CameraControl operation, SVG/safe-area packages, redesigned UI and standalone JS with 32 ML Kit assets. Synthetic development-preview identifiers/labels are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.0\CableMint-Device-Capture-v1.3.0.apk`

Size: 145,838,356 bytes. SHA-256: `1ad8023a0af43b749358b3ae35ccef954845873a83198041fbe901cb343c702f` (matches CI). Older versioned APKs are preserved.


## v1.3.1 Capture Next decisions — October 4, 2026

Save & Capture Next now returns directly to Device Type in the same project, after the unchanged queue confirms a durable local save. The type screen displays that exact saved record's Pending/Syncing/Failed or server-confirmed Synced state; returning to Type does not claim the upload succeeded. A failed local enqueue leaves the original capture available for retry.

- Completed MAC/serial, raw barcode/OCR candidates, conflict resolution, verification, photos, errors, diagnostics, pending save attempt and camera state are cleared using the existing reset and a fresh scanner mount. Device Type, Manufacturer and Model clear. Native initialization resets zoom to 1× and re-arms the existing automatic scanner.
- Building and Floor / Area persist per project. Unit / Room / Location clears by default. The existing explicit auto-advance option carries only a newly incremented numeric location; unincrementable/non-numeric locations clear.
- The next type selection opens Scan directly. Completion removes stale scan routes and clears the parent's scanner-busy state; Back from Device Type still exits to the project overview. Existing tabs/capture-resume behavior is retained.
- Tests cover type routing/Back, retained context, clear equipment fields, default/explicit advance/overflow locations, immutable completed drafts, serial-only second capture, independent identifiers and two acknowledged History records through the real durable queue with a synthetic server.
- Actual production screens passed a browser preview with synthetic adapters: WAP gallery conflict → explicit barcode choice → local save/confirmed upload → Device Type → Intercom at 1× with empty diagnostics → serial-only scan → retained Building/Floor and empty Room → second save → Device Type → Back/History with both correct records.
- v1.3.0 visual design, native scanner/automatic/manual/pinch zoom, recognition, duplicate checks, authenticated services and synchronization are unchanged. The October 4 read-only integration contract and user-confirmed working v1.3.0 behavior remain applicable. No website/schema/Dodo/Edge Function/cloud-record modifications.

See device-capture/CAPTURE_NEXT_V1.3.1.md for regression scope and phone follow-up. Native compilation and versioned delivery passed as recorded below.

### Verified v1.3.1 internal delivery — October 4, 2026

Source 117264a1c943c77d1bffd8cb4f5d970d276cf404 passed [GitHub Actions run 37227558977](https://github.com/JmanX/cableminttools-site/actions/runs/37227558977) / job 111510256399. TypeScript and all core/new Capture Next regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly, packaging and binary gates passed. Existing native tests independently requested/acknowledged 1.12× and 1.24× with a camera test double; this is not a physical optics test.

Artifact 11312902152 downloaded without replacing older versioned APKs. Independent local inspection confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.1 / versionCode 20, all native zoom commands/suggestions, shared camera operation, standalone JavaScript and 32 ML Kit assets. New room-reset copy is included; synthetic preview/test identifiers are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.1\CableMint-Device-Capture-v1.3.1.apk`

Size: 145,839,372 bytes. SHA-256: `770f57859e76b615e5dfa0e3fa18f2305eef03d713095507cb6bb9225210d1ba` (matches CI). Older APKs preserved.

The user subsequently confirmed v1.3.1 is working properly and designated it the stable version on October 4, 2026. This is user field confirmation, distinct from the automated/synthetic test evidence above. Future app changes should start from this delivered build and preserve its working behavior. No production integrations changed.


### Stable baseline acceptance — October 4, 2026

The user stated: “this is working properly, now this the stable version.” Current baseline: CableMint Device Capture v1.3.1, Android versionCode 20, built source 117264a1c943c77d1bffd8cb4f5d970d276cf404. Keep the existing versioned APK and use its working capture/scanner/sync/UI behavior for future regressions. This acceptance changes documentation only; it does not create a new release/build or modify application behavior.


## v1.4.0 Project Dashboard and private Gap evidence — October 4, 2026

The user explicitly authorized field_gaps, project_files and minimal field_gap_deletions retry tombstones plus the PRIVATE project-files bucket and required owner/project RLS. Four CLI-generated additive migrations are applied to kgbrhdjbeosljpwghxte. Table ownership policies (10), Storage policies (4), identity/path/completion invoker helpers (4), expected-photo count and staged-deletion guards are verified live. Existing field_devices column fingerprint remains 61d6ac3a3bc49e50ff5c80aa4509ff0c; existing website/billing/functions/cloud records unchanged. Live owner/other/anon transactional RLS probes pass and roll back, including safe cleanup and no deleted-Gap resurrection. No real Storage-byte upload test was performed.

New native Gap flow has real project modules, 1–3 durable compressed JPEG photos, stable idempotent UUID/path queues, private short-lived photo access, complete upload acknowledgement, status resolution/reopen, and retryable confirmed deletion. Scanner/device recognition/native camera policy and device queue/service are unchanged. Optional calculation counts use authenticated reads of the existing table only. Foreground upload coordination extends Sync & Uploads and Account storage counts. Never automatically retain/upload scanner label photos.

Version 1.4.0/code22 is the verified internal candidate; local/CI TypeScript/full existing/new regressions, twelve native tests, synthetic screen QA, native release compilation and independent APK inspection pass. Field acceptance remains pending. See device-capture/PROJECT_GAPS_V1.4.0.md for exact schema/policy names, changed files, deletion behavior, privacy and physical-device checklist. v1.3.1 remains user-confirmed stable until acceptance.

### Verified v1.4.0 internal delivery — October 5, 2026

Source 15a64ffb44adea0d8404a9ce833ee56c3d9635a5 passed [GitHub Actions run 37247593583](https://github.com/JmanX/cableminttools-site/actions/runs/37247593583) / job 111568448885. TypeScript and all existing/new regressions, fresh Android generation, twelve native automatic/manual zoom policy and CameraControl tests, native release assembly, packaging and binary gates passed. Independent native requests acknowledged 1.12× and 1.24× with a camera test double, not physical optics.

Artifact 11320125290 was downloaded and independently verified on October 5, 2026. Actual manifest: package com.cableminttools.devicecapture.prototype, versionName 1.4.0 / versionCode 22. All native zoom commands/suggestions, standalone JavaScript, 32 ML Kit assets and the native Expo ImageManipulator module are present. The Gap workflow/table/bucket strings are in the release bundle; synthetic preview identifiers/photos are absent.

Size: 145,943,480 bytes. SHA-256: `24ea6de116793137a7f549796143f3745b025c6fef34a6f3742c6797d307b032` (matches CI). Older APKs preserved. Independent binary evidence is saved beside the APK as apk-verification.json and native-ci-evidence.txt.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.4.0\CableMint-Device-Capture-v1.4.0.apk`

The APK is ready for physical Android testing. Real camera/rotated gallery compression, authenticated private Storage-byte uploads, offline saved-Gap restart/reconnection, cross-phone cleanup/account isolation and the full stable capture checklist remain unverified on this new build. Automated/synthetic and live transactional RLS results do not replace these checks. See device-capture/PROJECT_GAPS_V1.4.0.md for the full acceptance checklist. v1.3.1 remains user-confirmed stable.

## v1.4.1 Gap evidence hotfix — October 6, 2026

Real v1.4.0 field testing found a confirmed private Storage AccessDenied failure after field_gaps had already synced. Live SELECT/UPDATE/DELETE policies bound unqualified name inside field_projects subqueries to the project title. Applied 20261006213127_gap_storage_rls_hotfix.sql explicitly uses storage.objects.name in all four policies. A direct live regex probe found one backslash and successful UUID.jpg matching; the migration explicitly retains `\.jpg# CableMint Device Capture: technical context

**Status:** v1.3.1 / Android versionCode 20 is the current stable baseline. On October 4, 2026, the user reported that this build is working properly and designated it stable. This field confirmation supersedes the prior pending overall v1.3.1 phone-acceptance note. The approved v1.3.0 design, stable scanner/recognition/zoom and synchronization remain the baseline for future changes. Local/CI regressions, twelve native tests, release assembly and independent APK verification passed.

**v1.4.1 verified internal hotfix:** Real v1.4.0 Gap photo upload failed under Storage RLS. The October 6 live ownership-policy fix is applied, and the user confirmed the retained photo uploads and appears without recreating the Gap. Version 1.4.1/code23 adds independent record/photo feedback, project status isolation and authorization retry controls; native compilation and independent versioned APK verification passed. See device-capture/GAP_PHOTO_SYNC_V1.4.1.md. v1.3.1 remains the last explicitly user-designated stable build.

**Milestone 1 implementation, September 27, 2026:** The Android scanner prototype now lives in `device-capture/`. It uses Expo SDK 57, `expo-camera`'s native Android ML Kit barcode scanner, and a local Android Expo module with bundled ML Kit Latin OCR. It presents printed-label MAC/serial candidates and all raw barcodes for technician review, with no Supabase/Dodo connection or record writes. See `device-capture/README.md` for build and field-test steps. TypeScript and parser checks passed. GitHub Actions run 36362683802 successfully compiled the native Android release variant with prototype debug signing and uploaded artifact 10946452017. The APK contains the JavaScript bundle and bundled barcode/OCR models. Real-label accuracy remains unverified until phone testing.

## Sources and precedence

- The open ChatGPT conversation [“Check Etsy Traffic”](https://chatgpt.com/g/g-p-6a933f65f48c8191bda776ab70aedca3/c/6aaefb8f-a950-83e9-9b83-ce4f04bcec7d) contains the product history and decisions. Later decisions in that conversation supersede earlier experiments.
- The live Supabase project `kgbrhdjbeosljpwghxte` was inspected read-only on September 27, 2026 for public table columns, RLS policies, and Edge Function names. Those observations take precedence over older chat claims about the *current* schema.
- `CABLEMINT_CHANNEL.md` governs CableMint video production and locked brand assets. Device Capture is an app, but it should still use the established CableMint Tools identity and keep JayroVibe separate.
- This file is in the root of `JmanX/cableminttools-site`. The Android prototype lives in `device-capture/`; its presence does not change the production website.
- Never copy secret keys, passwords, webhook secrets, user data, or contents of `Supabase.txt` into app code, Git, documentation, logs, or client bundles. Existing secrets must be rotated if their exposure is suspected.

## Product boundary

CableMint Tools serves low-voltage and IT infrastructure technicians. The existing **CableMint Field Tools** website/PWA at `https://cableminttools.com` provides field calculators, cloud projects and calculation history, branded PDF project reports, billing, and the current Device Capture interface. The native app is a focused companion front end for reliable field device capture, using the **same Supabase Auth accounts, projects, device records, and Dodo Pro entitlement**. Do not rebuild or change the production website for this prototype.

The website/PWA is already usable, and its project PDF can report saved calculations. The conversation describes later expansion of closeout reports to devices, notes, and punch items; that is future web work, not part of the first native milestone. Native billing/checkout is also outside the first app scope. The app should consume existing entitlement state rather than process payments or hold Dodo secrets.

## Supabase architecture (September 27 snapshot; v1.4.0 additions below)

Project ref: `kgbrhdjbeosljpwghxte` (`https://kgbrhdjbeosljpwghxte.supabase.co`). Public tables observed:

| Area | Tables | Purpose |
| --- | --- | --- |
| App | `field_projects`, `field_project_calculations`, `field_devices` | User-owned projects, calculator results, and device text records |
| Billing | `dodo_customers`, `dodo_subscriptions`, `dodo_webhook_events` | Dodo customer/subscription state and processed webhook IDs |

All six public tables have RLS enabled. At inspection, `field_projects` had 2 rows, `field_project_calculations` 4, and `field_devices` 0; these counts are only a snapshot. The project and device rows link to `auth.users` through `user_id`. `field_devices.project_id` references `field_projects.id`.

`field_projects`: `id uuid` primary key (default generated), `user_id uuid`, `name text` (1–80 characters), `created_at timestamptz`, `updated_at timestamptz`. An authenticated user can manage rows where `auth.uid() = user_id`.

`field_project_calculations`: `id uuid`, `project_id uuid`, `user_id uuid`, `tool_name text` (1–80), `result_text text` (up to 4000), `created_at timestamptz`. It has an own-user policy and checks that the parent project belongs to the user.

### Exact current `public.field_devices` columns

| Column | Type | Existing rule/default | Capture meaning |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | Record ID |
| `project_id` | `uuid` | FK to `field_projects.id` | Selected project |
| `user_id` | `uuid` | FK to `auth.users.id` | Signed-in owner |
| `building` | `text` | default `''`, max 100 | Batch context |
| `floor_area` | `text` | default `''`, max 100 | Floor or area |
| `unit_location` | `text` | default `''`, max 120 | Room, unit, or location |
| `device_type` | `text` | 1–80 characters | Required device category |
| `manufacturer` | `text` | default `''`, max 100 | Vendor |
| `model` | `text` | default `''`, max 120 | Model |
| `mac_address` | `text` | default `''`, max 32 | Verified, normalized MAC if present |
| `serial_number` | `text` | default `''`, max 160 | Verified serial if present |
| `ip_address` | `text` | default `''`, max 64 | Optional network detail |
| `switch_name` | `text` | default `''`, max 120 | Optional switch |
| `switch_port` | `text` | default `''`, max 80 | Optional port |
| `vlan` | `text` | default `''`, max 40 | Optional VLAN |
| `notes` | `text` | default `''`, max 2000 | Optional notes |
| `verified` | `boolean` | default `true` | Tech confirmation flag |
| `captured_at` | `timestamptz` | default `now()` | Capture time |
| `updated_at` | `timestamptz` | default `now()` | Update time |

The live table has **no image/blob column**, no built-in unique MAC/serial constraint, and no dedicated offline-sync identifier. Do not assume that duplicate protection exists at the database layer. The conversation describes project-scoped duplicate MAC and serial checks in the PWA; recreate and test them explicitly in the native app without inventing a schema change. A record may have a serial without a MAC when the label genuinely has no MAC. Only save `verified: true` after the tech confirms the fields.

Live RLS policies for `field_devices` allow `authenticated` users to select/delete only rows with their `user_id`. Insert requires both `auth.uid() = user_id` and ownership of the referenced `field_projects` row. Update has the same ownership checks in `USING`/`WITH CHECK`. The native client must use the user's Supabase session and the public/publishable client key; never use a service-role or secret key on the device. Project listing must be scoped to the signed-in user. The Dodo subscription read policy matches `customer_email` to the email in the authenticated JWT (case insensitive); confirm entitlement handling in the actual client before relying on it for access control.

## Dodo billing and Pro state

The latest conversation says **Dodo is the only active billing source** for CableMint Pro. Paddle's live application was rejected; its webhook and secret were removed, and the live public-table listing contains no Paddle tables. Earlier chat messages mentioning Paddle fallback are superseded. The user completed a Dodo test payment, and the conversation reports Dodo → Supabase → Pro unlock working in **test mode**. Dodo product information was submitted for review; live-mode approval was still pending at the end of the conversation. Recheck that status before any live-billing work.

Live Edge Functions observed: `dodo-webhook` (active, `verify_jwt: false`) and `dodo-checkout` (active, `verify_jwt: false`). The conversation says webhook signatures are verified server-side, events are stored/idempotently tracked in `dodo_webhook_events`, and `dodo_subscriptions` drives Pro access. `dodo_customers` and `dodo_subscriptions` were populated in test mode at inspection. The native app must not call checkout with embedded Dodo credentials or duplicate webhook logic. The website remains the payment surface; the app should read the existing entitlement through the permitted user path and show a clear signed-in/Pro state. Test-mode status must not be presented as proof that live payments are enabled.

Do not put actual Dodo API keys or webhook signing values in this file. The conversation names server-side Supabase secrets `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY`; their values must remain secret. Monthly and annual products both map to CableMint Pro; product IDs should be obtained from the deployed configuration when needed, not guessed.

## Existing Device Capture workflow

The current PWA flow is **Project → Building → Floor/Area → Device Type → Scan → Verify → Save & Next**. A technician signs in, chooses a project and location context, scans a device label, reviews candidate MAC/serial/model values, corrects mistakes manually, then saves a verified text record to `field_devices`. Manufacturer and model can carry forward across a batch. Project, building, floor, and device type persist for the next scan. An optional unit/room auto-advance supports sequences such as Apartment 101 → 102 → 103. Optional IP, switch, port, VLAN, and notes can be entered. The project has a device inventory and delete control. The PWA is Pro-gated.

The captured photo is used transiently for recognition and is **not uploaded or retained** by CableMint according to the conversation. Keep that privacy behavior in the prototype unless the user explicitly changes it. Store only verified text values in Supabase. A field tech should be able to save a serial-only device if there is no MAC on its label. Warn about duplicate MACs **and** serials within the project, while allowing the technician to inspect and resolve the conflict.

## Scanner failure and recognition rules

The browser/PWA implementation tried browser barcode support, then ZXing, image resizing/contrast passes, and OCR (described elsewhere as Quagga/Tesseract-style browser scanning). Multiple parser/cache revisions attempted OCR splits, common `O/0`, `I/1`, `S/5` errors, and vendor label variants. The user reported that clear labels sometimes produced “could not confidently read label,” that browser and installed PWA results differed, and that the MAC was frequently **wrong**. All four supplied real label photos failed in both browser and PWA during one test. Treat web scanning as unproven for commissioning; do not port its guesswork unchanged.

Real examples include Omada/TP-Link labels with dashed or compact MACs, Akuvox labels with compact 12-character MACs, and a UNV camera box where serial may be available but no MAC is printed. Labels may include multiple 1D/2D barcodes encoding a serial, device key, product ID, SSID-related value, or MAC. **Twelve hex characters alone do not prove a MAC.** The strongest association is explicit printed `MAC` text next to a value, or a barcode clearly correlated with that printed row. Read printed text even when barcodes are found. Show all plausible barcode and OCR candidates with source/confidence and require a technician's selection or correction when ambiguous. Never silently choose a random barcode as the MAC. Normalize a confirmed MAC to one consistent form before saving (proposed display/storage form: uppercase colon-separated octets), but preserve the raw scan candidate in memory until verification. Serial recognition is independent of MAC recognition.

The user supplied an APK from a company Device Capture app as a reference. The conversation's APK inspection reported ML Kit Barcode Scanning 17.3.0, ML Kit Text Recognition 16.0.1, Expo Camera/Android CameraX, and native Barcode/OCR components. Its App Store listing described barcode/QR, photos, offline operation, location validation, and sync. These are **reference observations**, not a dependency requirement or a claim that CableMint already implements those features. Do not copy proprietary app code/assets.

## Native app decision and sequence

Build **CableMint Device Capture** as an **Android-first Expo/React Native app** sharing the existing Supabase backend. Use native Google ML Kit barcode scanning and text recognition through an Expo-compatible native module or custom native integration. The exact package/integration is not yet chosen; verify current package maintenance, Android compatibility, Expo SDK compatibility, license, and whether it actually uses native ML Kit before committing to it. A custom **development build/internal APK** is required for native modules; Expo Go alone is not the target runtime. The conversation favors a bundled Android barcode model so first use can work without downloading the model in the field. OCR should run on-device. Evaluate camera focus/resolution and multi-barcode capture against real labels.

Priority order from the latest chat:

1. Put a minimal Android scanner prototype on Jairo's phone. Test against the same Akuvox, Omada, UNV, and TP-Link labels that defeated the PWA. Measure correct MAC/serial assignment, missing values, false assignments, and manual correction time.
2. Once scanning is reliable, connect the full sign-in → own project selection → building/floor/device type → scan → verify → save/next flow to existing `field_projects` and `field_devices`. Preserve batch context. Add proper duplicate checking and Pro entitlement behavior.
3. Add a durable offline queue and sync after recognition works. Earlier discussion listed offline as a desirable field capability; the **latest explicit milestone deferred it**, so do not claim offline sync exists in v1. When implemented, design idempotent retries and conflict handling before relying on it in the field.
4. Add iOS after Android recognition is proven. Store release follows field validation; it is not part of the initial APK milestone.

Use EAS configuration for an internal Android build. On September 27, 2026, Chrome was signed in as `cableminttools` with project `@cablemint-tools/cablemint-tools` linked to `JmanX/cableminttools-site`; the local EAS CLI was subsequently authenticated as `cableminttools`. Browser and CLI sessions are separate. GitHub Actions produced the first standalone APK; an EAS build was not needed. The app remains unlinked locally pending a future approved EAS build. The user does not need to write code or install Android Studio just to test an EAS-built APK. Expo account authorization and installing/testing the APK on a real Android phone are user/device steps. Do not assume an Expo connection or account session is available to Codex. Document exact build commands once the project and package versions are chosen.

## Build constraints and unresolved checks

- Do **not** modify the production website, deployed Edge Functions, Dodo setup, or Supabase schema for this handoff or the scanner prototype. The user’s v1.4.0 authorization permits only the Gap tables, generic file metadata, one private bucket and their ownership policies documented below. If a later requirement truly needs such a change, explain the specific gap, migration/rollout, and effect on existing users before making it.
- Verify the current website's actual client mapping and Pro entitlement query before implementing mobile access; the conversation reports behavior, while this file's live check verified tables/policies/function existence, not deployed source code.
- Verify `field_devices` column nullability, length checks, and RLS with an authenticated non-production/test account before the first write. Do not test by inserting production-like records into a user's real project without an explicit test plan.
- Decide how to handle project-scoped duplicate queries, serial-only captures, verification state, and retry safety in code. The current schema permits an empty `mac_address`; it does not itself enforce MAC/serial uniqueness.
- Select and test an actual Expo-compatible native ML Kit integration. “Expo Camera barcode scanning” and “native ML Kit OCR” are distinct capabilities; confirm both in an Android development build.
- Avoid shipping real device-label photos or identifiable equipment data in the repository. Use consented/redacted test assets or on-device test cases.
- This context file is the planning baseline. Update it when implementation evidence or later user decisions supersede a statement, noting the date and source.

## Milestone 1 phone feedback and correction — September 27, 2026

The user installed the first APK and reported that Reading label stayed loading although two live barcodes had been counted. Inspection found Expo Camera scanFromURLAsync depends on an optional ImageLoaderInterface service; no implementation is installed, and its absent-service path does not settle the promise. Version 1.0.1 replaces that still-image call with direct local-file ML Kit scanning in the local native module, shows live barcode values immediately, adds Review read codes, bounds photo capture to 10 seconds and recognition calls to 12 seconds, and falls back to available live codes on failure. Late photos are deleted. Regression checks cover never-settling calls and late-photo cleanup. GitHub Actions run 36364777329 passed all checks and native compilation and produced replacement APK artifact 10946539958. Phone verification of the corrected capture path remains pending.

## Spatial recognition and gallery decision — September 28, 2026

The user confirmed version 1.0.1 reads Akuvox barcodes `0C110533D733` (MAC) and `P1U922QJ00465` (serial), but flattened OCR order incorrectly offered `DC110533D733` as a serial and left barcodes unassigned. This supersedes the pending capture-path verification above.

Version 1.0.2 (Android version code 3) preserves native ML Kit line/element/barcode bounding boxes, corner points, and image dimensions. Printed MAC/SN/S/N/SERIAL/SERIAL NUMBER anchors associate values by same-row or immediately-below proximity in the anchor's rotated coordinate frame. Barcode association must be unique in both directions; ambiguity remains unassigned. A barcode can also corroborate uniquely associated nearby printed text despite one OCR character error. Barcode data takes precedence; confirmed MAC values normalize to uppercase colon-separated octets. Shape alone never assigns a MAC, and serial matching is independent. Review retains raw geometry and shows assignment reasons with editable technician fields. Live-preview coordinates are excluded from captured-image classification.

Scan with Camera is primary. Choose Existing Photo uses the Android system picker and the same local native pipeline, without upload, permanent CableMint storage, or broad media access. Only app-cache copies are deleted after recognition; the original gallery image is preserved. Flashlight controls read Turn On Flashlight / Turn Off Flashlight. Gallery scans clear previous live-code context. Milestone 1 still has no record saving or backend integration.

TypeScript, parser, timeout, and cache-path privacy checks passed locally. Synthetic spatial fixtures cover the Akuvox values and OCR typo, shuffled OCR order, tilted labels, competing/shared barcodes, serial-only hex values, and coordinate-frame mismatch. Native prebuild passed. Physical camera/gallery accuracy and temporary-file cleanup require testing on the phone after the replacement APK build. Production website, Supabase, Dodo, and Edge Functions remain unchanged.

Replacement APK 1.0.2 built successfully in GitHub Actions run 36479027245 from commit cb4d67ac46ff3d6884cae51939b5a8afa8b5a56a; artifact 10996536046. The downloaded APK contains the JavaScript bundle and bundled ML Kit barcode/OCR assets. APK SHA-256: `8674b54da289645d57d94268ce5e7218e544fcac7a556ce45d8334688aebbbde3`. This is a standalone prototype with debug signing, not a store release. Phone accuracy remains unverified for this version.

## Manual assignment and confirmation feedback — September 28, 2026

The user's version 1.0.2 phone screenshot shows both decoded Code128 values unassigned and `AKUVOX` incorrectly suggested as an OCR serial. The barcode rows lacked selection buttons; technician fields were editable but had no explicit confirmation action. This is evidence that automatic spatial classification remains unproven on the actual label, despite synthetic test success. Obtain the original label photo before adjusting association thresholds; do not infer the missing native geometry from a review-screen screenshot.

Version 1.0.3 (Android version code 4) adds explicit Use as MAC / Use as Serial buttons on every barcode row. MAC selection is enabled only for a valid 12-hex value and normalizes it; this is a technician choice, never shape-only automatic classification. Confirm Fields validates optional MAC, requires at least one field, limits serial length, and displays the confirmed in-memory values. Edits and new scans reset confirmation. No records are saved. Detached alphabetic-only OCR values no longer auto-fill serials; barcode and manual alphabetic serials remain supported. Regression checks reject the nearby AKUVOX vendor word.

The supplied reference APK was inspected locally, without running it or contacting its services. It contains bundled ML Kit OCR/barcode assets and Expo components. Its Hermes bytecode is version 96; the installed compiler reads version 98, so its scanner/confirmation UI could not be verified from bytecode. A screen recording and original Akuvox photo were requested. No proprietary APK, code, assets, or inspection output is committed or reused in CableMint. No live integrations are involved in these milestone 1 changes.

The user subsequently supplied four work-label images: Omada EAP653, UNV camera box, TP-Link SG2005P-PD, and Akuvox. These show stacked barcodes above printed values on TP-Link/Omada, a serial-only UNV label with a separate retail barcode, and side-by-side anchors/barcodes on Akuvox. Version 1.0.3 prioritizes a uniquely owned printed row and matching nearby barcode above it over a different barcode below that anchor. Multiple printed owners of one barcode remain ambiguous. Tests use synthetic geometry approximating the visible photo positions; native ML Kit has not been run on these files here. Device-key QR and distant retail barcodes remain unassigned in these fixtures. Photos remain outside the repository.

Version 1.0.3 build succeeded in GitHub Actions run 36482994129 from commit 3ba84f6548450954693d177c44743201699faee8; APK artifact 10998186374. Downloaded APK SHA-256: `150aac800a0214753f45e9ae2000f18c7e632939c3d61efbb56e5cdc9f4650d9`. JavaScript bundle and bundled ML Kit barcode/OCR assets are present. A limited string inspection of the reference APK also found Confirm capture, MAC barcode selection, and retake wording; these are UI-string observations, not verified runtime behavior.

## Confirmation navigation and phone feedback — September 28, 2026

The user reports version 1.0.3 scanning works, sometimes after a second attempt; Choose Existing Photo appears more accurate than camera capture. This is qualitative field feedback, not a measured accuracy rate or proof that every supplied label passes. The user also reports Confirm Fields stays on the same screen. Version 1.0.4 (Android version code 5) replaces inline confirmation with a separate Scan Complete screen showing the confirmed MAC/serial. Scan Next Device clears the previous result and returns to the camera. Edit Fields preserves the values and returns to review for re-confirmation. Confirmation dismisses the keyboard and the new screen opens at the top. This remains milestone 1: in-memory confirmation only, no project save or backend changes. Camera consistency remains an unresolved field check.

The user also requested where to enter installation location. Version 1.0.4 adds an optional freeform Installation Location field (up to 240 characters) in technician review, displayed with the confirmed device values. Edit Fields preserves it; Scan Next Device and new image recognition clear it to prevent carrying the previous device's room into the next scan. It is transient prototype metadata, with no Supabase column mapping, project linkage, persistence, or sync. The full structured project/building/floor/unit workflow remains milestone 2.

Version 1.0.4 passed typecheck, parser checks, native compilation, and packaging in GitHub Actions run 36489054159 from commit 3dec911393e33ff87995acdf2ab9f4582b1ae168; artifact 11001386946. Downloaded APK SHA-256: `0407d6f2837c576d92a86e0964ec640df9be8998ca69e9cad4b93754f581ab45`. The standalone JavaScript bundle is present. New navigation and location behavior await phone validation. Production website, Supabase, Dodo, and Edge Functions are unchanged.

## Milestone 2 integration — September 29, 2026

The user authorized milestone 2 only. Version 1.1.0 adds Supabase email/password sign-in with the existing account, own-project selection, persistent batch Building/Floor/Area/Device Type/Manufacturer/Model, Unit/Room/Location with optional final-number increment, technician verification, online Save & Next, and Current Project Devices with confirmed delete. Serial-only devices are supported. Recognition geometry, conservative assignments, manual selection, camera/gallery processing, and flashlight labels are retained. Images remain temporary and are never uploaded. This supersedes milestone 1's transient location/completion flow: confirmed saves return to the camera with batch context retained.

Read-only live verification on September 28 confirmed current columns, lengths, RLS and constraints. `field_devices_identifier_required` requires at least one nonblank MAC or serial. Device insert/update requires row ownership and parent project ownership; read/delete requires row ownership. There is still no project-scoped identifier uniqueness constraint. On September 29, REST connectivity checks with the existing public client key confirmed anonymous project reads are denied (42501); no privileges were changed. Email/password Auth was enabled when checked. No authenticated production-like test rows were inserted.

The deployed website was read to verify the actual entitlement mapping: select `status` from `dodo_subscriptions`, filter customer email case-insensitively to the signed-in email and status to `active`/`trialing`, limit 1. The app consumes that existing state and fails closed on read errors. Subscription RLS ties customer email to JWT email. It does not invent product, expiry, or migration rules; Dodo production migration is separate. It rechecks session and entitlement before save/delete. This is client entitlement gating under existing ownership RLS, not a new server-side billing enforcement policy.

The mobile client uses the existing enabled public Supabase publishable key, which is intended for client bundles, and the user's access token. No service-role, Dodo secret, or webhook credential is used. Auth sessions are encrypted in Expo SecureStore, chunked for large sessions. Passwords are not persisted. AppState manages token refresh. Batch settings are stored locally with separate user/project keys; unsaved scans and retry IDs are memory-only. No offline queue or sync is implemented.

Before insertion, all current project device pages are checked for normalized MAC and case-insensitive trimmed serial duplicates independently. Ambiguous scanner values remain unassigned. Each save has a client-generated UUID; an uncertain response locks the fields and retries/reconciles the same ID instead of creating another record. Unit numbering advances only after acknowledged success. Duplicate checks can still race between simultaneous clients because the existing schema has no unique identifier constraint; no schema change was made. Closing the app during an uncertain save loses the in-memory attempt: inspect Current Project Devices before rescanning that device.

Local checks cover recognition, timeouts, temporary photo paths, serial-only/length validation, batch restoration, numbering, duplicate matching, owner/project filters, Pro failures, stale sessions, and uncertain-save reconciliation using a mocked service. These do not prove authenticated live RLS operations. Phone testing must cover real account sign-in/session restoration, active/inactive Pro state, project ownership, camera/gallery accuracy, verified save and serial-only save, duplicate rejection, Save & Next numbering, batch restoration after restart/project switch, list/delete, and connection failure/retry. Use a deliberately designated test project for save/delete validation. No website, table structure, RLS policy, billing table, Dodo setup, or Edge Function was modified. The separately approved table grants are recorded below.
### Confirmed backend permission blocker — September 29, 2026

A final read-only `has_table_privilege` check confirmed the authenticated role can SELECT field_projects and dodo_subscriptions, but cannot SELECT, INSERT, or DELETE field_devices. RLS ownership policies alone do not grant table access. Thus device listing, pre-save duplicate queries, verified insertion and deletion are blocked against the current backend. No permission change was made. A minimal proposed fix is granting only SELECT/INSERT/DELETE on public.field_devices to authenticated while retaining existing RLS; explicit user authorization is required because backend changes are prohibited in this milestone. Source implementation and automated mock tests are complete; functional live saving is not complete until this blocker is resolved and tested with an actual signed-in account. This supersedes any earlier implication that RLS inspection alone proved API write availability.
### Permission blocker resolved with explicit approval — September 29, 2026

The user approved only SELECT, INSERT and DELETE grants on field_devices. Applied migration `grant_authenticated_field_device_capture_access` containing exactly `GRANT SELECT, INSERT, DELETE ON TABLE public.field_devices TO authenticated;`. Follow-up read-only checks confirm those three authenticated privileges are now true, UPDATE remains false, anonymous SELECT remains false, RLS remains enabled, and the four ownership policies are unchanged. No device data was inserted/deleted for verification. The permission blocker above is resolved; actual-account phone validation is still required. No column/constraint, policy, billing table, Dodo configuration, production website or Edge Function was changed.
Milestone 2 APK 1.1.0 (Android version code 6) built successfully in GitHub Actions run 36632527078 from source commit 7c34303b520ebfaab0aafbf8789092acc64237bb; artifact 11064075957. TypeScript, parser/timeout/privacy, workflow/service and encrypted session storage checks passed in CI. Downloaded APK SHA-256: `26067e88b7ee00bf81df1b1df49ab76fed75a338699bb0ab0af8dfd24b2807d8`. Standalone JavaScript bundle and bundled ML Kit barcode/OCR assets are present. Prototype debug signing is retained; this is an internal test APK, not a store release. Actual-account sign-in, session restore, verified writes/deletes, Pro transitions and field scanning still need phone validation in a designated test project. Do not claim end-to-end live save validation from mocked tests or permission metadata.
## In-app project creation — September 29, 2026

The user authorized adding Create New Project to the existing Select Project screen. Version 1.1.1 (Android version code 7) adds a project/site name form, blank and 80-character validation, case-insensitive trimmed duplicate precheck among the user's own projects, useful unique-constraint/permission/network errors, and automatic list refresh plus opening the new project's Batch Setup. If refresh fails after a confirmed insert, the new project still opens with a refresh warning. Refresh Projects & Access and Sign Out are retained. Existing Pro gating and scanner behavior are unchanged.

Live read-only checks reconfirmed authenticated SELECT/INSERT privileges and enabled RLS on field_projects. The existing ALL ownership policy requires auth.uid() = user_id in USING and WITH CHECK. Existing constraints include name length 1–80 and UNIQUE(user_id, name). Inserts use only id, authenticated user_id and trimmed name through the existing public-key client/session, with no service-role key. A stable UUID permits retry after an uncertain response by checking the same owned row. Unsaved creation attempts remain memory-only; refresh projects after closing during an uncertain request. No backend grants, schema, RLS, billing/Dodo, website or Edge Function changes were made for this update.

TypeScript and regression checks passed locally, including blank/long names, duplicate prechecks and server conflicts, permission/network failures, owner filters, stale-session rejection and uncertain-create reconciliation. Live table metadata was verified read-only; actual-account project creation and automatic screen navigation require testing on Android. No production test project was inserted by the agent.
Version 1.1.1 native APK build succeeded in GitHub Actions run 36640421843 from source commit 5ab1a3ae42cfca575696deed651926c345c0770d; artifact 11066582617. CI typecheck, recognition/workflow/service/session-storage checks and Android compilation all passed. Downloaded APK SHA-256: `9bb3c6230de1f7bcc77c9878e47e96281dc4e53d60c188c4e7288c2e7d8c0e0a`. Standalone JavaScript bundle and 24 bundled ML Kit asset entries were inspected. Installation and actual-account project creation/navigation/error handling remain phone validation steps. This update made no Supabase schema/privilege/policy, Dodo, production website, or Edge Function changes.

## September 29, 2026 — native field workflow and scanner enhancement
Written user requirements supersede earlier offline deferral. Source is in device-capture/ on the existing prototype branch. See device-capture/FIELD_WORKFLOW_DECISIONS.md for implemented navigation/History, exact cloud errors, stable-ID durable upload queue, optional temporary installed photo, ML Kit geometry/gradual smart zoom and the outstanding permanent-photo/tasks/progress/uniqueness decisions. No new backend/schema, website, billing or Edge Function changes. Native build and actual phone validation are tracked separately; local checks do not prove a real authenticated insert.


## September 30, 2026 — verified internal Android builds
- Steps 1–4 build: version 1.2.0 / code 8, source f114f027dc40df0fb2f2fa0e88dbfd4d1d29c58a, GitHub run 36647777234, artifact 11068968574. APK SHA-256: b4bf2ae2043871c4e1fa99165993c3245abd3dfe6e78c299f0f632b52aff0342.
- Full field workflow build: version 1.2.1 / code 9, source 315899b8c98d289e2aa38141b5cf30fe6ff0b9ae, GitHub run 36780357498, artifact 11127616948. APK SHA-256: 400dcd4b4727525e33c682e6bd74f368ccdc5ec2d435b81c6f091759b9b0ef8c.
- CI install, TypeScript, recognition/workflow/service/session/queue/zoom regression checks, native prebuild and Android release compilation all succeeded. Final APK manifest confirms com.cableminttools.devicecapture.prototype, version 1.2.1, code 9. Standalone Hermes bundle contains the smart barcode event integration; 24 bundled ML Kit asset entries are present.
- Final APK is saved locally in device-capture/.artifacts/1.2.1/app-release.apk. Prototype/debug signing; not a store release.
- Live read-only Supabase check on September 30 confirmed device count 0, RLS enabled and authenticated SELECT/INSERT/DELETE privileges present. The agent did not make an authenticated test-device write. Phone validation of real saves/deletes, camera/pinch/zoom, Back, offline recovery and temporary-photo cleanup remains required.


## v1.2.2 reliability release — September 30, 2026

Scope is limited to sync feedback, functional camera zoom, and release packaging. The user's v1.2.1 field-test confirmation supplies current live integration evidence; this release keeps the existing authenticated save/History/delete service and backend contracts.

Sync button states are Sync Now, spinner + Syncing…, green Synced ✓ for 2.5 seconds, and red Sync Failed — Retry. Queue results count only records matching the server-returned attempt. Pending/uploading/failed counts and upload errors are visible; an empty queue says Everything is synced. Manual retry includes failed records, retains stable IDs, and joins the single upload worker. A stranded Uploading state after a local journal write failure is retried with its existing ID; it cannot be mistaken for an empty queue. Build 11 superseded build 10 following this final-review fix; binary inspection then rejected build 11 because it linked a precompiled camera.

The actual camera stack is expo-camera 57.0.5 / Android CameraX, with bundled ML Kit 17.3.0. The local cablemint-ocr module handles still-image recognition, not the live preview. v1.2.1 learned its zoom maximum exclusively through a custom barcode event, with a 1× fallback and unacknowledged Expo normalized zoom props. v1.2.2 adds two narrowly scoped Expo native view commands through the existing build plugin: getCableMintScannerState (actual ratio, min/max hardware limits, latest geometry and frame sequence) and setCableMintZoom (clamped CameraControl.setZoomRatio, resolved only when CameraX's future succeeds). The pinned Expo view adapter exposes these commands without changing capture/gallery/torch behavior. APK inspection uncovered the v1.2.1 root cause: Expo selected its precompiled expo-camera AAR ([📦] in Gradle logs), ignoring the source patches. The SDK documents opting out through package.json expo.autolinking.android.buildFromSource; this release requires ["expo-camera"] and verifies the command names in the APK DEX before uploading it. This removes the barcode-event dependency from manual zoom and delivers geometry through a bounded 200ms poll for automatic zoom. Controls display the acknowledged ratio and surface native failures.

Smart zoom selects the potential barcode nearest the scan-guide center, increases by 0.12× after three target observations with at least 650ms between steps, and caps at min(4×, hardware maximum). It stops on decode or any manual adjustment until the next capture/retake resets it. Manual buttons and pinch serialize/coalesce hardware zoom commands. Each camera session resets to 1×, clamped to the reported range. Development-only logs report current/requested ratios, barcode sizes, triggers and decode success, without identifiers.

Release standard: root RELEASES.md records each version/date/fixes/known issues. Expo config drives the visible Account version and generated native versionName; Android versionCode increments per testing/release build. scripts/package-android.cjs validates native output metadata against app.json, keeps app-release.apk for Gradle, and creates CableMint-Device-Capture-v<version>.apk without overwriting an existing copy. The workflow uploads the versioned copy.

TypeScript and regression checks passed locally. Actual source compilation and APK DEX verification are required; the successful earlier builds linked an unmodified precompiled camera and do not prove the new Kotlin code compiled. v1.2.2 phone testing remains. No Supabase schema, production website, Dodo configuration or deployed Edge Functions were changed.

## October 1, 2026 — v1.2.2 native compilation repair

GitHub Actions run 36789096585 (versionCode 12) correctly compiled expo-camera from source, exposing a Kotlin type-inference error in the mixed barcode geometry map at ExpoCameraView.kt:591. The plugin now uses explicit Map<String, Any> types for both the frame and per-barcode geometry. The next testing build increments versionCode to 13. This is a source compilation repair; actual APK and phone zoom remain unverified until their respective checks pass.

Build 13 (run 36922528269) passed TypeScript/regression checks but Kotlin still rejected the nested geometry-map expression, even with explicit map type arguments. Build 14 replaces nested mapOf/to expressions with typed mutable maps populated field by field. The payload shape and zoom algorithm are unchanged. versionCode increments to 14.

### Verified v1.2.2 delivery — October 1, 2026

Version 1.2.2 / Android versionCode 14 passed GitHub Actions run 36923897188 from source commit 988a50c8bde054f54b5bc16c5351bde35b742821. expo-camera:compileReleaseKotlin ran successfully from source. TypeScript, recognition, sync/queue and native-command controller regression checks, native release compilation, versioned packaging and APK verification all passed. Artifact 11194085141 was downloaded as device-capture/.artifacts/1.2.2/CableMint-Device-Capture-v1.2.2.apk (137677046 bytes). SHA-256 0175437a078745497973f2f325a1bc216e85147a5391f865fd8f5780269ac9c7 matches CI. Actual manifest confirms com.cableminttools.devicecapture.prototype, versionName 1.2.2 and versionCode 14; DEX contains getCableMintScannerState and setCableMintZoom; standalone JavaScript and 32 bundled ML Kit asset entries are present. Earlier precompiled-camera candidates are excluded from delivery; the rejected build 11 APK remains in its own build-11 folder. Physical-phone v1.2.2 zoom and sync feedback await user field testing. This internal APK retains prototype signing. No schema, website, Dodo or Edge Function changes.

## v1.2.3 scanner reliability — October 1, 2026

The user's v1.2.2 screen-recording findings confirm MAC barcode/ML Kit 0C110533D733 while the review/upload used OCR 00110533D733. The user confirms existing projects/navigation/cloud saves/History/delete/duplicates/camera-gallery/torch/manual zoom/reset work. This is current integration evidence; existing authenticated deviceService contracts are preserved and no cloud record is repaired automatically.

Recognition previously selected one strongest candidate but discarded disagreement evidence, while live geometry could not assign a still-photo field. analyzeScan now preserves raw decoded payloads, compares normalized MACs, records source-labelled conflicts, and retains printed-anchor/proximity ownership. A live/unassigned valid MAC differing from a printed MAC blocks OCR autofill without treating preview coordinates as image coordinates. Both MAC and serial conflicts require explicit resolution; Continue and save handlers guard unresolved/changed selections. Manual correction and explicit serial-only omission remain possible. Existing duplicate checks run unchanged on the final chosen values.

The empty-queue early return caused Sync Now to skip both visual activity and the server. Manual sync now always calls the existing authenticated paginated loadHistory service, including an empty queue, and caches server devices/check time without extending the Pro entitlement timestamp. All four queue-state counts refresh; the spinner remains visible at least 300ms, confirmed success for 3000ms. Green empty success reads Everything is synced — checked just now. Failed checks preserve the previous successful timestamp and show retry feedback. Manual sync holds the workspace operation guard to serialize with deletion/refresh. Automatic uploads retain their existing confirmed-attempt logic.

Camera remains Expo Camera 57.0.5 built from source / CameraX 1.6.0, bundled ML Kit barcode 17.3.0. The existing build plugin adds ZoomSuggestionOptions and defers scanner initialization until the bound camera reports its hardware limit. A callback exports the suggested ratio/sequence/age; it returns false because no synchronous zoom change occurs there. The JS controller gradually applies the suggestion through the proven setCableMintZoom CameraX command, accepting only actual acknowledgement. Potential bounding-box fallback remains. Guide-center preference, three observations, 650ms cooldown, 0.12× steps, min(4×,hardware) cap, manual latch, decode stop and capture reset remain. Expandable diagnostics work in the internal release APK; development logs report sizes, suggestions, triggers, requested/actual zoom and decode success without identifiers. An unchanged camera acknowledgement surfaces requested-but-not-applied failure.

References checked: https://developers.google.com/ml-kit/vision/barcode-scanning/android and https://developers.google.com/android/reference/com/google/mlkit/vision/barcode/ZoomSuggestionOptions.Builder. Supabase select documentation/changelog were reviewed; no SDK/backend changes are necessary. Versions align at 1.2.3; Android testing build code 15. Local and CI TypeScript and recognition/service/queue/session/zoom regressions passed. Native release build and APK verification passed; see verified delivery below. Physical distant-barcode optical testing is unavailable here and remains required; a barcode already decoded at 1× is correctly a stopped auto-zoom state, not evidence of failure.

### Verified v1.2.3 delivery — October 2, 2026

Source 11116c7e810ef99389a007e7ff55db0c83c2fb73 passed GitHub Actions run 36937982573 / job 110622622957 on October 1. The job compiled expo-camera from source (expo-camera:compileReleaseKotlin), assembled the release APK, validated versioned packaging and confirmed the native zoom commands and suggestion bridge in DEX. Artifact 11198574951 was downloaded on October 2 to C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.3\CableMint-Device-Capture-v1.2.3.apk without overwriting older versioned APKs. Independent local binary verification confirms filename, package com.cableminttools.devicecapture.prototype, versionName 1.2.3, versionCode 15, both zoom commands, ZoomSuggestionOptions/suggestedZoom/suggestionSequence, standalone JS bundle and 32 ML Kit asset entries. Size 137692474 bytes; SHA-256 b3828ef115e4f40b47b55126312bd333854ef798878509c3f11cfcddfafb5f31 matches CI.

Implemented and automatically tested: exact MAC/OCR mismatch and confusable characters with explicit conflict guards, serial-only/multiple barcode support, real-read empty-queue sync feedback logic, suggested/geometry zoom control and native acknowledgement failures. Physical-phone conflict interaction, online/offline zero-queue sync UI and genuinely distant undecodable-barcode auto-zoom remain unverified here. Manual zoom/pinch/reset and all user-confirmed service contracts are preserved, but must be included in the phone regression check. Existing cloud records were not modified; no production website, Supabase schema, Dodo or Edge Function changes. Prototype signing remains internal-only.

## v1.2.3 field correction and v1.2.4 native zoom — October 2, 2026

The user explicitly confirms automatic zoom never activated in v1.2.3; visible zoom was entirely manual. The supplied 31.79-second recording holds 1× with zero decoded barcodes; its diagnostics panel is collapsed, so it does not establish whether potential detection, requesting or application failed. This supersedes any suggestion that automatic zoom was field-validated. Manual zoom remains confirmed working.

ML Kit 17.3.0 potential detection and ZoomSuggestionOptions were already enabled. The old callback exported a suggestion and always returned false, with a later JS poll/frame stability/age/size gate controlling the lens. v1.2.4/code16 replaces that fragile automatic handoff with a pure Kotlin controller beside ML Kit. Both native automatic requests and the preserved manual command call one applyCableMintZoom CameraX CameraControl.setZoomRatio operation and read actual zoom after its future settles. JS polls only display state; automatic movement no longer depends on React frame delivery. The ML Kit callback now returns whether a real camera request was submitted, following the documented asynchronous CameraControl pattern; the subsequent native acknowledgement independently reports success/failure.

The native fallback considers thin 1D codes as well as small bounding boxes, prefers the guide center, waits three stable geometry observations, and ramps by 0.12× with 650ms cooldown and min(4×,hardware) cap. Native decode, manual buttons/pinch and photo stop suppress requests. Initialization acknowledges 1× before enabling automatic mode; installed-photo mode does not enable it. Empty payloads are not classified as successful decodes. Added release diagnostics/logs expose detection, request, application, frame age/count, suggestions and suppression reason without identifiers. Native Kotlin unit tests exercise the delivered controller with simulated camera acknowledgement and no manual interaction; real optical/camera testing is still required.

Resolved conflicts retain their source/audit choices but no longer show the saving-blocked text. Identification, sync, database, website, billing and Edge Functions are unchanged. Local TypeScript/regression checks and Android prebuild passed; native CI release and APK verification are pending.

Build 16 passed native Kotlin controller tests and source compilation. Final testing build code increments to 17 for a UI guard: automatic-request cancellation after a deliberate manual override/photo stop is logged but is not surfaced as an automatic camera failure. Active automatic application failures still surface. Final release verification pending.

### Verified v1.2.4 delivery — October 2, 2026

Final source dae185c3449ac5fc76400f89dcbcaf663a1fb85c passed GitHub Actions run 37084671054 / job 111092362050. The logs confirm expo-camera:compileReleaseKotlin, compileReleaseUnitTestKotlin and testReleaseUnitTest executed successfully (not NO-SOURCE). Six Kotlin controller tests cover automatic requests without manual input using simulated camera acknowledgement. Release assembly and strengthened binary gates passed. Build 16 also passed run 37084285755; the final delivered candidate is versionCode 17 with the manual-cancellation UI guard.

Artifact 11259718413 was downloaded to C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.4\CableMint-Device-Capture-v1.2.4.apk. Independent local binary verification confirms filename, package com.cableminttools.devicecapture.prototype, versionName 1.2.4 / versionCode 17, getCableMintScannerState/setCableMintZoom/setCableMintAutoZoom/pauseCableMintAutoZoom, ML Kit suggestions, CableMintAutoZoom and applyCableMintZoom in DEX, standalone JS and 32 bundled ML Kit asset entries. Size 137693070; SHA256 44f262bc6dfe6781f614550661fa58d49e27b1499e45baec29396ff48a26117b matches CI. The older v1.2.3 APK is intact.

A physical distant undecodable barcode test, without manual input, remains required. This workspace has no attached Android camera; unit fixtures and the prior recording do not prove optical detection or hardware movement for the new build. Keep the diagnostic panel expanded during that test; also check manual buttons/pinch, reset, decode stop and resolved-conflict wording. No production integration changes or automatic cloud-record edits.

## v1.2.4 field failure and v1.2.5 investigation — October 3, 2026

The supplied 94.94-second recording and comparison confirm 1× throughout, unrelated UPC-E values and a device-key QR, and intervals with zero distinct decoded results. Native potential/request diagnostics are collapsed. The verified source bug is CableMintAutoZoom.frame stopping permanently on ANY decoded payload; JS also announced a stop for any decode. Clear codes did not re-arm native automatic mode. ML Kit 17.3.0 is already configured for potentials/suggestions in the LIVE analyzer. Its documented built-in callback requires no successful decode, so unrelated readable codes can suppress suggestions. Zero decoded results do not prove zero potential detections; those intervals remain optically unexplained.

v1.2.5 uses guide-centered stable potential geometry independently of unrelated decodes, with corner-point fallback, gradual steps/cooldown/hardware cap, and no blind zoom without fresh potential evidence. Relevance is a zoom-only candidate heuristic; all raw values, printed-label association and conflict/save checks are unchanged. The shared production CameraControl operation reads the captured camera's actual ratio after its future and rejects stale generation/session callbacks. Native diagnostics expose all requested counts/status/ratios plus camera generations and capture resets. Stable RN settings and unchanged scanner-enabled guards avoid redundant rebinds.

See device-capture/SCANNER_V1.2.5_FINDINGS.md for investigation and the no-manual-input field protocol. Twelve native policy/CameraControl tests are prepared; the production API operation uses a camera test double, not physical hardware. Existing TypeScript/identification/sync/queue/service/manual zoom checks and clean-source/idempotent native patch validation pass locally. Version 1.2.5 / testing code18 was prepared only after implementation/diagnostics readiness. Native compilation and delivery passed (see verified delivery below); do not claim optical auto-zoom fixed until phone diagnostics show independent requests and actual movement. Existing working service integrations are field-confirmed and untouched; no website, schema, Dodo, Edge Function or cloud-record changes.

### Verified v1.2.5 internal delivery — October 3, 2026

Source c0028323ef32d86bb9ec683c254f60f596eb833b passed GitHub Actions run 37166331749 / job 111329867593. The logs show expo-camera:compileReleaseKotlin, compileReleaseUnitTestKotlin and testReleaseUnitTest executed from source. Twelve policy/production CameraControl tests passed; their explicit XML evidence gate logged independent setZoomRatio requests 1.12× and 1.24× and separate actual acknowledgements without manual input, using a camera test double. Existing TypeScript/recognition/conflict/service/sync/queue/manual-zoom checks, fresh native prebuild, release assembly, versioned packaging and strengthened DEX gates passed.

Artifact 11289174856 was downloaded to C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.2.5\CableMint-Device-Capture-v1.2.5.apk. Independent binary verification confirms package com.cableminttools.devicecapture.prototype, versionName 1.2.5 / versionCode 18, all four native commands, ML Kit suggestions, shared CableMintZoomOperation, automatic request/relevance/generation diagnostics, standalone JS and 32 ML Kit assets. Size 137710826 bytes; SHA256 707b7773e41473be6d8547845c75da2d302b9e8bacea352fb636a5acd0adfbfa matches CI. Older versioned APKs remain intact. Physical distant-barcode optical detection and actual hardware movement are still unverified; this release is a diagnostic/internal test candidate, not a declaration that field auto-zoom is fixed. No production integration changes.


## v1.3.0 UI/workflow decisions — October 4, 2026

Source: user confirms v1.2.5 field stability and requests a complete native UI/UX overhaul, with the supplied locked CableMint logo/banner as the color reference. Shared theme uses charcoal blue, CableMint green, white and cool gray; logo is reused byte-for-byte. Reference work-app screenshots contribute workflow inspiration only; no proprietary code, assets or exact layouts are used.

- Shared components centralize headers, buttons/fields, original line icons, project/type cards, status badges, compact History rows, step headers, advanced panels, confirmation and persistent bottom tabs. Safe-area insets keep content and tabs clear of Android system bars.
- Projects use server/cache records plus outstanding local records without duplicate counting; project overview shows actual counts, recent captures, existing batch context and capture/History actions. No invented progress denominator or task data.
- An open scanner remains mounted in React when using other tabs, retaining selected identifiers, conflict resolution and pending save. Its camera view is unmounted while hidden, so camera/torch and zoom polling stop; the existing initialization restores zoom when the preview resumes. Project changes require explicit discard confirmation. Back uses existing capture guards; closing capture removes stale scan routes.
- Verification shows selected MAC/serial with Edit first, sourced conflicts require explicit choice, and resolved warnings become a compact positive state. Barcode/OCR/confidence information is behind Advanced scan details. All native diagnostics are hidden behind Developer · scanner diagnostics by default. The native scan-guide geometry remains exactly 8–92% horizontally and 27–73% vertically.
- Location carries forward the existing per-project building/floor/unit batch. Existing auto-advance and temporary installed-photo settings remain editable. Photos are not persisted/uploaded. Save & Capture Next publishes locally through the unchanged queue; confirmation reads that exact queue item's state and only says Saved & synced after server acknowledgement.
- History merges server and local records, uses compact sourced status rows and search/filter controls. MAC searches accept compact, colon, dash and dotted forms. Record details retain cloud deletion; errors show actionable copy and optional technical detail. Sync Now's authenticated server check, three-second confirmation, counts and retries are unchanged.
- Account shows email, existing entitlement check, sync access, config-derived version and Sign Out. Tasks remains an honest empty state. No production website, schema, billing, Edge Function or native scanner policy changes.
- Development-only browser preview compiles the actual screen/components with synthetic native/network adapters. It is not imported by App.tsx and is not evidence of physical optics or live cloud connectivity. See device-capture/UI_V1.3.0.md for regression evidence and remaining phone checks.

Read-only live check October 4, 2026 reconfirmed the public.field_projects / public.field_devices column contract above; the v1.3.0 UI uses the same existing fields. No live records or infrastructure were changed.

### Verified v1.3.0 internal delivery — October 4, 2026

Source aff4a87bdb385600a8e78449228d328eff10b941 passed [GitHub Actions run 37209055014](https://github.com/JmanX/cableminttools-site/actions/runs/37209055014) / job 111456289183. TypeScript, all recognition/service/auth/queue/sync/manual zoom regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly and binary gates passed. Native tests logged independent 1.12×/1.24× requests and actual acknowledgements with a camera test double; the physical Android smoke checklist remains pending.

Downloaded artifact 11305744745 independently confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.0 / versionCode 19, native zoom commands/suggestions, shared CameraControl operation, SVG/safe-area packages, redesigned UI and standalone JS with 32 ML Kit assets. Synthetic development-preview identifiers/labels are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.0\CableMint-Device-Capture-v1.3.0.apk`

Size: 145,838,356 bytes. SHA-256: `1ad8023a0af43b749358b3ae35ccef954845873a83198041fbe901cb343c702f` (matches CI). Older versioned APKs are preserved.


## v1.3.1 Capture Next decisions — October 4, 2026

Save & Capture Next now returns directly to Device Type in the same project, after the unchanged queue confirms a durable local save. The type screen displays that exact saved record's Pending/Syncing/Failed or server-confirmed Synced state; returning to Type does not claim the upload succeeded. A failed local enqueue leaves the original capture available for retry.

- Completed MAC/serial, raw barcode/OCR candidates, conflict resolution, verification, photos, errors, diagnostics, pending save attempt and camera state are cleared using the existing reset and a fresh scanner mount. Device Type, Manufacturer and Model clear. Native initialization resets zoom to 1× and re-arms the existing automatic scanner.
- Building and Floor / Area persist per project. Unit / Room / Location clears by default. The existing explicit auto-advance option carries only a newly incremented numeric location; unincrementable/non-numeric locations clear.
- The next type selection opens Scan directly. Completion removes stale scan routes and clears the parent's scanner-busy state; Back from Device Type still exits to the project overview. Existing tabs/capture-resume behavior is retained.
- Tests cover type routing/Back, retained context, clear equipment fields, default/explicit advance/overflow locations, immutable completed drafts, serial-only second capture, independent identifiers and two acknowledged History records through the real durable queue with a synthetic server.
- Actual production screens passed a browser preview with synthetic adapters: WAP gallery conflict → explicit barcode choice → local save/confirmed upload → Device Type → Intercom at 1× with empty diagnostics → serial-only scan → retained Building/Floor and empty Room → second save → Device Type → Back/History with both correct records.
- v1.3.0 visual design, native scanner/automatic/manual/pinch zoom, recognition, duplicate checks, authenticated services and synchronization are unchanged. The October 4 read-only integration contract and user-confirmed working v1.3.0 behavior remain applicable. No website/schema/Dodo/Edge Function/cloud-record modifications.

See device-capture/CAPTURE_NEXT_V1.3.1.md for regression scope and phone follow-up. Native compilation and versioned delivery passed as recorded below.

### Verified v1.3.1 internal delivery — October 4, 2026

Source 117264a1c943c77d1bffd8cb4f5d970d276cf404 passed [GitHub Actions run 37227558977](https://github.com/JmanX/cableminttools-site/actions/runs/37227558977) / job 111510256399. TypeScript and all core/new Capture Next regressions, fresh Android generation, twelve native policy/CameraControl tests, native release assembly, packaging and binary gates passed. Existing native tests independently requested/acknowledged 1.12× and 1.24× with a camera test double; this is not a physical optics test.

Artifact 11312902152 downloaded without replacing older versioned APKs. Independent local inspection confirms package com.cableminttools.devicecapture.prototype, versionName 1.3.1 / versionCode 20, all native zoom commands/suggestions, shared camera operation, standalone JavaScript and 32 ML Kit assets. New room-reset copy is included; synthetic preview/test identifiers are absent from the production bundle.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.3.1\CableMint-Device-Capture-v1.3.1.apk`

Size: 145,839,372 bytes. SHA-256: `770f57859e76b615e5dfa0e3fa18f2305eef03d713095507cb6bb9225210d1ba` (matches CI). Older APKs preserved.

The user subsequently confirmed v1.3.1 is working properly and designated it the stable version on October 4, 2026. This is user field confirmation, distinct from the automated/synthetic test evidence above. Future app changes should start from this delivered build and preserve its working behavior. No production integrations changed.


### Stable baseline acceptance — October 4, 2026

The user stated: “this is working properly, now this the stable version.” Current baseline: CableMint Device Capture v1.3.1, Android versionCode 20, built source 117264a1c943c77d1bffd8cb4f5d970d276cf404. Keep the existing versioned APK and use its working capture/scanner/sync/UI behavior for future regressions. This acceptance changes documentation only; it does not create a new release/build or modify application behavior.


## v1.4.0 Project Dashboard and private Gap evidence — October 4, 2026

The user explicitly authorized field_gaps, project_files and minimal field_gap_deletions retry tombstones plus the PRIVATE project-files bucket and required owner/project RLS. Four CLI-generated additive migrations are applied to kgbrhdjbeosljpwghxte. Table ownership policies (10), Storage policies (4), identity/path/completion invoker helpers (4), expected-photo count and staged-deletion guards are verified live. Existing field_devices column fingerprint remains 61d6ac3a3bc49e50ff5c80aa4509ff0c; existing website/billing/functions/cloud records unchanged. Live owner/other/anon transactional RLS probes pass and roll back, including safe cleanup and no deleted-Gap resurrection. No real Storage-byte upload test was performed.

New native Gap flow has real project modules, 1–3 durable compressed JPEG photos, stable idempotent UUID/path queues, private short-lived photo access, complete upload acknowledgement, status resolution/reopen, and retryable confirmed deletion. Scanner/device recognition/native camera policy and device queue/service are unchanged. Optional calculation counts use authenticated reads of the existing table only. Foreground upload coordination extends Sync & Uploads and Account storage counts. Never automatically retain/upload scanner label photos.

Version 1.4.0/code22 is the verified internal candidate; local/CI TypeScript/full existing/new regressions, twelve native tests, synthetic screen QA, native release compilation and independent APK inspection pass. Field acceptance remains pending. See device-capture/PROJECT_GAPS_V1.4.0.md for exact schema/policy names, changed files, deletion behavior, privacy and physical-device checklist. v1.3.1 remains user-confirmed stable until acceptance.

### Verified v1.4.0 internal delivery — October 5, 2026

Source 15a64ffb44adea0d8404a9ce833ee56c3d9635a5 passed [GitHub Actions run 37247593583](https://github.com/JmanX/cableminttools-site/actions/runs/37247593583) / job 111568448885. TypeScript and all existing/new regressions, fresh Android generation, twelve native automatic/manual zoom policy and CameraControl tests, native release assembly, packaging and binary gates passed. Independent native requests acknowledged 1.12× and 1.24× with a camera test double, not physical optics.

Artifact 11320125290 was downloaded and independently verified on October 5, 2026. Actual manifest: package com.cableminttools.devicecapture.prototype, versionName 1.4.0 / versionCode 22. All native zoom commands/suggestions, standalone JavaScript, 32 ML Kit assets and the native Expo ImageManipulator module are present. The Gap workflow/table/bucket strings are in the release bundle; synthetic preview identifiers/photos are absent.

Size: 145,943,480 bytes. SHA-256: `24ea6de116793137a7f549796143f3745b025c6fef34a6f3742c6797d307b032` (matches CI). Older APKs preserved. Independent binary evidence is saved beside the APK as apk-verification.json and native-ci-evidence.txt.

Delivery: `C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.4.0\CableMint-Device-Capture-v1.4.0.apk`

The APK is ready for physical Android testing. Real camera/rotated gallery compression, authenticated private Storage-byte uploads, offline saved-Gap restart/reconnection, cross-phone cleanup/account isolation and the full stable capture checklist remain unverified on this new build. Automated/synthetic and live transactional RLS results do not replace these checks. See device-capture/PROJECT_GAPS_V1.4.0.md for the full acceptance checklist. v1.3.1 remains user-confirmed stable.

## v1.4.1 Gap evidence hotfix — October 6, 2026

Real v1.4.0 field testing found a confirmed private Storage AccessDenied failure after field_gaps had already synced. Live SELECT/UPDATE/DELETE policies bound unqualified name inside field_projects subqueries to the project title. Applied 20261006213127_gap_storage_rls_hotfix.sql explicitly uses storage.objects.name in all four policies. A direct live regex probe found one backslash and successful UUID.jpg matching; the migration explicitly retains  everywhere. Do not misreport JSON display escaping as proof of a bad stored regex.

Private bucket, authenticated project/Gap ownership, stable UUID paths, row locking and deletion markers remain. No new table/schema/billing/site/Edge Function changes. Rollback-only tests on actual storage.objects INSERT/SELECT/UPDATE/upsert plus policy-expression DELETE checks passed; no trigger bypass or permanent fixture writes. Security/performance advisors ran and existing unrelated findings are documented in device-capture/GAP_PHOTO_SYNC_V1.4.1.md.

The user confirmed on the existing v1.4.0 installation that the retained failed photo uploads and appears after Retry Gap & Photos, without Gap recreation. Read-only C1 verification found one file metadata record/unique ID/path, one matching current Storage object and matching size.

App v1.4.1/code23 persists Gap record acknowledgement separately from evidence state, counts records/photos independently and isolates project badges. Permanent permission/RLS failures require manual retry; transient network/timeout/5xx retain backoff. Targeted retries skip confirmed rows/photos and recover existing bytes/metadata acknowledgements without new IDs. Legacy v1 journal/local photos remain compatible. Native scanner, recognition, device queue/service and capture workflow unchanged.

Local/CI full regressions, twelve native camera tests, release compilation and independent APK verification pass. New v1.4.1 physical status/count/retry acceptance remains pending. v1.3.1 remains the last explicitly designated stable baseline.

### Verified v1.4.1 internal delivery — October 6, 2026

Source 3c98c1bb319c8481320af3f3ecbddd2d999119d4 passed [GitHub Actions run 37535636205](https://github.com/JmanX/cableminttools-site/actions/runs/37535636205), job 112515701967, on October 6, 2026. Fresh dependency installation, TypeScript/full existing and hotfix regressions, Android generation, twelve native camera/automatic/manual zoom tests, release assembly, versioned packaging and binary gates passed. Native tests acknowledged independent 1.12× / 1.24× requests with a test-double camera, not physical optics.

Artifact 11446274323 was downloaded and independently verified. ZIP SHA-256 matches GitHub's digest. Actual manifest: package com.cableminttools.devicecapture.prototype, versionName 1.4.1 / versionCode 23. All native zoom commands/suggestion/controller fields, standalone JavaScript, 32 ML Kit model entries and native Expo ImageManipulator are present. The full compiled Gap synced · Photo upload failed string uses UTF-16 and is verified, alongside the retained journal key and new retry reconciliation/permission feedback. Test-only synthetic fixtures are absent from the bundle.

APK size: 145,950,036 bytes. SHA-256: 58539c302515f3c9978b8b35a56292e0b431da6fcbcdf034f3951e54c043bb07 (matches CI).

Exact delivery: C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.4.1\CableMint-Device-Capture-v1.4.1.apk

Older versioned APKs are preserved. Local evidence beside this APK: apk-verification.json, hotfix-bundle-verification.json, native-ci-evidence.txt and post-migration-advisors.json. New v1.4.1 physical status/count/retry checks remain pending; the real retained-photo recovery on v1.4.0 is already user-confirmed.
