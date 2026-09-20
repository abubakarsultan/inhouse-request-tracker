# Phase 4 + Final Verification Report

## 1. What I built

### Section 8 — Team sheet -> site status sync
- Replaced the old webhook contract with the exact payload `{tab,row,website,anchor,status}` and `x-sheet-webhook-secret` validation.
- Added normalized request lookup by `team_tab + website + anchor` with `team_tab + team_row` fallback through the new `find_request_from_sheet` RPC.
- Incoming Sheet changes call the canonical `setRequestStatus()` with Sheet push disabled, preventing ping-pong loops. Webhook `changed_by` is `team sheet`.
- Added `apps-script/SheetStatusWebhook.gs` and Settings-page generated code using an **installable** `onSheetEdit` trigger created by `ScriptApp.newTrigger(...).onEdit().create()`.
- Trigger only handles column F on tabs whose A1:G1 headers match `Website, Opportunity, Anchor, DR, Traffic, Status, Note`, and ignores headers/blank/invalid-status rows.
- Added Dashboard **Refresh live status**. It reads each relevant Sheet tab once, verifies Website + Anchor, repairs moved row numbers, reconciles valid status differences, preserves first `live_date`, and surfaces invalid/missing rows.
- Refresh summaries are written to `sync_logs` and the Dashboard shows the persisted last refresh time + updated count.

### Section 7.1 — Health check
- Added `/health` and navigation.
- Read-only scan checks every request with stored `team_tab/team_row`, verifies linked `project_sites`, and verifies the Sheet row by normalized Website + Anchor.
- Health scan batches one Google read per unique tab rather than per request.
- Added **Re-link** action that runs the same verify-and-search logic for one request and repairs only row pointers / sync metadata. The scan itself never auto-fixes.

### Section 7.4 — Settings / diagnostics
- Settings now shows read-only checks for Supabase, Google service-account JSON, team-sheet reachability, and webhook-secret presence.
- Kept browser-local **Who are you?** picker.
- Added ready-to-copy installable Apps Script with the current site URL filled into `/api/sheet-webhook`.

### Section 7.3 — CSV/XLSX importer update
- Import status is normalized to exactly `Request shared` or `Live`; unsupported legacy values are mapped to `Request shared` with a visible warning.
- Added optional **Push imported rows to team sheet** checkbox, off by default.
- File rows are inserted into `project_sites` first. Sheet push is best-effort and never removes imported DB data.
- Sheet pushes use the same serialized `lastRow + 2` behavior and write all seven project-tab columns.

### Failed-sync repair
- `Retry sync` now uses verified status update when a request already has `team_row` and only appends when no row was ever stored. This avoids duplicate rows after a failed status push.
- Sheet-originated status changes and refresh reconciliation keep status mutation inside the single canonical `setRequestStatus()` path.
- Failures/warnings are written to `sync_logs`; silent catches were not added.

## 2. Files added / changed / deleted

### Added
- `app/health/page.tsx`
- `apps-script/SheetStatusWebhook.gs`
- `components/app/refresh-live-status-button.tsx`
- `components/app/relink-health-button.tsx`
- `database/migrations/003_phase4_sync.sql`
- `lib/sheet-webhook.ts`
- `services/diagnostics.ts`
- `services/health.ts`
- `tests/phase4-sync.test.mjs`
- `PHASE4_REPORT.md`

### Changed
- `README.md`
- `app/api/sheet-webhook/route.ts`
- `app/dashboard/page.tsx`
- `app/settings/page.tsx`
- `components/app/import-form.tsx`
- `components/sidebar.tsx`
- `database/schema.sql`
- `package.json`
- `services/google-sheet-sync.ts`
- `services/requests.ts`
- `services/sites.ts`

### Deleted
- None.

## 3. SQL and environment

Run in order:

```text
database/migrations/001_phase1_core.sql
database/migrations/002_phase2_search.sql
database/migrations/003_phase4_sync.sql
```

`003_phase4_sync.sql` is idempotent/re-runnable and adds:
- `requests_team_tab_row_idx`
- `project_sites_project_team_row_idx`
- `find_request_from_sheet(p_tab, p_website, p_anchor, p_row)`

No new environment variables were added. Required variables remain exactly:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `TEAM_SHEET_ID`
- `SHEET_WEBHOOK_SECRET`

## 4. Verification performed

Successful checks in this environment:
- `npm run test:phase4`: **7/7 tests passed**.
  - Exact host normalization / no substring domain false positive.
  - Deadline visual rules.
  - Exact Outreach OS CSV BOM/CRLF/header/escaping contract.
  - Exact Sheet webhook payload/status validation.
  - Two-status file-import normalization.
  - Installable trigger generation, webhook URL, `onSheetEdit`, and column-F guard.
- TypeScript compiler `transpileModule` syntax pass across **59 TS/TSX files: 0 syntax failures**.
- Local import integrity scan: **0 broken local imports**.
- Status-write audit: request/project-site status changes remain centralized in `services/requests.ts` `setRequestStatus()`; Phase 4 Sheet code only updates row/sync metadata directly.

Official commands were attempted exactly as required, but this execution environment could not install the package tree:
- `npm ci` retried and failed against npm registry with repeated DNS `EAI_AGAIN` errors (for packages including Next, TypeScript, React types, XLSX, Zod, etc.). It left an incomplete `node_modules`, which is excluded from the delivered ZIP.
- `npx --no-install tsc --noEmit` therefore stops on missing `@types/node`, `@types/react`, and `@types/react-dom`.
- `npm run build` stops with `next: not found` because Next was not installed.

I am **not** claiming a successful package-backed TypeScript compile or Next.js production build. Run `npm ci`, `npx tsc --noEmit`, `npm run test:phase4`, and `npm run build` in a registry-connected environment before deployment.

Production integration verification could not be executed here because all five production environment variables are absent in this runtime. Therefore I did **not** claim live verification of Supabase migrations, Google Sheet writes, webhook delivery, or service-account authorization. The README contains the exact final production acceptance sequence.

## 5. Preserved behavior / assumptions

- Supabase remains the source of truth; every Sheet operation is best-effort after DB state is safe.
- The intentional `lastRow + 2` blank-row quirk is preserved for request creation and optional imported-row Sheet push.
- Missing mapped team tabs remain `skipped`, not auto-created.
- Sheet row verification remains normalized Website + Anchor before using a stored row; raw row numbers alone are never trusted for status updates/repair.
- Webhook fallback to `team_tab + team_row` is kept exactly as specified, after site+anchor lookup fails.
- Invalid Sheet statuses are never written into request status. They surface as failed-sync diagnostics.
- File-import legacy/unsupported status values map to `Request shared` with a visible import warning so `project_sites` stays inside the two-status vocabulary.
- No 10-minute cron was added. Manual Dashboard refresh plus the installable edit webhook are the supported reconciliation paths; this does not depend on Vercel Hobby cron frequency.
