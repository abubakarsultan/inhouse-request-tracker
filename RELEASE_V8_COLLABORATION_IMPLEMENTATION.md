# V8 Collaboration Module — Implementation & Deployment

## Added to existing V7.5 source
- New sidebar **Collaborations** workspace for admins/team members.
- Admin Create Partner wizard: partner details, default flexible Given:Received ratio, automatic Sheet creation, CSV manual connection, or set up later.
- **Download CSV Templates (.zip)** with *Rankviz.csv*, *{Partner}.csv*, *Summary.csv*. Each file is imported into a different tab of **one** Google Spreadsheet. The link tabs have exactly: Date, Website, Placement Page, Anchor, Target Link, Status, Exchange ID. Summary has: Metric, Our Links, Partner Links. The app adds a hidden H (Record ID) technical column after connection to deduplicate row writes.
- Per-partner dashboard with Live given/received counts, deal-based outstanding commitments (including 2-for-1), pending/in-process/rejected statuses, links, deals and status controls.
- Add Link for Us or Partner directly from Collaboration workspace; connect an existing unallocated Live given link to a deal without counting it again.
- Normal **Create Request** has an optional Collaboration section: direct exchange, previously given link, or advance receipt. Base request saved first; atomic PostgreSQL RPC links it to a deal. Failed linking can be retried without creating a second normal request.
- Google Sheet creation with three tabs; manual URL connection validates names/columns and tests edit access; app→Sheet row writing and Summary refresh; Google Sheet→app status/data updates via a partner-specific authenticated Apps Script. Installable Apps Script is shown under Partner Details.
- Partner CSV data export (given, received, all) and per-link Retry Sync.
- Linked request status propagation: regular request status changes synchronize the associated collaboration link; collaboration status changes propagate to the linked request/project Sheet where possible.
- Legacy Guest Post Anchor and Projects code/records are NOT modified by migration 010.

## Deployment order (important)
1. **Backup Supabase first.** Confirm that database migrations 001–009 are already applied (in particular 009 for project category FK). Apply **only `database/migrations/010_collaboration_module.sql`** in Supabase SQL Editor. This migration adds independent collaboration tables, indexes, functions and RLS without rewriting existing Projects or Requests.
2. Extract this archive and deploy the **contents of `inhouse-build/`** to the existing GitHub repo (preserve existing Vercel environment variables and secret values). Vercel should perform its normal build.
3. Confirm the usual `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 credentials) is available, OR configure a Google OAuth account authorized for Sheets/Drive with `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (with Google Sheets and Drive file scopes). These OAuth variables are OPTIONAL; they are needed only if choosing OAuth-powered creation. **Do not paste secrets into the UI or share them in chat.**
4. Open `/collaborations` and create a test partner with a 1:1 ratio; test another deal with a 2:1 ratio.
5. For **manual CSV setup**: download the partner ZIP in Step 3; open one new Google Spreadsheet; File > Import > Upload each CSV as a NEW SHEET (not replace spreadsheet); rename tabs `Rankviz`, actual partner name (as shown in wizard), `Summary`; grant the configured Google service-account email Editor access; paste spreadsheet URL; connect. If an OAuth-owned account is connected, use its appropriate sharing permissions instead.
6. For **automatic creation**: choose Create Sheet Automatically. The app creates all three tabs, their headings, and Google connection. **Important limitation:** Some Google service accounts cannot create Drive files due to storage quota restrictions. In that case Google may reject the request; the partner is still saved in Setup Pending and the wizard gives recovery instructions. Connect with manual CSV, or configure an authorized Google OAuth user. Creating a Sheet does **not** automatically authorize Google's installable onEdit trigger.
7. From Partner Details, open **View Apps Script**, copy code into that spreadsheet's Extensions > Apps Script, run `installCollaborationTrigger` once under a Google account with edit access, and approve Google's permission prompt. The generated token is scoped to that partner. This manual Google authorization step is needed for **Sheet→App** edits. **App→Sheet** writes do not need this trigger.
8. Add a link in the app and verify it appears in the correct tab; update status in the app and in the Sheet; verify the matching record, Summary metrics, and original request (where linked). Test Retry Sync and downloads.

## Safeguards / constraints
- The database is source of truth. Only **Live** links fulfill a deal's Given/Received quota. Pending, In Process and Rejected are reported separately. Cancelled deals do not generate outstanding obligations.
- A link is allocated to at most one deal; previously given Live links must be unallocated. Deal/reference IDs match both sides.
- Project request entries and collaborator link entries are linked by an optional unique `request_id`; creating a collaboration link does not duplicate the original request.
- A Sheet row needs the generated **Record ID** (hidden column H) to sync from Google to the app. Ad hoc manually added Sheet rows without app-issued IDs will not automatically become requests: create such rows in the app first.
- Do not edit the Summary tab manually. Its values are recalculated from Supabase and overwritten on sync.
- CSV export escapes formula-leading characters to reduce spreadsheet injection risk.
- The connection checks the exact first 7 headers on both tabs and 3 Summary headers, and refuses to overwrite non-app column H data.
- All collaboration tables have RLS enabled and no direct user policies: only authenticated server actions / authenticated token webhook through the service-role Supabase client can read/write.
- Sheet edit trigger only has permission to update rows in the same partner's Spreadsheet/tab with a matching stable Record ID. The partner token should not be shared outside authorized Apps Script editors.
- For Google API transient/permission errors, data remains in Supabase and `Retry Sync` is available. Avoid concurrent retries of the same record.
- The partner details page currently displays up to 500 recent links and 250 recent deals; the dashboard counters use the database aggregation RPC across all records. For larger histories a dedicated paginated history page would be the next improvement.
- Automatic partner creation is **NOT** Google-app access authorization. Setting up full one-click Drive OAuth is an additional admin action (Google Cloud scopes, OAuth consent, refresh token storage).

## Verification performed in this environment
- **59 automated tests passed**: 52 existing regressions plus 7 collaboration-specific tests.
- **111 TypeScript/TSX sources passed a syntax/transpilation check** (not a TypeScript semantic typecheck).
- Generated template archive successfully passed `unzip -t` and contains 3 valid CSV files.
- **Full Next.js production build, remote Supabase migration and Google Sheets integration were NOT run locally**: package install timed out and production credentials are not available. Vercel compilation and real Sheet sync MUST be checked after deployment. If build fails, share the first TypeScript error line and log.

## Relevant new code
`database/migrations/010_collaboration_module.sql`; `lib/collaboration-core.ts`; `lib/collaboration-csv.ts`; `lib/collaboration-sheets.ts`; `lib/collaboration-status-bridge.ts`; `services/collaboration.ts`; `app/(protected)/collaborations/`; `components/app/collaboration/`; `app/api/collaboration/`; `tests/collaboration-v8.test.mjs`.

## Rollback
You may revert the deployed source to V7.5 if necessary. Migration 010 is additive; it does not change existing Request/Project rows. Do NOT delete populated collaboration tables as a rollback without a database backup and explicit migration plan.
