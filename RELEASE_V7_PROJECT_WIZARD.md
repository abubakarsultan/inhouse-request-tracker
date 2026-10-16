# V7 — Project Setup Wizard, Configurable Sheets and Project-specific Apps Script

## What's new

- Four project categories: **Inhouse / Client / On Page / Others** with category filters and counts. Previous project records default to **Inhouse** via migration 007, so existing Guest Post Anchor and Get Pro Links entries appear there if already present in the database.
- Admin-only **Add Project / Edit Project** four-step wizard: **Basic info → Sheet source → Columns → Preview & save**.
- Inhouse projects can select the existing **Guest Post Anchor** workbook and a project tab, connect another spreadsheet by pasting its **Google Sheets URL**, or create a new spreadsheet through a Google service account (only where permitted).
- Sheet URL is parsed automatically: the app resolves the spreadsheet ID, selected tab ID, title, and headings; admin chooses the tab. This removes the manual Sheet ID field. For existing spreadsheets, the Google service-account email is displayed for Editor sharing.
- Configurable column builder, A–Z: add, remove, reorder, customize heading, map to Approved Site / Target URL / Anchor / Placement Page / Opportunity / DR / Traffic / Status / Note / Assigned To / Created By / Created By Email / Project Name / Date Created / Deadline / Priority, leave blank, or set static values.
- Live example-value **Sheet Preview**. New spreadsheets are initialized with the chosen headings on row 1. Existing spreadsheet headings and data are not overwritten by project creation.
- Each project card shows category, Sheet source/tab, request counts and status, plus **Open Project** and **Sheet Details**. Detailed project view also shows an overview and column mapping.
- **Sheet Details** exposes Sheet ID, Open Sheet link, sync configuration, column mapping, generated Apps Script, Copy Apps Script, and installation instructions. Removed the generic Apps Script controls from Settings.
- Project-specific Apps Script uses the mapped website/anchor/status columns, scopes events by spreadsheet and tab, handles multi-cell edits, and generates uniquely named trigger installers/handlers for projects sharing a workbook.
- Import and sync use saved per-project column mappings, while missing/unmanaged fields on existing rows are preserved during request edits.
- Existing shared Guest Post Anchor projects retain their historical A:H mapping and workbook-level trigger. Their mapping/tab cannot be accidentally reassigned in Edit Project. Existing request and Sheet rows are not migrated, deleted, or replaced.

## Deployment checklist

1. **Back up Supabase and the shared Guest Post Anchor Sheet before deployment.**
2. In Supabase SQL Editor, if not already applied, run migrations **001–006** in numeric order, then **007_project_categories_sheet_mapping.sql**, then **008_project_url_speed.sql**. **Do not rerun older migrations indiscriminately** if the database is already configured; check migration history first. V7 itself adds no new schema migration.
3. Ensure Vercel variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET` and `ADMIN_EMAILS` are configured as applicable. **Never put the service-account key or webhook secret into browser/public variables.**
4. Push the ZIP's `inhouse-build` contents to the root of the connected GitHub project, redeploy Vercel, and verify `/projects` and a project detail page.
5. In **Inhouse**, open one of the existing mapped projects and confirm its Guest Post Anchor tab and A:H columns; ensure the existing Sheet's webhook still updates request status.
6. Add a test **custom** project via URL, share its Sheet with the displayed service account as Editor, select a tab, test connection, verify and save its column mapping. Open **Sheet Details**, copy the generated script into that Google Sheet's **Extensions → Apps Script**, replace `PASTE_THE_SAME_SHEET_WEBHOOK_SECRET_HERE` with the actual server-side secret in Apps Script only, run **installProjectTrigger_[id]** once and approve Google's authorization. Avoid installing a second trigger for existing shared Guest Post Anchor projects.
7. Edit a status in that test Sheet and confirm matching app request changes. Also test Import, Add Request, refresh statuses, and page transitions with representative records.

## Important notes / limitations

- Existing 19 shared projects and **Get Pro Links** are retained **only if they already exist in Supabase**. This ZIP contains application code and non-destructive SQL, **not a live database export or re-import**. Live records cannot be verified from this environment.
- An existing custom Sheet's column mapping can be edited, but changing the physical layout does **not** automatically move existing Sheet cells. Update existing Google Sheet columns yourself after taking a backup, and test before enabling sync. Existing shared Guest Post Anchor A:H is locked.
- New Google Sheet creation requires Google API support for service-account creation and Drive sharing; some account setups refuse it. Errors are reported to the admin; the fallback is to create a Sheet in Google Drive and connect its URL.
- Google Apps Script triggers require Google's **one-time user authorization**. Generating and copying Apps Script from this app does not auto-install a trigger.
- The Apps Script secret must be configured within the Google script project; the app never exposes its server-side value.
- The Sheet source badge indicates saved configuration; **it does not represent a continuous health check** or claim that Google permissions have not changed.
- Full Next.js/Vercel production build could **not be performed locally** because required npm packages were not available in the environment. Tests and TypeScript/TSX syntax transpilation were run (see below); test the actual Vercel build before production rollout.

## Verification

- `node --experimental-strip-types --test tests/*.test.mjs` — **34/34 tests passed**.
- TypeScript/TSX syntax transpilation via TypeScript compiler API — **96 source files, zero syntax errors**.
- Live Supabase/Google API operations, Google script trigger installation, full `next build`, and deployed navigation performance are **not verified** here.

## Troubleshooting

- **Projects page fails to load:** verify migration 007 and 008 were applied and Vercel Runtime Logs for Supabase permissions or missing columns.
- **Shared Guest Post Anchor tabs not found:** verify `TEAM_SHEET_ID` points to the correct workbook, and service account has Editor access.
- **Custom Sheet access denied:** share the Sheet with the shown service-account email as Editor, refresh tabs, and retry connection.
- **New Sheet creation fails:** some service accounts cannot create/share new Drive files; create the Sheet manually and paste its URL instead.
- **Sheet webhook returns 401:** ensure the same `SHEET_WEBHOOK_SECRET` is used in Vercel and the generated Apps Script, then reinstall or authorize the project's named trigger.
- **Edit status fails only for custom project:** verify chosen tab, website/anchor/status column mapping, database migration 008, and that the installed script belongs to the right spreadsheet.
