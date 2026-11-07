# Project Dashboard and private Gap evidence — v1.4.0

Release date: October 5, 2026 (America/New_York). Expo/package version 1.4.0; Android versionName 1.4.0 and versionCode 22. Internal candidate from user-confirmed stable v1.3.1/code20. Field acceptance of this new workflow is pending.

## Scope and preserved baseline

Project selection opens a dashboard with actual device/open-Gap counts, recent captures, current batch context and capture/History access. Project Report is explicitly coming soon. Saved Calculations uses a paginated, authenticated read of the existing field_project_calculations table; it has its own last-check timestamp and no website code dependency.

The existing DeviceScanner, recognition, cameraZoom, smartZoom, Expo native scanner plugin/modules, deviceService and device capture journal are unchanged. Capture Next still returns to device-type selection, retains project/Building/Floor, and clears the completed device identity and unsafe room context. Temporary scanner/installed-device photos do not enter Gap Storage.

## Backend additions applied to kgbrhdjbeosljpwghxte

Only the explicitly authorized Gap/file additions were applied. Existing field_devices columns retain fingerprint 61d6ac3a3bc49e50ff5c80aa4509ff0c. No website, Dodo, payment/Edge Functions or existing cloud records were modified.

Four CLI-generated migrations are in supabase/migrations:

- 20261004203657_project_gaps_private_evidence.sql
- 20261004204049_gap_evidence_completion_guards.sql
- 20261004204654_gap_deletion_retry_tombstones.sql
- 20261005001313_gap_cleanup_policy_guard.sql

### Tables and policies

| Table | Purpose | Authenticated policies |
| --- | --- | --- |
| field_gaps | UUID issue, own user/project, Building/Floor/Location, category/description, Open/Resolved, timestamps | gap_owner_select, gap_owner_insert, gap_owner_update, gap_owner_delete |
| project_files | Generic UUID file metadata, own project, entity type/id, private storage path, name/MIME/size/time | file_owner_select, file_owner_insert, file_owner_update, file_owner_delete |
| field_gap_deletions | Minimal permanent retry tombstone (user/project/gap/time) prevents resurrection by another offline phone or a lost delete response | gap_deletion_owner_select, gap_deletion_owner_insert |

All tables have RLS enabled. Policies require the authenticated user AND ownership of the existing parent project; anonymous callers have no table privileges. Deletion markers cannot be updated/deleted by the app. Project foreign keys on Gaps/files intentionally prevent project deletion while evidence remains, avoiding orphaned Storage files. Delete the project's Gaps first. Marker project FK cascades only after that cleanup.

field_gaps includes photo_count (1–3) so another phone cannot call a partially uploaded Gap Synced, and deletion_requested_at for staged safe cleanup. Its identity/ownership/creation time/photo count are immutable. Status/resolved timestamp must agree.

project_files has the requested generic entity types gap/device/drawing/report. v1.4.0 writes are limited to Gap evidence; future entity writes need explicitly scoped policy/validation changes. JPEG size guard is 10 MiB per compressed object, not a customer storage quota.

### Private bucket and Storage policies

Bucket **project-files** is **private (public=false)**, accepts image/jpeg, and has a 10 MiB object guard. No public URLs are used. Canonical key:

`{authenticated_user_uuid}/{owned_project_uuid}/gaps/{gap_uuid}/{file_uuid}.jpg`

Four authenticated storage.objects policies:
project_files_storage_select, project_files_storage_insert, project_files_storage_update, project_files_storage_delete.

Read/delete require the exact canonical path and an owned Gap/project. Writes additionally require that the Gap is not deleting and has no deletion marker. Parent row locks serialize photo writes against staged deletion. The generic metadata trigger limits stored Gap photos to the declared count.

Four new helper/trigger functions use SECURITY INVOKER with empty search_path and revoked PUBLIC execute:
cablemint_gap_identity, cablemint_file_identity, cablemint_gap_storage_write, cablemint_gap_cleanup_complete. No SECURITY DEFINER bypass is added. The runtime cleanup helper avoids circular Gap DELETE/Storage SELECT policy expansion while keeping caller RLS.

Photos are fetched using an authenticated, 60-second signed URL held only in component memory. URLs are refreshed before an expanded view or through Retry Photo; they are not persisted in the journal or logged. Storage uploads/removals use the official Storage client API, never SQL object deletion. The mobile bundle uses only the existing publishable client config and current user's session.

## Workflow and offline behavior

Location → Category → Description → 1–3 Photos → Save. Camera/gallery evidence gets decoded-orientation dimensions, max long edge 1800 px (no upscaling), JPEG quality .8, then is copied to durable app documents before queuing:

`gap-evidence/{user_uuid}/{gap_uuid}/{file_uuid}.jpg`

Original gallery photos remain untouched. Own compressed cache files are cleaned up. Draft thumbnails can be removed; drafts survive tab changes and require confirmation before project-switch discard. Record Another Gap remembers Building/Floor but clears Unit/Room, category, description and photos.

A user-scoped AsyncStorage Gap journal uses the existing durable queue/sync architecture alongside the unchanged device journal. Stable client UUIDs and object paths make Gap upserts, photo upserts and metadata retries idempotent. Restarted uploading items return to pending. Journal writes complete before UI publication.

