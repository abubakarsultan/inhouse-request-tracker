# INHOUSE REQUEST

Phase 2 of the no-login Rankviz outreach request app. Supabase is the source of truth and the **Guest Post Anchor** Google Sheet remains a server-side mirror.

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

## Environment variables

Copy `.env.example` to `.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
TEAM_SHEET_ID=
SHEET_WEBHOOK_SECRET=
```

No new environment variables were added in Phase 2.

`GOOGLE_SERVICE_ACCOUNT_JSON` is the base64-encoded complete Google service-account JSON. Share `TEAM_SHEET_ID` with that service-account email as **Editor**.

`SHEET_WEBHOOK_SECRET` is reserved for the Phase 4 sheet-to-site webhook. Do not install the old simple `onEdit` snippet.

## Database

For an existing installation, run migrations in order:

```text
database/migrations/001_phase1_core.sql
database/migrations/002_phase2_search.sql
```

`002_phase2_search.sql` is re-runnable and adds the normalized server-side request-search RPC used by `/search`.

For a fresh installation, `database/schema.sql` contains the current Phase 2 schema and helper functions.

## Local setup

```bash
npm ci
npx tsc --noEmit
npm run test:phase2
npm run build
npm run dev
```

Open `http://localhost:3000`. The app opens without login.

## Phase 2 manual acceptance checks

1. Open **New Request**, type an Approved Site, and confirm the green/amber site-usage hint appears after the debounce.
2. Check `https://www.example.com/path?q=1` and `example.com` in **Site Check** and confirm they are treated as the same host. Confirm `example.co` is not treated as `example.com`.
3. If the same site has multiple rows in one project, confirm every matching row appears under **USED IN**.
4. Search a client, site, anchor, assignee, status, or target URL. Confirm 2-character minimum, match highlighting, and `100+` capped messaging.
5. Change status from a Search result and confirm the result card updates in place and the normal Phase 1 DB/project-site/Sheet/log flow is used.
6. Run **Import from team sheet** twice. The second run should add 0 already-existing tuples and report them as skipped.
7. Confirm blank gap rows in the team sheet are ignored and imported rows keep their actual Sheet row number in `team_row`.
8. Download the CSV for a date with requests and confirm filename `requests_YYYY-MM-DD.csv` and exact columns: `Client, Sub-Project, Target URL, Anchor, Approved Site (Domain), Placement Page, Priority, Assign To, Deadline`.
9. Pick a date with no requests and confirm the UI shows a friendly message instead of downloading an empty file.

## Deferred by the agreed phase plan

Phase 3: full dashboard, project card grid/counts, My Requests, and deadline/status visuals.  
Phase 4: webhook + installable Apps Script trigger, refresh/retry repair tooling, health check, diagnostics, and CSV/XLSX importer sheet-push update.
