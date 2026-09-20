# Phase 3 Report

## 1. What I built

### 6.7 Dashboard
- Expanded the dashboard from five counts into the full operational view: Total Requests, Live Links, Pending, Failed Sync, and This Month.
- Failed Sync is clickable when non-zero and opens the failed-item list with per-request **Retry sync** controls using the existing DB-first retry action.
- Added Recent activity (latest 8: date, client, website, owner, status).
- Added **Became Live — last 7 days**, based on the first `live_date` and Asia/Karachi calendar dates.
- Added per-project Requests / Live / Pending breakdown.
- Added the visible Refresh live status control, but intentionally left it disabled because section 8 / the agreed build plan assigns the actual sheet reconciliation action to Phase 4. No fake refresh result is shown.

### 6.8 Projects
- Replaced the projects table with a responsive card grid: 3 cards per row on desktop.
- Each card shows project name plus Requests / Live / Pending counts calculated from `requests`, with existing edit/disable controls and **Open →**.
- Kept add/edit/disable project behavior intact.
- Project detail remains the `project_sites` table with Website, Opportunity, Anchor, DR, Traffic, Status, and Note. Linked rows still use the canonical `setRequestStatus` path.
- Added small project-row / Live / Request shared summary counts above the detail table.

### 6.6 My Requests
- Added `/my-requests` and sidebar navigation.
- Browser-local **Who are you?** identity preselects the page and remains editable with autocomplete from previously used `assign_to` values.
- Added Assigned / Live / Pending / Overdue KPIs.
- Added upcoming deadlines for the next 7 Karachi calendar days, non-Live only.
- Added full assigned request list with Mark Live / Revert controls.
- My Requests reloads its KPIs/lists after a status change.
- Overdue logic is exactly `deadline < today AND status != Live` using Asia/Karachi today.

### 6.9 Deadline and status visuals
- Kept the exact Live, Request shared, and Failed sync chip colors from the master spec.
- Overdue non-Live deadline: `#f4c7c3` background.
- Non-Live due today or within 2 days: `#fff2cc` background.
- Applied deadline visuals to Requests and My Requests.

### General view states
- Added shared route loading skeleton and recoverable error UI so Phase 3 server views do not fail into an unexplained blank screen.

## 2. Files added / changed / deleted

### Added
- `app/error.tsx`
- `app/loading.tsx`
- `app/my-requests/page.tsx`
- `components/app/my-requests-panel.tsx`
- `components/app/retry-sync-button.tsx`
- `components/deadline-cell.tsx`
- `tests/deadline-visuals.test.mjs`
- `PHASE3_REPORT.md`

### Changed
- `README.md`
- `app/dashboard/page.tsx`
- `app/projects/page.tsx`
- `app/projects/[slug]/page.tsx`
- `app/requests/page.tsx`
- `components/app/status-control.tsx`
- `components/sidebar.tsx`
- `lib/date.ts`
- `package.json`
- `services/projects.ts`
- `services/requests.ts`

### Deleted
- None.

## 3. SQL and environment

- **No new Phase 3 migration is required.** Phase 3 only adds queries/views/UI on top of the Phase 2 schema.
- Existing installations still need, in order, `database/migrations/001_phase1_core.sql` and `database/migrations/002_phase2_search.sql` if they have not already been applied.
- No new environment variables were added. Continue using:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_SERVICE_ACCOUNT_JSON`
  - `TEAM_SHEET_ID`
  - `SHEET_WEBHOOK_SECRET`

## 4. Verification performed

Successful checks in this environment:
- `npm run test:phase3`: **4/4 tests passed**.
  - Existing Phase 2 host-normalization tests pass.
  - Existing exact Outreach OS CSV-format test passes.
  - New deadline test confirms overdue red, due-within-2-days yellow, and no urgency color for Live rows.
- TypeScript parser pass across **53 TS/TSX files: 0 syntax failures** after the final changes.
- Local import integrity scan: **0 broken local imports**.
- Phase 3 files were re-read after implementation and the Phase 2 behavior paths were left in place.

Official compile commands were attempted. Dependency installation again timed out in this execution environment and left an incomplete `node_modules` tree, so a valid package-backed compile could not complete:
- `tsc --noEmit` stopped because `@types/node`, `@types/react`, and `@types/react-dom` are not installed in the incomplete dependency tree.
- `npm run build` stopped with `next: not found`.

I am **not** claiming a successful Next.js production build. Run these in a normal registry-connected environment:

```bash
npm ci
npx tsc --noEmit
npm run test:phase3
npm run build
```

Live Supabase data, production Sheet writes, and production retry behavior were not executed because production credentials are not present in the attached project.

## 5. Preserved behavior / assumptions

- The Phase 1 DB-first save/status logic, two-status vocabulary, `live_date` preservation, and verified Google Sheet status writes are unchanged.
- The Phase 2 Site Check, Search, exact Outreach CSV, and repeatable team-sheet import remain unchanged.
- “Next 7 days” in My Requests is implemented as today through today + 6 calendar days in Asia/Karachi, matching the 7-day inclusive window used for the Dashboard’s “last 7 days”.
- **Became Live — last 7 days** uses the first `live_date`, which is intentionally never cleared on revert. A request that became Live in the window and was later reverted can therefore appear with its current Request shared status; this preserves the historical meaning of “became Live”.
- Imported/unlinked `project_sites` rows remain read-only status badges because section 6.2 requires every request status write to go through `setRequestStatus(requestId, ...)`; creating an alternate status-write path would violate the master prompt.
- The functional **Refresh live status** reconciliation remains Phase 4 as explicitly listed in section 10. Phase 3 shows the control as disabled and labels the deferral instead of pretending it ran.