Upload order: confirm owned project → Gap upsert/exact acknowledgement → each Storage upload/path/size acknowledgement → exact project_files acknowledgement → Gap Synced only after every expected photo confirms. Partial remote evidence remains Pending. Failure preserves local files and exposes Retry, counts and actionable messages. Foreground single worker/backoff and explicit retry coordinate both journals; manual Sync Now always performs authenticated server reads even with no local uploads.

Resolve/Reopen only changes status and preserves evidence. Delete is confirmed and journalled locally, then records a permanent server marker, marks the Gap deleting, removes all listed Storage objects (including upload-before-metadata orphans), verifies empty Storage, removes/verifies metadata, deletes/verifies the Gap, and finally removes local evidence. Any failure retains a retryable cleanup job. A stale offline client cannot recreate a deleted Gap.

Account storage used sums confirmed project_files.file_size and shows its last check. Sync counts include record and photo operations, not just devices.

## Files changed

New app files: src/GapWorkspace.tsx, gapWorkflow.ts, gapQueue.ts, gapService.ts, gapEvidence.ts, gapPresentation.ts.
Integration: src/FieldWorkspace.tsx and historyModel.ts.
Version/dependency: app.json, package.json, package-lock.json (SDK-matched expo-image-manipulator ~57.0.20).
Tests: src/gapQueue.test.ts, scripts/test-gap-service.cjs, scripts/test-recognition.cjs, supabase/tests/gap_evidence_rls.sql.
Synthetic UI QA only: scripts/ui-preview.cjs and scripts/ui-preview/{entry,service,gaps}.tsx. These adapters/photos/test identifiers are excluded from the production bundle.
Release/context documentation: root RELEASES.md, CABLEMINT_CONTEXT.md and this file.

## Verified tests and limits

- Local TypeScript and complete existing recognition/history/duplicate/device-service/auth/session/device-journal/sync/manual-zoom/Capture Next regressions pass.
- New journal tests pass: offline restart, interrupted uploads, stable paths/no duplicates after lost acknowledgements, full photo confirmation, failed evidence retention, single worker, disk failure, ownership, concurrent status revision, resolve/reopen, deletion retries and cross-phone deletion markers.
- Real Gap service with synthetic SDK transport passes: authenticated project preflight, ArrayBuffer JPEG/upsert, path/size/metadata acknowledgements, private 60-second signed URL API, cleanup failure retention, lost-delete-response retries, deletion rejection and paginated ownership filters.
- Live transactional SQL RLS tests under owner/other/anonymous roles pass, and are rolled back. Covered owned Gap/file writes, hidden cross-user reads/updates/deletes, cross-project/path denial, photo limit, immutable identity, status preserving evidence, marker-required cleanup, incomplete-cleanup delete refusal, deletion resurrection denial and anonymous rejection. No customer records or real Storage objects were changed by fixtures.
- Live catalog confirms private bucket, ten table policies, four Storage policies, four invoker functions and unchanged field_devices contract. Security advisors show no finding on new objects.
- Actual app screens exercised at 360/390 widths with synthetic transports: dashboard real-data wiring, empty Gap list, step guards, three-photo limit/removal, two-photo confirmation, resolved filtering/reopen, next-Gap context reset, retained draft across History/Back, offline failure retention, retry spinner/green zero-queue server-check feedback, combined counts, deletion confirmation/cleanup and dashboard count.
- Existing native automatic/manual zoom tests run in Android CI, with simulated camera acknowledgements rather than physical optics.

### Required physical-device acceptance

Use the new APK with the existing account and a disposable owned project:
1. Sign in, create/select/switch projects; ensure dashboard/History/Back/remaining capture-next flows are intact.
2. Real camera/gallery label scan, distant undecodable auto-zoom without touching zoom, manual/pinch/reset, torch, MAC conflict selection, serial-only, duplicate warning, device save/website visibility, History and synchronized device deletion.
3. Gap camera and gallery selection, rotated/high-resolution images (verify 1800 px/quality/detail), 1–3 thumbnails/remove/full-size private viewer, keyboard/safe-area behavior.
4. Airplane mode Gap save; terminate/restart app after **Save Gap**; verify durable photos/journal, reconnect and retry to one Gap/one object per photo. Check confirmed metadata/size and storage-used count.
5. Resolve/reopen retaining photos, confirmed online/offline deletion, loss of connection during object/metadata cleanup, retry after lost response. Second phone should not resurrect deleted Gap.
6. Different authenticated account must not see/open the Gap/photos; signed URL expiry and reconnect/Retry Photo.

Synthetic SDK/UI tests and transactional RLS tests are not physical camera or real authenticated Storage-byte upload tests. Foreground-only sync remains: keep CableMint open for uploads. Unsaved drafts are memory-only; save the Gap before terminating the app. Synced original-phone evidence is retained locally for offline viewing and removed on Gap deletion; there is no eviction/quota implementation. Projects with remaining evidence must be cleaned up through Gap deletion before deleting the project. Report remains coming soon. Internal prototype signing remains.

## Artifact

`C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.4.0\CableMint-Device-Capture-v1.4.0.apk`

Native compilation, twelve native tests and independent binary verification passed. Delivered APK: versionName 1.4.0 / versionCode 22, 145,943,480 bytes; SHA-256 24ea6de116793137a7f549796143f3745b025c6fef34a6f3742c6797d307b032. Final source 15a64ffb44adea0d8404a9ce833ee56c3d9635a5 / GitHub Actions run 37247593583 / artifact 11320125290 are also recorded in root RELEASES.md and CABLEMINT_CONTEXT.md. Field acceptance remains pending.
