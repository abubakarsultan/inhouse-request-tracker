# UX + Performance Patch Report

## What changed

### My Requests
- Restored `My Requests` to the sidebar for both members and admins.
- Renamed admin company-wide `Requests` navigation to `All Requests`.
- Members visiting `/requests` are redirected to `/my-requests`.
- Added KPI cards, quick status tabs, search, Project/Priority/Deadline/Source filters, sorting, URL-preserved filters, 25/50/100 page size, and Previous/Next pagination.
- Imported rows keep an `Imported` badge and failed Sheet sync stays visible.
- Status changes update the row/KPIs without a full `router.refresh()` on My Requests.
- Archive removes the row from My Requests without a full-page refresh.

### Navigation feedback
- Added a top route progress indicator for internal links and programmatic My Requests filtering.
- Added protected-route and My Requests skeleton loaders.
- Added a short page-enter transition and pressed states on sidebar/actions.
- Respects `prefers-reduced-motion`.

### Backend performance
- Normal protected navigation no longer upserts the profile / `last_login_at` on every page. OAuth callback still creates/refreshes the profile on sign-in.
- Added request-scoped auth/profile caching so layout + page share the same auth lookup.
- Member Dashboard now uses one compact DB summary RPC instead of loading all member requests.
- My Requests uses a server-side paginated/filterable RPC and loads only the current page.
- Admin Dashboard uses a compact aggregate RPC instead of multiple count queries plus a full request-status scan.
- Admin attention counters no longer scan every active request in Node.js.
- Added partial indexes for active assigned-user/status/deadline/project request paths.

## Database

New migration:

`database/migrations/006_my_requests_performance.sql`

No new environment variables.

## Verification

- `npm run test:final`: 20/20 passed after this patch.
- TypeScript `transpileModule` syntax pass: 88 TS/TSX files, 0 syntax errors.
- Local `@/` import integrity: 0 missing local imports.
- Full `tsc --noEmit` could not complete in this container because the npm install timed out and left the React/Node type packages incomplete. Do not treat that as a successful package-backed typecheck; Vercel deployment remains the final compile check.
