# CableMint Device Capture: technical context

**Status:** planning handoff for an Android-first native prototype. Last checked September 27, 2026. Use this file as the source of truth for the Device Capture build. Recheck live services before implementing against them; the database snapshot below is read-only evidence, not a migration.

## Sources and precedence

- The open ChatGPT conversation [“Check Etsy Traffic”](https://chatgpt.com/g/g-p-6a933f65f48c8191bda776ab70aedca3/c/6aaefb8f-a950-83e9-9b83-ce4f04bcec7d) contains the product history and decisions. Later decisions in that conversation supersede earlier experiments.
- The live Supabase project `kgbrhdjbeosljpwghxte` was inspected read-only on September 27, 2026 for public table columns, RLS policies, and Edge Function names. Those observations take precedence over older chat claims about the *current* schema.
- `CABLEMINT_CHANNEL.md` governs CableMint video production and locked brand assets. Device Capture is an app, but it should still use the established CableMint Tools identity and keep JayroVibe separate.
- This local `CableMint` folder is currently **not a Git checkout** (`git rev-parse` reports no `.git`). The file is saved here; publishing it to a GitHub repository requires locating or initializing the intended checkout separately.
- Never copy keys, passwords, webhook secrets, user data, or contents of `Supabase.txt` into app code, Git, documentation, logs, or client bundles. Existing secrets must be rotated if their exposure is suspected.

## Product boundary

CableMint Tools serves low-voltage and IT infrastructure technicians. The existing **CableMint Field Tools** website/PWA at `https://cableminttools.com` provides field calculators, cloud projects and calculation history, branded PDF project reports, billing, and the current Device Capture interface. The native app is a focused companion front end for reliable field device capture, using the **same Supabase Auth accounts, projects, device records, and Dodo Pro entitlement**. Do not rebuild or change the production website for this prototype.

The website/PWA is already usable, and its project PDF can report saved calculations. The conversation describes later expansion of closeout reports to devices, notes, and punch items; that is future web work, not part of the first native milestone. Native billing/checkout is also outside the first app scope. The app should consume existing entitlement state rather than process payments or hold Dodo secrets.

## Current Supabase architecture (live read-only snapshot)

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

Use EAS configuration for an internal Android build. The user does not need to write code or install Android Studio just to test an EAS-built APK. Expo account authorization and installing/testing the APK on a real Android phone are user/device steps. Do not assume an Expo connection or account session is available to Codex. Document exact build commands once the project and package versions are chosen.

## Build constraints and unresolved checks

- Do **not** modify the production website, deployed Edge Functions, Dodo setup, or Supabase schema for this handoff or the scanner prototype. If a later requirement truly needs such a change, explain the specific gap, migration/rollout, and effect on existing users before making it.
- Verify the current website's actual client mapping and Pro entitlement query before implementing mobile access; the conversation reports behavior, while this file's live check verified tables/policies/function existence, not deployed source code.
- Verify `field_devices` column nullability, length checks, and RLS with an authenticated non-production/test account before the first write. Do not test by inserting production-like records into a user's real project without an explicit test plan.
- Decide how to handle project-scoped duplicate queries, serial-only captures, verification state, and retry safety in code. The current schema permits an empty `mac_address`; it does not itself enforce MAC/serial uniqueness.
- Select and test an actual Expo-compatible native ML Kit integration. “Expo Camera barcode scanning” and “native ML Kit OCR” are distinct capabilities; confirm both in an Android development build.
- Avoid shipping real device-label photos or identifiable equipment data in the repository. Use consented/redacted test assets or on-device test cases.
- This context file is the planning baseline. Update it when implementation evidence or later user decisions supersede a statement, noting the date and source.
