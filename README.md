# INHOUSE REQUEST

Final Phase 4 of the no-login Rankviz outreach request app. Supabase is the source of truth and the **Guest Post Anchor** Google Sheet is a server-side mirror with two-way status sync.

## Current behavior

### Core request flow

- No login, auth middleware, or Supabase Auth.
- All database access is server-side with `SUPABASE_SERVICE_ROLE_KEY`.
- Request statuses are exactly `Request shared` and `Live`; revert is allowed and `live_date` is never cleared.
- Priorities are exactly `High`, `Medium`, and `Low`.
- `Assign To` and `Shared With` are free text with autocomplete.
- Browser-only **Who are you?** supplies audit attribution; it is not authentication.
- Create request is DB first: `requests` -> linked `project_sites` -> team-sheet mirror.
- Team-sheet appends intentionally use `lastRow + 2` and are serialized with the DB lease lock.
- Stored Sheet rows are verified by normalized Website + Anchor before status writes; moved/sorted rows are searched and repaired.

### Form, search, checks, imports, exports

- Approved Site inline usage hint is debounced and never blocks save.
- Site Check uses exact normalized host matching and reads the app database, not Google Sheets.
- Search is normalized server-side, debounced, capped at 100 displayed results, and uses the canonical status action.
- Repeatable **Import from team sheet** reads mapped tabs A2:G and creates missing unlinked `project_sites` rows only.
- CSV/XLSX project-site import accepts `Website, Opportunity, Anchor, DR, Traffic, Status, Note`, normalizes status to the two-status vocabulary, and can optionally push imported rows to the team sheet. Sheet push is **off by default** and database inserts happen first.
- Outreach OS export uses the exact 9-column format, UTF-8 BOM, CRLF, trailing CRLF, and Asia/Karachi date selection.

### Views

- Dashboard: Total Requests, Live Links, Pending, Failed Sync, This Month, recent activity, last-7-days Live activity, per-project breakdown, failed-sync retry, and live Sheet reconciliation.
- Projects: responsive cards plus project detail `project_sites` table.
- My Requests: Assigned / Live / Pending / Overdue, next-7-days deadlines, and canonical Live/Revert controls.
- Health Check: read-only linkage scan for request <-> `project_sites` <-> team-sheet row, with explicit one-row **Re-link** repair.
- Settings: browser identity, Supabase/Sheets/webhook diagnostics, and a ready-to-copy installable Apps Script trigger snippet with the current site URL filled in.

## Team sheet -> site status sync

`POST /api/sheet-webhook` expects header:

```text
x-sheet-webhook-secret: <SHEET_WEBHOOK_SECRET>
```

and JSON body:

```json
{
  "tab": "getprolinks",
  "row": 12,
  "website": "example.com",
  "anchor": "example anchor",
  "status": "Live"
}
```

Lookup order is normalized `team_tab + website + anchor`, then `team_tab + team_row` as fallback. Incoming changes call the same `setRequestStatus()` function with Sheet push disabled, preventing ping-pong loops. `changed_by` is `team sheet` for webhook changes.

The team-sheet Apps Script must use an **installable edit trigger**. A standalone source is included at:

```text
apps-script/SheetStatusWebhook.gs
```

The Settings page renders the same snippet with the current site URL filled in. Replace the secret placeholder, paste it into the team sheet Apps Script project, then run `installTrigger()` once and authorize it. The handler is `onSheetEdit`, not a simple `onEdit`, so `UrlFetchApp` is permitted.

## Dashboard refresh and repair

**Refresh live status** reads Sheet column F for requests that have stored `team_tab/team_row`. Each row is verified by Website + Anchor; if sorting/insertion moved it, the matching row is found and the stored row is repaired. Valid Sheet differences are reconciled through `setRequestStatus()`. Invalid statuses or missing rows become visible failed-sync diagnostics rather than overwriting request status.

**Retry sync** updates an already-linked verified row when `team_row` exists. It only appends a new row when no Sheet row has ever been stored, avoiding duplicate rows after a status-sync failure.

## Environment variables

Copy `.env.example` to `.env.local` and set exactly:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
TEAM_SHEET_ID=
SHEET_WEBHOOK_SECRET=
```

`GOOGLE_SERVICE_ACCOUNT_JSON` is the base64-encoded complete Google service-account JSON. Share `TEAM_SHEET_ID` with that service-account email as **Editor**.

No additional Phase 4 environment variables were added.

## Database

For an existing installation, run migrations in order:

```text
database/migrations/001_phase1_core.sql
database/migrations/002_phase2_search.sql
database/migrations/003_phase4_sync.sql
```

`003_phase4_sync.sql` is re-runnable. It adds Sheet lookup/repair indexes and the normalized `find_request_from_sheet(...)` RPC used by the webhook.

For a fresh installation, use the current `database/schema.sql`.

## Local setup and final verification

```bash
npm ci
npx tsc --noEmit
npm run test:phase4
npm run build
npm run dev
```

Open `http://localhost:3000`. The app opens directly without login.

## Final production acceptance checks

1. Run migrations `001`, `002`, `003` in order and configure all five environment variables.
2. Open **Settings** and confirm Supabase, service account, team sheet, and webhook secret all show OK.
3. Create a Request shared request and confirm DB + linked `project_sites` + team-sheet A:G at `lastRow + 2`.
4. Mark it Live in the site and confirm DB, `project_sites`, request log, `live_date`, and Sheet F update. Revert it and confirm `live_date` remains set.
5. Edit Sheet F directly and confirm the site changes through `/api/sheet-webhook` without writing back to the Sheet.
6. Insert/sort Sheet rows, run **Refresh live status**, and confirm stored row repair plus status reconciliation.
7. Break Sheet credentials temporarily and confirm the DB change survives with `sync_state = failed`; restore credentials and use **Retry sync** without creating a duplicate Sheet row.
8. Run **Health Check** and verify clean rows show no problem; deliberately move one row and confirm Re-link repairs only the stored row pointer.
9. Import a small CSV/XLSX once with Sheet push off and once with it on; confirm both use only `Request shared` / `Live`.
10. Run `npx tsc --noEmit`, `npm run test:phase4`, and `npm run build` in the deployment environment before release.
