# Rankviz Inhouse Request Tracker — V9 Five-Phase Upgrade

**Source:** latest V8.6 OAuth-diagnostics archive in the conversation, not an older V8.3 ZIP. This deliverable is a **candidate release**: code was modified and inspected locally; a dependency-backed Next.js `npm run build` and real Google/Supabase end-to-end operations could **not** be run in this environment. **Deploy to Vercel Preview first, not directly to production.**

## What's implemented

### Phase 1 — Reliability, scaling and sync
- Reconnect no longer attempts to sync 200 links in one server action. `Sync Next 25 Rows` processes a bounded page with a persistent cursor on the currently open partner dashboard; resumable during that browser session. Failed rows are reported, not deleted.
- Partner detail links are paginated (50 at a time) and exchange deals paginated (50 at a time), with **database-derived** all-record counters and per-deal progress. Old unallocated Live links are separately queried for the "Previously Given" selector.
- Added additive migration `database/migrations/014_v9_operations.sql`: indexes, aggregated SQL functions, monitoring, alerts and reporting tables. No update/delete/backfill of existing Guest Post Anchor or project records.
- The existing Sheet-to-app Apps Script remains as before. Automatic recovery from Google Sheet errors is **not** guaranteed; manual/batch retry remains available.

### Phase 2 — Dashboard and user experience
- Admin Dashboard includes actionable `Needs Attention`, Collaboration sync failures and Reports tiles.
- Collaboration list cards display **actual given/received Live, open deals, owed quantities**, and a limited history-based delivery indicator (only if there are 5+ received Live/rejected decisions).
- Added `/attention` and `/reports` sidebar navigation for admins, and paginated partner history.
- Placeholder **Flexible** KPI replaced by real open-deal count.

### Phase 3 — Link Intelligence
- Monitor both existing normal Requests and Collaboration links **with current status Live**, where a placement URL exists.
- Checks that the placement page is HTML, has an actual hyperlink to the target URL and uses the expected anchor; statuses `verified`, `missing`, `unreachable`, `unsafe`, `error`. A missing result is an **unconfirmed warning**, not an automatic deletion/change of Live status.
- Manual `Check backlink` on All Requests and `Check Link` on Collaboration Details; recent results shown on those pages. Monitoring history in dedicated tables.
- Network safety: http(s) only, no redirects, DNS IP checks block private/local ranges, size and time limits, no cookies or user credentials. Like all server-side fetchers, this is not a replacement for dedicated infrastructure egress restrictions, and complex JS-rendered pages may require manual review.
- Daily Vercel Cron (if enabled with `CRON_SECRET`) samples **up to 8 collaboration + 8 normal request links per run**. Large inventories take multiple days to rotate; adjustable when capacity is understood.

### Phase 4 — Workflow Automation
- Daily cron also generates in-app overdue request reminders and 7-day stale request reminders. These are **in-app alerts only**, not Gmail, Slack or push notifications.
- Admin `Needs Attention` view with "Mark Reviewed" controls; no changes to live statuses without an authorized manual action.
- Bulk collaboration link status updates (max 25 per batch), bulk normal request status updates (max 10 per batch), confirmation dialog, status validation, and existing Google Sheet sync paths. Partial failures displayed.
- Sync history remains logged by the existing integration; unusual conditions should be reviewed in Vercel logs.

### Phase 5 — Analytics & exports
- `/reports`: 12-month creation trend, partner given/received Live totals, open deal obligations and verification sample; team delivery table for last 90 days.
- `/api/reports/monthly`: admin-only UTF-8 CSV export with formula-injection escaping. No customer data goes to external services.

## Before deployment: do this **in order**

1. **Backup Supabase** using the Supabase project's backup/export controls. Record the currently working production Vercel deployment SHA; do not remove it.
2. In Supabase SQL Editor, verify prior **migrations through 013** have been applied. **Do not rerun all previous migrations.** Execute **only** `database/migrations/014_v9_operations.sql` once. The SQL is additive but does create new functions and indexes; review with a database owner first.
3. Run read-only `database/checks/003_v9_operations_readiness.sql`. Confirm all three tables and all six V9 functions appear.
4. In Vercel **Settings → Environment Variables**, confirm the existing Supabase, Google Sheets and OAuth secrets remain unchanged. Add new **`CRON_SECRET`** to **Production** and **Preview** (if testing cron in Preview). Generate a fresh random secret and keep it private (`openssl rand -hex 32`). **Do not use `TOKEN_ENCRYPTION_KEY` for this.**
5. Commit the **contents of `inhouse-request-tracker-main`**, not a nested duplicate folder, to GitHub. Create a separate **V9 branch** and open a PR. Run a Vercel **Preview Deployment** before merging into `main`.
6. In that GitHub/Vercel environment run `npm ci`, `npm run test:v9`, `npm run test:final`, `npx tsc --noEmit` and `npm run build`; if any fail **do not deploy production**. Local tests do not replace full build verification.
7. Perform the manual acceptance checks below on Preview with test records and test Google Sheets. Then merge and deploy Production.

