# INHOUSE REQUEST

Phase 1 of the no-login Rankviz outreach request app. The database is the source of truth and the **Guest Post Anchor** Google Sheet is a server-side mirror.

## Phase 1 behavior

- No login, auth page, middleware redirect, or Supabase Auth flow.
- All Supabase access is server-side with `SUPABASE_SERVICE_ROLE_KEY`.
- Request statuses are exactly `Request shared` and `Live`; both directions are allowed.
- Priorities are `High`, `Medium`, and `Low` with `Medium` as the default.
- `Assign To` and `Shared With` are free text with autocomplete from previous request values.
- The browser-only **Who are you?** picker supplies `created_by_name` and `status_changed_by`.
- Creating a request writes the request to Supabase first, creates its linked `project_sites` row, then mirrors it to the mapped team-sheet tab.
- A Sheet failure never rolls back or loses the database request.
- New team-sheet rows are written to `lastRow + 2`, serialized with a Postgres lease lock.
- Status writes verify both Website (column A) and Anchor (column C) before changing Status (column F). A stale stored row is searched and repaired instead of trusted blindly.
- Missing mapped tabs are treated as `skipped`, not failed, and tabs are never auto-created.

## Environment variables

Copy `.env.example` to `.env.local` and set exactly these values:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
TEAM_SHEET_ID=
SHEET_WEBHOOK_SECRET=
```

`GOOGLE_SERVICE_ACCOUNT_JSON` is the **base64-encoded complete Google service-account JSON**. Share `TEAM_SHEET_ID` with that service-account email as **Editor**.

`SHEET_WEBHOOK_SECRET` is reserved for the sheet-to-site webhook. The webhook/trigger is completed in Phase 4; do not install the old simple `onEdit` snippet.

## Database

For an existing installation, run:

```text
database/migrations/001_phase1_core.sql
```

The migration is designed to be re-runnable. It:

- removes the legacy forward-only status trigger;
- maps `Request Shared` -> `Request shared`;
- maps legacy `Removed` -> `Request shared` and records affected request IDs in `migration_audit`;
- maps `Urgent` -> `High` and records affected request IDs in `migration_audit`;
- changes status/priority to text + CHECK constraints;
- converts assignment and audit identity fields to free text;
- adds request/team-sheet sync metadata and `project_sites.request_id` / `team_row`;
- creates the append lease lock RPCs;
- seeds/repairs the 19 current project mappings.

For a new database, `database/schema.sql` is the canonical Phase 1 schema.

To inspect migrated legacy rows after running the migration:

```sql
select *
from migration_audit
where migration_key = '001_phase1_core'
order by created_at, field_name, row_id;
```

## Local setup

```bash
npm ci
npx tsc --noEmit
npm run build
npm run dev
```

Open `http://localhost:3000`. The app redirects straight to `/dashboard` and has no login.

## Phase 1 manual acceptance checks

1. Pick a browser name from **Who are you?**.
2. Create a request with a mapped project. Confirm `requests` and a linked `project_sites` row exist before checking the Sheet.
3. Confirm Sheet columns are `Website | Opportunity | Anchor | DR | Traffic | Status | Note`, with the new row separated by one blank row.
4. Create the same normalized Approved Site + Anchor again. Confirm the duplicate warning offers **Save anyway** and **Cancel**.
5. Mark the request `Live`. Confirm DB, linked project site, Sheet column F, `request_logs`, and `live_date` update.
6. Revert it to `Request shared`. Confirm `live_date` is preserved.
7. Temporarily use invalid Google credentials. Create a request and confirm it remains in Supabase with `sync_state='failed'` and the UI offers **Retry sync**.
8. Map a project to a nonexistent Sheet tab and confirm the request is saved with `sync_state='skipped'` and the saved-here-only message.
9. Insert/sort rows in a mapped Sheet tab, then change status in the app. Confirm the row is found by Website + Anchor and `team_row` repairs itself before column F changes.

## Deferred by the agreed phase plan

Phase 2: inline site hint, Site Check, Search, Outreach OS CSV, import from team sheet.  
Phase 3: complete dashboard, project card grid/counts, My Requests, deadline visuals.  
Phase 4: webhook + installable Apps Script trigger, refresh/retry tooling, health check, diagnostics, and importer sheet-push update.
