# INHOUSE REQUEST

Rankviz's internal outreach request management site — replaces the
"Inhouse Request Tracker" (Google Sheet + Apps Script). The database is
the source of truth; the team's **Guest Post Anchor** Google Sheet is a
mirror kept in sync both ways.

Stack: Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres) · Vercel

> **No login.** Opening the site opens the dashboard directly. No sign-in
> page, no session, no cookies. Every DB call runs server-side with the
> Supabase service-role key — keep the site URL private.

## 1. Supabase setup

**New project:** open the SQL editor and run the entire contents of
`database/schema.sql` once.

**Existing project (upgrading from the pre-Phase-1 build):** run the
files in `database/migrations/` **in order** instead — right now that's
just `001_phase1.sql`. It is idempotent (safe to re-run) and:
- drops the old 3-status enum + forward-only trigger, replaces `status`
  with `text` + a 2-value CHECK (`Request shared` / `Live`)
- drops the old 4-value priority enum, replaces with `text` + CHECK
  (`High` / `Medium` / `Low`)
- converts `requests.assigned_to` (uuid → users) into `requests.assign_to`
  (free text), backfilling names from the old FK first
- adds the sync-tracking columns (`team_tab`, `team_row`, `sync_state`,
  `sync_error`, `live_date`, `initial_status`, `status_changed_by/at`,
  `created_by_name`)
- adds `sheet_write_locks` (mutex for concurrent sheet appends)
- seeds/updates the 19 projects from the old `NAME_MAP`

After running it, check `_migration_001_removed_status_rows` — it lists
any request that used to be `Removed` and is now `Request shared` (see
"Assumptions" below). Drop that table once you've reviewed it; it's not
used by the app.

## 2. Environment variables

Copy `.env.example` to `.env.local` (or set in Vercel → Project →
Settings → Environment Variables):

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET` —
  needed for the Google Sheet sync (see below). The app runs fine without
  them: every request is still saved, `sync_state` is just `'skipped'` or
  `'failed'` and it's all logged in `sync_logs`.

## 3. Run it

```
npm install
npm run dev
```

Open http://localhost:3000 — it goes straight to the dashboard.

To verify a production build: `npx tsc --noEmit && npm run build`.

## 4. Google Sheet sync (two-way) — Phase 1 scope

**App → Sheet** (section 5 of the master prompt):
1. Google Cloud Console → create a service account → generate a JSON key.
2. Share the **Guest Post Anchor** spreadsheet with the service account's
   `client_email` (Editor access).
3. Base64-encode the key file (`base64 -i key.json | tr -d '\n'`) and set
   it as `GOOGLE_SERVICE_ACCOUNT_JSON`. Set `TEAM_SHEET_ID` to the
   spreadsheet's ID (from its URL) — **one sheet for every project now**,
   there is no more per-project spreadsheet ID.
4. On each project (Projects page → edit), fill in the exact tab name
   (`guest_post_tab_name`) and toggle sync on. A project with sync off,
   or whose tab doesn't exist in the sheet yet, is skipped — never an
   error, never auto-created.

New requests are appended at **lastRow + 2** in that tab (one blank row
gap — intentional, matches the old sheet's behaviour), serialized through
a DB-backed lock (`sheet_write_locks`) so two people saving at the same
moment can't collide on the same row. Status changes re-verify that the
stored row still matches (website + anchor) before writing column F, and
search the tab to self-heal if it doesn't.

**Sheet → App** (section 8) — the installable-trigger Apps Script and the
`POST /api/sheet-webhook` receiver are the Phase 4 deliverable. The route
already exists and expects `{ tab, row, website, anchor, status }` with
header `x-sheet-webhook-secret`, but nothing calls it yet until the Apps
Script trigger is added in Phase 4.

## Modules delivered in Phase 1

- **Create Request** (`/requests/new`) — the full write order from
  section 6.1: insert `requests` → insert/link `project_sites` → push to
  the team sheet → show the same three outcomes the old sheet did
  (✅ synced / ⚪ no tab, saved here only / ❌ failed, retry later). The
  duplicate rule (approved site + anchor, normalized, across all clients)
  warns with **Save anyway** / **Cancel**.
- **setRequestStatus`** (`services/requests.ts`) — the *only* place status
  is ever written. `Mark Live` / `Revert` on the Requests list calls it;
  it updates the request, the linked `project_sites` row, `request_logs`,
  and the verified team-sheet cell, and is idempotent (same status twice
  is a no-op that still returns ok).
- **"Who are you?"** — a browser-localStorage name picker (not auth),
  supplies `created_by_name` / `changed_by` and pre-fills Assign To /
  Shared With autocomplete from previously used values.
- **Dashboard** — Total / Live / Pending / Failed Sync / This Month, all
  live counts in Asia/Karachi time; a Failed Sync count > 0 links to the
  list of failing requests.
- **Projects** — the 19 seeded projects; add/edit/disable still works.

## Not yet built (later phases, per the master prompt's build plan)

- Phase 2: inline "already used" hint while typing Approved Site, the
  Site Check page, Search, Download Today CSV (Outreach OS format),
  Import from team sheet.
- Phase 3: full dashboard (recent activity, became-live-in-7-days,
  per-project breakdown, Refresh button), Projects card grid, My
  Requests, deadline/status visual polish.
- Phase 4: the sheet webhook's Apps Script installable trigger, Retry
  Sync button in the UI (the `retrySync` server action already exists),
  Health Check page, Settings diagnostics page, CSV/XLSX importer status
  vocabulary fix.

## Assumptions made in Phase 1 (flagged per hard rule #9)

- **`Removed` → `Request shared`.** The old 3-status enum had `Removed`;
  the new spec only has two statuses. Any existing row that was `Removed`
  is now `Request shared` (per the master prompt's explicit instruction).
  The migration keeps a list of which rows this touched in
  `_migration_001_removed_status_rows` for a one-time review.
- **`Urgent` priority → `High`.** The spec removes `Urgent` but doesn't
  say what existing `Urgent` rows should become; `High` is the closest
  equivalent. Flagging this in case a different mapping is wanted.
- **`assigned_to` (uuid → users) dropped in favor of `assign_to` (text)**,
  backfilled once from the user's name/email before the column is
  dropped, per the "no login, no users table dependency" decision.
- **CSV/XLSX importer (`services/sites.ts`) still writes whatever status
  string is in the file** (e.g. `Pending`) rather than the two-status
  vocabulary — that fix is explicitly Phase 4, section 7.3.
