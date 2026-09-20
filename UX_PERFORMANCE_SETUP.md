# UX + Performance Patch — Production Setup

This patch sits on top of Final V2. It does not change Google OAuth, the Sheets service account, TEAM_SHEET_ID, webhook secret, or the seven-person roster.

## 1. Run one new Supabase migration

Supabase → SQL Editor → New query.

Run the complete contents of:

`database/migrations/006_my_requests_performance.sql`

For a production database that already has Final V2 migration 005, run **only 006**. Do not rerun schema.sql or migrations 001–005.

006 adds only performance indexes and read-only service-role RPCs for:
- member dashboard summary
- paginated / filtered My Requests
- admin dashboard summary
- admin attention counters

It does not delete or rewrite request data.

## 2. Deploy the updated code

Push/replace the project code in GitHub and redeploy Vercel.

No new environment variables are required.

No Google Cloud, Supabase Auth, Apps Script, service-account, or webhook setup needs to be repeated.

## 3. Verify navigation feedback

Open the deployed app and click several sidebar pages.

Expected immediately after click:
- clicked nav item has a pressed/active response
- thin blue progress bar appears at the top
- route skeleton appears while server data is loading
- new page fades in quickly

## 4. Verify My Requests

Sidebar must show:

Member:
- Dashboard
- My Requests
- Create Request
- Site Check
- Profile

Admin:
- Dashboard
- Projects
- All Requests
- My Requests
- Create Request
- Search
- Site Check
- ADMIN section

Open My Requests and test:
- quick tabs: All / Pending / Live / Rejected / Overdue
- search: website / anchor / target URL / project
- Project filter
- Priority filter
- Deadline filter
- Source filter: Created in tool / Imported from Sheet
- sorting
- 25 / 50 / 100 rows per page
- Previous / Next pagination

Filters are kept in the URL so refresh/back navigation keeps the current view.

## 5. Verify instant actions

On My Requests:
- Mark Live / Reject / Revert changes the badge immediately and then shows Saved
- Archive shows an in-button loading state and removes the row without a full-page refresh
- Edit navigation shows the top progress indicator

## 6. Speed checks

Member Dashboard should load only KPIs, upcoming deadlines, recent 8 requests and project aggregates.

My Requests should fetch only the current page rather than the member's full history.

Admin Dashboard should use the new database summary RPC rather than loading all request statuses into Next.js.

Normal protected navigation should read the existing profile; it no longer upserts the user / last-login row on every page click.
