# CableMint Teams — Company Workspace MVP (planning only)

Status: Draft / branch-only plan  
Date: 2026-11-07  
Owner: CableMint Tools  
Public Android baseline: Device Capture v1.4.5 (versionCode 33) under Google Play Production review.

## Goal

Add a business-facing **Company Workspace** to CableMint while preserving today's **Personal Workspace** and the existing Android companion. Owners/managers assign technicians to jobs; technicians capture devices and Gaps on site; the company sees one shared, accurate project record.

The workflow remains: **Calculate → Capture → Document → Verify → Close Out**.

## Product decisions already discussed

- User-facing product name: **CableMint Teams**; account mode: **Personal / Company**.
- Preserve individual accounts, standalone Pro entitlement, and existing personal records.
- Company creation + invitations → project assignments → company dashboard → rankings/awards later.
- Pilot with 1–2 contractors before building a full performance/badges engine.
- Tentative, **unvalidated** price hypothesis for a paid tier after pilot: **$59/month up to 5 technicians + $10/month per additional technician**. Do not create paid plans or checkout yet.
- No native Android billing or links to external purchase flows inside Device Capture. Do not modify existing Dodo Payments integrations in this phase.
- Do not change, republish, or invalidate v1.4.5 while its production release is under Google review.

## MVP user flows

1. A company owner creates a company with name and optional contact details.
2. Owner invites a technician by email. Invitation requires the technician to sign in or create an existing CableMint account via approved web flow (not Android in-app signup).
3. The invited technician joins the company. Users retain a Personal workspace that remains private.
4. Owner/admin creates a company project, enters basic site information, and assigns one or more technicians.
5. Assigned technician switches to Company workspace, sees only their assigned projects, captures devices and Gaps, and syncs their work online or offline.
6. Owner/admin sees all company projects, completed captures, devices requiring verification, open Gaps and assigned staff.
7. Author / last editor and timestamps accompany every company device and Gap where relevant. Later, verified contribution metrics support badges.

## Roles and permissions

| Action | Owner | Admin | Technician |
| --- | --- | --- | --- |
| Manage company profile | Yes | No | No |
| Invite/remove technicians | Yes | Yes | No |
| Assign/reassign projects | Yes | Yes | No |
| View all company projects | Yes | Yes | No |
| View assigned company projects | Yes | Yes | Yes |
| Add devices and Gaps to assigned projects | Yes | Yes | Yes |
| Edit own new records | Yes | Yes | Yes |
| Review/reassign other users' work | Yes | Yes | No |
| View company dashboard | Yes | Yes | Limited own stats |
| Manage company billing later | Yes | No | No |

For shared device/Gaps editing, define and enforce record-author vs project-manager rules before implementation. Consider a dedicated read-only/auditor role later; not in MVP.

## Current database findings (read-only inspection, 2026-11-07)

Supabase has `field_projects`, `field_devices`, `field_gaps`, and `project_files` with RLS enabled. Current policies require `auth.uid() = user_id` and/or a project owned by the same user. These policies correctly isolate Personal records but do not permit shared company projects.

**Do not simply remove existing user ownership checks**. That would put existing customer data at risk.

### Proposed additive model (do not run on production without review)

- `companies(id, name, owner_user_id, created_at, updated_at)`
- `company_members(company_id, user_id, role, status, joined_at)`; unique (company_id, user_id).
- `company_invitations(id, company_id, email_normalized, invited_by, role, token_hash, expires_at, accepted_at)`; never store raw invite tokens.
- `company_project_assignments(company_id, project_id, user_id, assigned_by, assigned_at)`; unique (project_id, user_id).
- Add nullable `company_id` to `field_projects`. **NULL means existing Personal project**. Do not bulk-migrate existing projects without explicit user action.
- Keep existing `user_id` on devices, Gaps, and files to represent the author/owner of contributed records, and add audit fields only as needed.
- Prefer reference to the project's company through `project_id`; validate project membership and assignment server-side and via RLS. Never trust workspace/company IDs passed by a client on their own.
- Future: activity / verification events to support fair metrics without rewarding raw scan quantity.

