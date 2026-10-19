# V6.2 — Projects runtime/render fix

## Issue reported
After the V6.1 Vercel deployment, `/projects` showed `Minified React error #441` inside the route error boundary. Error #441 is a generic React Server Component exception; the screenshot alone does not reveal the original server exception.

## Code issues identified and repaired

1. **Projects listing crashed if the database migration was not applied.** `getProjectsWithCounts()` used a new RPC named `project_request_status_counts` and threw on any RPC error (missing function, access failure, outage). This brought down the entire page, including Add Project and Edit Project. Now the projects list loads even when the count RPC is unavailable. The UI displays unavailable counts as `—`, never as misleading zeroes, with a migration notice. The failure is logged in Vercel server logs.
2. **Project Detail stats were using the wrong Supabase authorization context.** `getProjectSiteCounts()` called `project_site_status_counts` using the authenticated client even though migration 008 grants the function only to `service_role`. It now checks admin permission and calls the RPC through the server-only service-role client.
3. **Detail-page compatibility when database function is unavailable.** Four HEAD-only `count:exact` queries provide actual numbers for an individual project without downloading every row. If those also fail, the page indicates that counts are unavailable rather than crashing.
4. **Page-state resilience.** Safe handling of an unknown total in pagination, plus a readable production error boundary and error digest for log lookup.
5. **Regressions tests.** New tests verify the failure isolation and authorization context.

## Deployment checklist

1. Open **Supabase > SQL Editor** and ensure previous migration `007_project_categories_sheet_mapping.sql` was applied.
2. Run **`database/migrations/008_project_url_speed.sql`** if not already applied; you can also rerun it safely for this schema (uses `IF NOT EXISTS` and `CREATE OR REPLACE`). This is still needed for *fast/accurate project-list stats* and the `google_sheet_gid` column used by auto-setup.
3. Update the GitHub repository with the **contents** of `inhouse-build` (respect the Vercel Root Directory if configured).
4. Let Vercel build and deploy. A successful deployment is not sufficient: test `/projects` and then open a project.
5. Verify Projects list, Add/Edit Project, counters, and Detail page.
6. If a runtime error remains: in **Vercel > Project > Logs / Runtime Logs**, look for `[projects]` or `[project-detail]` messages or the digest shown by the error page. Collect the *sanitized* server exception text, not environment variable values/keys.

## Verification completed here
- 28/28 Node regression/source tests passed.
- All 97 TypeScript / TSX application files parsed and transpiled without syntax errors using a locally available TypeScript compiler.
- ZIP integrity verified after packaging.

## Verification limitations
A full dependency-based `npm run build` and live Vercel/Supabase integration test could not be performed in this environment: the npm package registry is unreachable (`EAI_AGAIN` during `npm ci`). A production deploy must still be verified by the user; exact live exception cannot be known from React error #441 alone without runtime logs.

**No stored projects, requests, or credentials were modified by this code patch.**