## Acceptance checks (screens + backend)

| Phase | Test | Expected |
|---|---|---|
| 1 | Open a partner with >50 links, change pages | No missing counts, 50 visible records per page, exact deal fulfillment from all rows |
| 1 | Reconnect a partner sheet; click Sync Next 25 Rows repeatedly | No duplicated Sheet rows, cursor advances, failures surfaced |
| 2 | Admin Dashboard, Collaborations, sidebar navigation | Real counters and links to Attention/Reports; member navigation still restricted |
| 3 | Check one live backlink with correct anchor and target | `verified` stored in link-check table |
| 3 | Check a link with missing anchor / broken page | Review warning, not auto `Rejected` or deleted; no dangerous local-network requests |
| 4 | Make 1 test request overdue and 1 stale; run cron with auth | Only one alert per unique kind/entity, review controls work |
| 4 | Bulk-update 2 test requests and 2 test collaboration links | Correct statuses, logs and Google Sheets; source data preserved on partial failures |
| 5 | Reports table/chart and CSV | Counts agree with Supabase; only admin can access/export |
| Legacy | Create Project with Google Sheet URL & custom mapping | Correct spreadsheet/tab and mapping persist |
| Legacy | Create Request and update Guest Post Anchor via Apps Script | Existing A:H legacy sheet behavior remains intact |
| Legacy | OAuth Drive connection / Create Spreadsheet / collaboration single workbook | Google-owned spreadsheet has correct 3 tabs; Sheets sync works both ways after Apps Script setup |

## Vercel Cron setup

`vercel.json` schedules `GET /api/cron/operations` daily at **07:00 UTC**. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when the variable is present. Ensure your Vercel plan supports the configured frequency. In Vercel Project → Cron Jobs check whether the job was registered and review Function logs for failures. Missing `CRON_SECRET` causes an intentional HTTP 401. To disable automation immediately, remove the Cron entry from `vercel.json` and redeploy, or disable the Cron Job through Vercel controls; leave all database records intact.

## Rollback and safety

If Preview build fails: do **not** merge the branch. If production fails: roll back to the previous successful Vercel deployment. **Do not drop the new SQL tables or reset Supabase** as a quick rollback; migrations are additive and the old application should simply ignore them. Keep all previous OAuth secrets, token encryption key, Google Sheet IDs, Apps Script, and legacy data unchanged. Do not run bulk actions on real records until verified with sample records.

## Known limitations (not hidden)

- `npm ci` could not fetch the registry dependencies in the file-generation environment, so a full Next.js build and strict TypeScript check remain for **Vercel Preview**.
- Google Sheets API, Supabase and Google OAuth credentials were **not** used here; no external writes or live sync were performed.
- Cron handles limited batches and is **in-app reminders**, not email notifications. Links needing browser JavaScript or CAPTCHAs may not be verifiable with a static fetch; review them manually. Score shown on partner cards is a simple decision ratio, not a statistically validated reliability rating.
- Link monitoring restricts destination by DNS but is not a complete network-level SSRF sandbox; apply network egress protections for high-security deployments. Do not expose the Cron secret or service-role key.
- CSV reflects request **creation month and current status**; it does not claim that links became Live within that month.

## Exact local verification results

- Global TypeScript compiler AST parsed all application TS/TSX files without syntax diagnostics. Standard local named imports were checked. Generated `.next` types and CSS are excluded from the import check.
- `tests/v9-operations.test.mjs` passed its six feature regression cases. Pre-existing full test suite had 96 passing and one unable to start because npm package `zod` was unavailable.
- Full `npm run build` is **not confirmed**. See Vercel Preview build logs for the final TypeScript/Next.js result.