### RLS requirements

- Personal rows: preserve current exact-isolation behavior.
- Company membership: authenticated user can see only their own memberships and company records they are entitled to; company owners/admins can manage authorized invitations and membership.
- Company projects: owner/admin can manage all projects for **their own** company; technicians can read/write only assigned projects, with writes restricted to their authorized scope.
- Device/Gap/photo uploads and deletes: verify both project scope and the user's membership/assignment. Ensure storage bucket paths and signed URL rules are tenant-safe.
- Avoid RLS recursion in membership/company policies. Use security-definer helpers only if genuinely needed; protect function execute permissions and fix search_path.
- Reject cross-company reassignment and project_id mutation that can move personal data between tenants.
- Authorization must not depend on client-editable user_metadata.
- Use distinct IDs for company/project/device records and preserve stable IDs for offline deduplication.

### Test matrix (mandatory prior to live migration)

1. Existing Personal records load, save, update, delete and sync unchanged.
2. Owner from Company A cannot access Company B data even with a valid UUID.
3. Technician A can work on assigned Company A Project 1; cannot access unassigned Project 2.
4. Revoking membership immediately prevents new reads/writes, including offline items when reconnecting.
5. Offline queue survives app restart and syncs to correct company/project exactly once.
6. Duplicate-device checks are scoped to the correct project/company.
7. File/photo upload, cleanup and Gap deletion stay within tenant boundaries.
8. Expired, replayed and wrong-account invite links cannot grant membership.
9. Owner/admin/technician role escalation attempts are blocked by server/RLS.
10. Personal Pro access and Company entitlement handling do not conflict; beta accounts should behave consistently.
11. No release to production and no changes to v1.4.5 while current Google Play review is open.

## Implementation sequence

**Phase 0 — Audit and design (now)**
- Inventory the local Android repo (not currently in connected GitHub) and website Field Tools flows.
- Produce migration SQL files, RLS matrix, threat model, tests, and rollback plan in a separate feature branch.
- Do not execute migrations against the live Supabase project.

**Phase 1 — Company identity and sharing (first functional milestone)**
- Database schema and tests in isolated environment.
- Web Company Workspace page: create company; invite/revoke member; create/assign company project.
- Personal/Company workspace switch; owner and assigned technician end-to-end test.

**Phase 2 — Android company context**
- Android workspace switch; assigned project list; per-tenant device/Gap capture; offline queue scoping.
- Build as v1.5.x or new code after production launch; do not overwrite code 33.
- Internal testing first, then closed and production once approved.

**Phase 3 — Dashboard and commercial pilot**
- Manager project summary, records by project, open Gaps, missing/verified device data.
- Pilot with 1–2 low-voltage contractors; learn whether assignments/sync save time.
- Only then evaluate seat pricing, company entitlements and billing-policy compliance.

**Phase 4 — Recognition**
- Verified captures, documentation quality, issue resolution and other fair metrics.
- Badges/rankings should be opt-in and avoid encouraging inaccurate/high-volume scans.

## Immediate Codex assignment

In the existing local CableMint Device Capture source, create a *separate branch* for Teams Phase 0. Review current Supabase schema and the website's `field-tools/` integration. Return:

1. File/module map for auth, Pro entitlement, project list, device capture, Gaps, offline queue and upload.
2. Additive SQL migration proposal (not applied) and complete RLS policies/tests for the three roles.
3. Data-flow diagrams or concise descriptions for workspace selection, offline capture and revocation.
4. Compatibility / rollback risks to v1.4.5 and existing personal records.
5. Concrete Phase 1 implementation task list with estimates by relative effort (S/M/L), not calendar commitments.

**Do not deploy, alter production Supabase, change Dodo, touch current Google Play submissions, or make Android release builds in this initial assignment.**
