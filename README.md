# INHOUSE REQUEST

Phase 3 of the no-login Rankviz outreach request app. Supabase is the source of truth and the **Guest Post Anchor** Google Sheet remains a server-side mirror.

## Current behavior

### Phase 1 core

- No login, auth page, middleware redirect, or Supabase Auth flow.
- All Supabase access is server-side with `SUPABASE_SERVICE_ROLE_KEY`.
- Request statuses are exactly `Request shared` and `Live`; both directions are allowed.
- Priorities are `High`, `Medium`, and `Low` with `Medium` as the default.
- `Assign To` and `Shared With` are free text with autocomplete.
- The browser-only **Who are you?** picker supplies `created_by_name` and `status_changed_by`.
- Request creation is DB first: `requests` -> linked `project_sites` -> team-sheet mirror.
- Team-sheet appends use the intentional `lastRow + 2` gap and a DB lease lock.
- Status updates verify both Website and Anchor before writing Sheet column F.

### Phase 2 form and tools

- Approved Site inline hint checks usage after about 400 ms and never blocks saving.
- **Site Check** uses exact normalized host matching, so `www.example.com/path` = `example.com` while `example.co` != `example.com`.
- Site Check reads the app database, returns every matching row per project, and labels projects without a mapped team tab as **Tracker only**.
- **Search** starts at 2 characters, debounces for 250 ms, uses normalized server-side matching, caps display at 100 rows, highlights matches, and supports Mark Live / Revert through the canonical `setRequestStatus` action.
- **Import from team sheet** reads mapped project tabs A2:G and creates missing `project_sites` rows only. It never creates `requests` rows and is safe to run repeatedly.
- **Download Today CSV** exports the selected Asia/Karachi date in the exact 9-column Outreach OS bulk-add format with UTF-8 BOM and CRLF records.

### Phase 3 views

- **Dashboard** now includes Total Requests, Live Links, Pending, Failed Sync, and This Month KPIs; failed-sync drill-down with Retry; the latest 8 requests; links that first became Live in the last 7 Karachi calendar days; and a per-project status breakdown.
- **Projects** is a responsive card grid (3 per row on desktop) with Requests / Live / Pending database counts plus add/edit/disable controls. Project detail keeps the `project_sites` table and canonical linked-request status control.
- **My Requests** uses the browser-only name picker and shows Assigned / Live / Pending / Overdue KPIs, upcoming deadlines for the next 7 Karachi calendar days, and the full assigned request list with Live/Revert controls.
- Deadline visuals now use red `#f4c7c3` for overdue non-Live work and yellow `#fff2cc` for non-Live work due within 2 days.
- Shared loading and error states were added for route transitions/server view failures.
- The Dashboard visibly reserves **Refresh live status**, but the button is intentionally disabled until the Phase 4 sheet-to-site reconciliation implementation.

## Environment variables

Copy `.env.example` to `.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
TEAM_SHEET_ID=
SHEET_WEBHOOK_SECRET=
```

No new environment variables were added in Phase 3.

`GOOGLE_SERVICE_ACCOUNT_JSON` is the base64-encoded complete Google service-account JSON. Share `TEAM_SHEET_ID` with that service-account email as **Editor**.

`SHEET_WEBHOOK_SECRET` is reserved for the Phase 4 sheet-to-site webhook. Do not install the old simple `onEdit` snippet.

## Database

For an existing installation, run migrations in order:

```text
database/migrations/001_phase1_core.sql
database/migrations/002_phase2_search.sql
```

`002_phase2_search.sql` is re-runnable and adds the normalized server-side request-search RPC used by `/search`.

Phase 3 makes no database schema changes. For a fresh installation, `database/schema.sql` remains the current schema and helper functions from Phase 2.

## Local setup

```bash
npm ci
npx tsc --noEmit
npm run test:phase3
npm run build
npm run dev
```

Open `http://localhost:3000`. The app opens without login.

## Phase 3 manual acceptance checks

1. Open **Dashboard** and confirm the five KPI cards, latest 8 activity rows, last-7-days Live section, and per-project status table.
2. If any request has `sync_state = failed`, click the Failed Sync card and retry one item; confirm the DB record remains intact even if Sheets is unavailable.
3. Open **Projects** and confirm a 3-column desktop card grid with Requests / Live / Pending counts. Add/edit/disable still works.
4. Open a project and confirm the Website / Opportunity / Anchor / DR / Traffic / Status / Note table remains intact and linked rows use the canonical status control.
5. Open **My Requests**, choose a prior `Assign To` value, and confirm Assigned / Live / Pending / Overdue plus upcoming next-7-days and the full list.
6. Mark an item Live or revert it inside My Requests and confirm the list/KPIs reload.
7. Confirm an overdue non-Live deadline is red, a non-Live deadline due today/within 2 days is yellow, and Live rows do not show urgency background.
8. Confirm the Dashboard Refresh live status control is visibly deferred rather than pretending to reconcile the Sheet; Phase 4 wires it.

## Deferred by the agreed phase plan

Phase 4: webhook + installable Apps Script trigger, refresh/retry repair tooling, health check, diagnostics, and CSV/XLSX importer sheet-push update.
