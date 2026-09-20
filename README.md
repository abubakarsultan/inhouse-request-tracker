# INHOUSE REQUEST

Rankviz's internal outreach request management SaaS — replaces the
"Inhouse Request Tracker" and "Guest Post Anchor" Google Sheets.

Stack: Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres) · Vercel

> **No login.** Opening the site opens the tool directly. There is no sign-in page, no session, no cookies. All database access happens on the server with the Supabase service-role key, so anyone who has the site URL can use it — keep the URL private.

## 1. Supabase setup

1. Create a Supabase project.
2. Open the SQL editor and run the entire contents of `database/schema.sql`. This creates every table, the forward-only status-transition trigger, and Row Level Security policies.
3. Grab your `Project URL` and `service_role` key from Settings → API. (The anon key is no longer used.)

## 2. Environment variables

Copy `.env.example` to `.env.local` (or set these in Vercel → Project → Settings → Environment Variables) and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON` / `SHEET_WEBHOOK_SECRET` — only needed for the Google Sheet sync, see below. The app runs fine without them; sync is simply skipped and logged.

## 3. Run it

```
npm install
npm run dev
```

Open http://localhost:3000 — it goes straight to the dashboard.

## 4. Google Sheet sync (two-way)

**App → Sheet:** when a request's status changes, or a project site's
status changes, the app looks up the matching row (by Website) in the
project's Guest Post Anchor tab and updates column F (Status). This
needs a Google service account:

1. Google Cloud Console → create a service account → generate a JSON key.
2. Share the Guest Post Anchor spreadsheet with the service account's `client_email` (Editor access).
3. Base64-encode the key file and set it as `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. On the project's edit dialog (Projects page), fill in the spreadsheet ID (from its URL) and the exact tab name, and turn sync on.

**Sheet → App:** paste this into the spreadsheet's **Extensions → Apps
Script**, replacing `YOUR_APP_URL`, `YOUR_PROJECT_ID` and
`YOUR_WEBHOOK_SECRET` (the project ID is visible in the project's edit
dialog / database row; the secret is whatever you set `SHEET_WEBHOOK_SECRET`
to):

```javascript
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (e.range.getColumn() !== 6) return; // column F = Status
  var row = e.range.getRow();
  if (row === 1) return;
  var website = sheet.getRange(row, 1).getValue();
  var status = e.range.getValue();

  UrlFetchApp.fetch('YOUR_APP_URL/api/sheet-webhook', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sheet-webhook-secret': 'YOUR_WEBHOOK_SECRET' },
    payload: JSON.stringify({
      projectId: 'YOUR_PROJECT_ID',
      website: website,
      status: status,
      sheetName: sheet.getName(),
      sheetRow: row,
    }),
  });
}
```

This fires on every edit to the sheet and keeps `project_sites` (and
`sync_logs`) in the app up to date instantly — no polling needed.

## Modules

- **Auth** — none. The login screen, middleware and seed route were removed.
- **Projects** — CRUD (admin-only write), search, enable/disable, and the Outreach OS ↔ Guest Post Anchor tab-name mapping the old NAME_MAP used to hold.
- **Project detail (`/projects/[slug]`)** — the Website / Opportunity / Anchor / DR / Traffic / Status / Note table for that project (`project_sites`), fed by the importer and kept in sync with its Guest Post Anchor tab.
- **Requests** — full create form with the required-field validation from the spec; status can only move `Request Shared → Live → Removed`, enforced in the UI, in the server action, *and* by a Postgres trigger so it can never be bypassed. Every change is written to `request_logs`.
- **Import** — CSV/XLSX upload into a project's `project_sites`, validated against the required header row before anything is written; logged to `imports`.
- **Settings** — admin-only user directory (promote/demote, activate/deactivate).
- **Dashboard** — live counts pulled from the database (no hardcoded numbers).

## Notes / assumptions made while completing the spec

- The spec's table list didn't include a table for the per-project Website/Opportunity/Anchor/DR/Traffic/Status/Note data shown on `/projects/[slug]` and produced by the importer — that's `project_sites` in `database/schema.sql`.
- `projects.google_sheet_id` and `projects.active`, and `users.active`, were added to support "disable project" / "manage users" / "which spreadsheet to sync to", which the spec required functionally but didn't list as fields.
- Role-based UI: admins see Add/Edit/Disable on Projects and the Users table in Settings; members see everything else (Requests, Import, project detail) since the spec scopes "Member" to creating requests, viewing projects, and updating allowed fields.
