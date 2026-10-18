# Phase 2 Report

## 1. What I built

- **6.4 Form inline hint**
  - Debounced ~400 ms Approved Site check.
  - Amber `Already used in N project(s): ...` and green `Not used in any project yet.` states.
  - Uses the same `/api/site-check` endpoint as the standalone checker.
  - Saving remains allowed regardless of site usage.

- **6.3 Site Check**
  - Added `/site-check` and `/api/site-check`.
  - Host extraction strips protocol, `www.`, path, query, and port, then matches hosts exactly.
  - Reads `project_sites` plus linked `requests` statuses, never the Google Sheets API.
  - Returns every matching row per project, not only the first.
  - Shows USED IN / NOT USED IN lists, status badges, anchors, project links, and Tracker-only labels for projects without a mapped team tab.
  - Project-site reads are paginated so Supabase's default 1000-row response limit cannot silently truncate the scan.

- **6.5 Search**
  - Added `/search` with 250 ms debounce and 2-character minimum.
  - Added re-runnable normalized SQL RPC `search_requests`.
  - Searches client, sub-project, approved site, anchor, assignee, status, and target URL.
  - Fetches 101 rows to implement the required 100-result cap and `100+ ... refine your search` message.
  - Highlights normalized matches in visible result fields.
  - Mark Live / Revert calls the existing canonical `setRequestStatus` and updates the result card in place.

- **7.5 Download Today CSV**
  - Added `GET /api/exports/requests?date=YYYY-MM-DD` and a date-picker UI on Imports & Exports.
  - Uses Asia/Karachi date bounds.
  - Exactly 9 columns in the required order.
  - `Client` comes from `projects.outreach_project_name`.
  - UTF-8 BOM, CRLF row endings, trailing CRLF, and RFC-style quoting/quote escaping per the prompt.
  - Returns a friendly JSON message instead of an empty CSV when no rows exist.
  - Added focused CSV unit coverage.

- **7.2 Import from team sheet**
  - Added a no-login action/UI that reads A2:G from every mapped project tab.
  - Skips intentional blank gap rows.
  - Inserts `project_sites` only; never creates `requests` rows.
  - De-dupes on project + website + anchor and is safe to re-run.
  - Stores the original `team_row`.
  - Missing mapped tabs are skipped, not auto-created.
  - Displays rows read / added / skipped / errors plus a per-project report.
  - Existing `project_sites` are paginated during duplicate preparation so datasets over 1000 rows remain safe.

## 2. Files added / changed / deleted

### Added

- `app/api/exports/requests/route.ts`
- `app/api/site-check/route.ts`
- `app/search/page.tsx`
- `app/site-check/page.tsx`
- `components/app/outreach-csv-download.tsx`
- `components/app/search-panel.tsx`
- `components/app/site-check-panel.tsx`
- `components/app/team-sheet-import.tsx`
- `database/migrations/002_phase2_search.sql`
- `lib/domain.ts`
- `lib/outreach-csv.ts`
- `services/search.ts`
- `services/site-check.ts`
- `tests/domain.test.mjs`
- `tests/outreach-csv.test.mjs`
- `PHASE2_REPORT.md`

### Changed

- `README.md`
- `app/import/page.tsx`
- `components/app/request-form.tsx`
- `components/sidebar.tsx`
- `database/schema.sql`
- `package.json`
- `services/google-sheet-sync.ts`
- `services/sites.ts`

### Deleted

- None.

## 3. SQL and environment

Run in order on an existing database:

1. `database/migrations/001_phase1_core.sql` if Phase 1 has not already been applied.
2. `database/migrations/002_phase2_search.sql`.

No new environment variables were added. Phase 2 continues to use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `TEAM_SHEET_ID`
- `SHEET_WEBHOOK_SECRET`

## 4. Verification performed

Successful checks in this environment:

- Re-read the Phase 1 codebase and the relevant Apps Script Search / Site Check / form behavior before implementation.
- `npm run test:phase2`: **3 tests passed**.
  - Host normalization removes protocol/www/path/query/port.
  - `example.co` does not match `example.com`.
  - Outreach CSV header order, BOM, trailing CRLF, comma quoting, quote escaping, and newline quoting are covered.
- TypeScript parser pass across **47 TS/TSX application files: 0 syntax failures**.
- Local import integrity scan across **47 application files: 0 broken local imports**.
- Re-read every Phase 2 added/changed source file after the official compile commands could not run validly.
- Client-code sweep confirmed no direct import of the Supabase service-role client or Google Sheets client into client components.
- Old request vocabulary sweep found no new `Request Shared`, `NOT SYNCED`, `Removed`, or `Urgent` usage in the Phase 2 application paths.

Official compile commands were attempted but could not be validly completed because dependency installation did not finish in this execution environment. `npm ci` timed out and left an incomplete `node_modules` tree. Consequently:

- `npx tsc --noEmit` stopped on missing `node`, `react`, and `react-dom` type-definition packages.
- `npm run build` stopped with `next: not found`.

These are dependency-install failures, not claimed application test passes. Run the standard commands in a normal environment with registry access:

```bash
npm ci
npx tsc --noEmit
npm run test:phase2
npm run build
```

Live Supabase RPC execution, production team-sheet reads, and the export route against production data were not executed because production credentials are not present in the attached project.

## 5. Preserved behavior / assumptions

- The Phase 1 DB-first request flow and `lastRow + 2` team-sheet append behavior are unchanged.
- Site Check includes every project currently stored in `projects`, including disabled projects, because the specification says to check every project.
- A project with no mapped team tab is still part of Site Check and receives the `Tracker only` label.
- A missing mapped team-sheet tab during the one-time/repeatable import is treated as skipped, not an error, matching the app's existing no-auto-create-tab behavior.
- Team-sheet import maps exact `Live` to `Live`; any other/blank legacy sheet status is stored as `Request shared` so newly imported tracker rows use the two-status vocabulary.
- The existing CSV/XLSX file importer is intentionally not given optional sheet push in Phase 2; that remains Phase 4 per the agreed build plan.
