# v1.4.1 — Gap photo synchronization hotfix

Date: October 6, 2026. Expo/package version 1.4.1; Android versionName 1.4.1 / versionCode 23. Focused hotfix to v1.4.0; no redesign.

## Verified cause and live fix

The SELECT, UPDATE and DELETE project-files policies used an unqualified name inside the field_projects subquery. PostgreSQL bound that reference to p.name (the project title), instead of the Storage object path. Valid object paths consequently failed those policies; Storage upsert also needs SELECT/UPDATE authorization.

A direct PostgreSQL probe of the live write helper showed its stored JPG pattern already had one backslash and matched a normal UUID.jpg. JSON-rendered escaping was misleading. The migration explicitly retains the correct single-backslash literal-dot pattern, `\.jpg# v1.4.1 — Gap photo synchronization hotfix

Date: October 6, 2026. Expo/package version 1.4.1; Android versionName 1.4.1 / versionCode 23. Focused hotfix to v1.4.0; no redesign.

## Verified cause and live fix

The SELECT, UPDATE and DELETE project-files policies used an unqualified name inside the field_projects subquery. PostgreSQL bound that reference to p.name (the project title), instead of the Storage object path. Valid object paths consequently failed those policies; Storage upsert also needs SELECT/UPDATE authorization.

A direct PostgreSQL probe of the live write helper showed its stored JPG pattern already had one backslash and matched a normal UUID.jpg. JSON-rendered escaping was misleading. The migration explicitly retains the correct single-backslash literal-dot pattern, , in the helper and every filename policy. The verified live defect was object-name shadowing, not a proven double-escaped live regex.

Applied migration:

- supabase/migrations/20261006213127_gap_storage_rls_hotfix.sql
- Supabase migration name: gap_storage_rls_hotfix
- Project: kgbrhdjbeosljpwghxte
- Replaced public.cablemint_gap_storage_write(text), retaining SECURITY INVOKER, empty search_path, authenticated execute and Gap row locking.
- Altered project_files_storage_insert, project_files_storage_select, project_files_storage_update and project_files_storage_delete on storage.objects.
- All path references explicitly use objects.name, including inside project ownership subqueries.
- Exactly four folder segments: authenticated user UUID / owned project UUID / gaps / owned Gap UUID; strict UUID.jpg filename.
- INSERT and UPDATE reject deleting/tombstoned Gaps. Owned SELECT and DELETE remain available for staged cleanup.
- project-files stays PRIVATE, JPEG-only, with its existing 10 MiB limit. No table, bucket visibility, field_devices, billing or Edge Function change.

On the existing v1.4.0 installation the user pressed Retry Gap & Photos without recreating the Gap and confirmed: “Photo uploads and appears.” A read-only C1 audit found one project_files record, one unique photo ID/path, one matching current Storage object and matching size. This is real retained-photo recovery evidence; it is separate from automated v1.4.1 UI tests.

## App changes

- Gap database acknowledgement is persisted independently of photo acknowledgement. Gap synced · Photo upload failed describes a confirmed Gap with failed evidence; its Gap record badge stays Synced.
- Sync counts separately count Gap records and photos. An acknowledged Gap with one failed photo contributes one uploaded record and one failed photo, not two failures.
- Project badges use only that project's device/Gap/file states. Global Sync/Account can still report a workspace problem.
- Persisted authorization failures (AccessDenied, 42501, RLS, permission denied, 401/403) wait for manual retry. Offline, timeout, connection loss and retryable 5xx retain automatic backoff.
- Retry Gap & Photos targets that Gap. Confirmed unchanged Gap records and confirmed photos are skipped. If bytes already exist after a metadata failure, retry confirms the private object and retries only missing metadata. Lost metadata responses are reconciled before another upsert.
- Existing version-1 journal keys and IDs, photo paths and durable local URIs remain. A cached/returned exact Gap row can recover a lost local acknowledgement without recreating the Gap. Interrupted operations return to Pending.
- Aggregate Gap/project Synced still requires all database, object and metadata acknowledgements. Record Synced never implies its photos succeeded.
- Scanner/recognition/native camera, automatic/manual/pinch zoom, device queue/service, private photo retrieval and deletion workflow remain unchanged.

### Changed app/test files

app.json; package.json; package-lock.json; src/gapWorkflow.ts; src/gapRetry.ts; src/gapQueue.ts; src/gapService.ts; src/gapPresentation.ts; src/presentation.ts; src/GapWorkspace.tsx; src/FieldWorkspace.tsx; src/gapHotfix.test.ts; src/presentation.test.ts; scripts/test-gap-service.cjs; scripts/test-recognition.cjs. Migration and rollback-only SQL regression test are included under supabase/. Root RELEASES.md and CABLEMINT_CONTEXT.md record the release.

## Verification

Passed locally: npm run typecheck and npm run test:recognition, including existing recognition/conflict/serial-only/capture timeout, authentication/device save/delete/duplicates, navigation/Capture Next and sync regressions.

New tests cover legacy retained-photo retry with unchanged IDs/path, independent record/photo counts, C1 versus unrelated project badges, permanent/manual versus transient/backoff failures, restart acknowledgement, status edits without authorization retry loops, skipped confirmed operations and targeted retry. Service tests cover Storage HTTP error preservation, metadata-only retry and lost-response recovery.

Live rollback-only supabase/tests/gap_storage_rls_hotfix.sql passed under authenticated and anonymous roles:

- Valid object INSERT/SELECT/UPDATE/upsert and single current object/metadata identity.
- Denied malformed, cross-account, cross-project and wrong-Gap paths.
- Deleting/tombstoned Gap write prevention and evidence cleanup protection.
- Exact DELETE-policy expression checked for owned versus cross-account paths. Supabase prevents direct SQL object deletion even with no matching rows; that guard was respected. Actual app deletion continues through Storage API remove. No bypass flag or disabled trigger was used.
- Transaction rolled back; no customer rows or real test blobs were created.

Live final policy audit: four authenticated Storage policies, zero project-name path references, one literal regex backslash, normal JPG accepted, private bucket, invoker helper with empty search_path.

Native compilation, CI regressions and independent APK verification passed; twelve native tests and artifact evidence are recorded below.

## Post-migration advisors

Security and performance advisors ran after the migration on October 6. No finding targets the changed Storage policies or invoker helper. Existing unrelated findings were recorded without changing their objects:

| Finding | Result / scope | Remediation |
| --- | --- | --- |
| rls_auto_enable SECURITY DEFINER execution | Existing function callable by anon and authenticated; two warnings | [Anonymous execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) |
| Leaked-password protection disabled | Existing Auth setting warning | [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
| dodo_webhook_events RLS without client policies | Existing internal webhook table; information only | [RLS policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) |
| Unindexed foreign keys | Existing dodo_subscriptions customer FK and field_project_calculations user FK | [Foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) |
| Auth RLS initialization | Eight existing project/calculation/device/Dodo policies | [RLS initialization](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) |
| Unused indexes | v1.4.0 project_files_project_fk and field_gap_deletions_project_fk; retained as FK covering indexes | [Unused-index review](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) |

## Remaining physical-device checks

The live v1.4.0 retained photo already recovered. After installing v1.4.1, check the new independent Gap/photo badges and upload counts, C1 Synced versus unrelated projects, manual-only authorization retry and offline/restart/backoff behavior. Confirm cloud photos and safe Storage API cleanup on the phone. Run the stable capture/scanner/Capture Next smoke checklist; preserved source and native tests do not substitute for physical optics.

Existing limits remain: foreground-only uploads, unsaved Gap drafts in memory, no storage quota, internal prototype signing. v1.3.1 remains the last explicitly user-designated stable baseline until newer overall field acceptance.

## Delivery

Source 3c98c1bb319c8481320af3f3ecbddd2d999119d4 passed [GitHub Actions run 37535636205](https://github.com/JmanX/cableminttools-site/actions/runs/37535636205), job 112515701967, on October 6, 2026. Fresh dependency installation, TypeScript/full existing and hotfix regressions, Android generation, twelve native camera/automatic/manual zoom tests, release assembly, versioned packaging and binary gates passed. Native tests acknowledged independent 1.12× / 1.24× requests with a test-double camera, not physical optics.

Artifact 11446274323 was downloaded and independently verified. ZIP SHA-256 matches GitHub's digest. Actual manifest: package com.cableminttools.devicecapture.prototype, versionName 1.4.1 / versionCode 23. All native zoom commands/suggestion/controller fields, standalone JavaScript, 32 ML Kit model entries and native Expo ImageManipulator are present. The full compiled Gap synced · Photo upload failed string uses UTF-16 and is verified, alongside the retained journal key and new retry reconciliation/permission feedback. Test-only synthetic fixtures are absent from the bundle.

APK size: 145,950,036 bytes. SHA-256: 58539c302515f3c9978b8b35a56292e0b431da6fcbcdf034f3951e54c043bb07 (matches CI).

Exact delivery: C:\Users\jman1\Desktop\CableMint\cableminttools-site\device-capture\.artifacts\1.4.1\CableMint-Device-Capture-v1.4.1.apk

Older versioned APKs are preserved. Local evidence beside this APK: apk-verification.json, hotfix-bundle-verification.json, native-ci-evidence.txt and post-migration-advisors.json. New v1.4.1 physical status/count/retry checks remain pending; the real retained-photo recovery on v1.4.0 is already user-confirmed.
