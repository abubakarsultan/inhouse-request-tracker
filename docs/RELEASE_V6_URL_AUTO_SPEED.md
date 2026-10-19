# Inhouse Request v6 — Google Sheet URL Auto-Setup + Performance

## What changed

1. **Project Add / Edit:** paste the full Google Sheets URL, not a separate Sheet ID. Project name and category are still needed. The app extracts the spreadsheet ID and `#gid` tab ID and uses the Google Sheets API to read the document title, selected tab name and header row.
2. **Editor access:** the Add/Edit dialog shows the Google service-account email from the existing `GOOGLE_SERVICE_ACCOUNT_JSON` environment variable, with a Copy button. Open your Google Sheet > Share > add this exact email as **Editor**. This is a display/copy action; the app does not automatically change your Google Drive sharing permissions.
3. **Mapping:** standard headers such as Website, Opportunity, Anchor, Status, Note/Assigned To, Created By Email are mapped automatically. Extra columns are left untouched on write. An empty sheet uses the default A-H mapping; the app fills missing header cells when a request is first synced. Existing custom mappings remain editable under Advanced settings.
4. **Google Sheet validation:** access errors identify the service-account email that needs sharing. Incorrect or non-Google URLs are rejected. When you copy a tab-specific URL, that exact tab is selected.
5. **Navigation optimization:** a local JWT verification path replaces avoidable Supabase Auth user-info lookups on every page, while the app still validates the user account status in the database. Major sidebar routes are selectively prefetched. Projects use a database aggregate rather than downloading all requests. All Requests returns 50 per page; project details show 100 rows per page with database counters.
6. **Sync isolation:** status webhooks now include the spreadsheet ID for custom projects, so two spreadsheets with the same `Sheet1` tab cannot update each other's requests. Legacy Guest Post Anchor payloads remain supported.
7. **Custom-sheet data flows:** refresh, project imports, and Health checks now select the correct project's sheet and configured columns rather than blindly reading the global team sheet. Google metadata caching supports multiple spreadsheets.
8. **Reliability:** dependency versions pinned to the versions in the existing lockfile, code tests expanded, project column validation tightened, and generated ZIP excludes dependencies and sensitive environment files.

## Mandatory one-time deployment instructions

1. **Supabase:** if this is an existing installation already running migration `007_project_categories_sheet_mapping.sql`, run **only** `database/migrations/008_project_url_speed.sql` in Supabase SQL Editor **before deploying**. It adds `google_sheet_gid`, aggregated statistics functions, spreadsheet-scoped webhook matching and indexes. New installs can use the updated `database/schema.sql` instead of replaying all migrations.
2. **Vercel:** push the updated `inhouse-build` source to your existing repository, keeping `package.json` and `package-lock.json` together. Redeploy your app. No new environment variables are required. Existing keys including `GOOGLE_SERVICE_ACCOUNT_JSON`, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET`, and Supabase keys must remain configured.
3. **Share each custom Google Sheet:** click Share, paste the service account email displayed by the app, assign **Editor**. The account must have access to the specified spreadsheet; a published read-only URL cannot be synced.
4. **For Sheet -> app status changes:** open the project > **Sheet Details & Apps Script**, paste the generated script into that particular Google spreadsheet (Extensions > Apps Script). Replace `PASTE_THE_SAME_SHEET_WEBHOOK_SECRET_HERE` with your existing Vercel `SHEET_WEBHOOK_SECRET`; run `installTrigger` and authorize it. **Regenerate/reinstall any older custom-sheet project trigger scripts** because the v6 payload includes the spreadsheet ID. This Google authorization is a one-time manual step per spreadsheet; the app does not install triggers for you.
5. **Smoke test:** Add a test project with a full URL including `#gid=`, create a test request, confirm it appears in the expected tab, update the status in Google Sheet and verify the app updates. Also test switching between Dashboard, Projects, All Requests, My Requests and a project containing more than 100 rows.

## Important constraints

- Existing project rows, requests and source spreadsheets are not deleted by migration 008.
- Google Sheet *read* access is checked when saving; the app cannot absolutely verify Editor-level write permission without a write operation. Confirm **Editor** in Share. Sync errors remain visible if Google rejects a later write.
- App Script installation and permission to run it cannot be automated with the current service-account integration.
- A nonstandard Sheet with no recognizable Website, Anchor or Status header receives a validation error. Rename those headings to recognizable labels and save again, then fine-tune Advanced mapping if needed.
- Do not copy credentials, private keys or a whole service-account JSON into the email field; only the **service-account email** must be shared.
- Network speed still depends on hosting region, Supabase response times and Google API availability. The optimizations remove known avoidable work, but do **not** guarantee zero latency. Measure after deployment before deciding whether to move Vercel/Supabase into closer regions.

## Validation in this ZIP

- Node built-in test suite: **24/24 passing** (`node --experimental-strip-types --test tests/*.test.mjs`).
- All TS/TSX source files parsed successfully with TypeScript 5.8 transpiler.
- A complete Next.js production build could not be verified in this environment: dependency download failed and the local `node_modules` tree was incomplete. **Run `npm ci && npm run build` in CI/Vercel before treating this as production verified.**
