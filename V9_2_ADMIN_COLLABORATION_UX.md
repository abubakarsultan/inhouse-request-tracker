# V9.2 — Admin & Collaboration UX Upgrade

## Source
Based on the V9.1 TypeScript-fixed application ZIP. No existing project, request, partner, collaboration, or Google Sheets data is mutated by installing this source. Database migration 014 remains required for V9 operations; **no new V9.2 SQL migration**.

## Implemented
1. **Projects**: Admin-only `...` menu with Archive, Restore and Permanently Delete. Archived view under Projects lets administrators restore items. Non-admin users only see active projects in the Projects listing. Category management sits behind an expandable admin disclosure.
2. **Collaborations**: Team-member accordions list all active team members (including team members with zero partners); expanding a member shows their partners, and expanding a partner shows live given/received, obligations, exchange ratio and Sheet state. Clicking Open Partner Details navigates to the existing full dashboard. Search by partner/team name, and admin-only Show archived checkbox.
3. **Partner management**: Admin-only Archive/Restore/Delete. Archived partners do not appear in ordinary team member lists; non-admin access to archived partner operations is blocked. Partner owner assignment on the detail page remains supported.
4. **Safe permanent deletion**: To permanently delete, an admin must type the exact item name. Projects with any linked requests or site rows, and collaboration partners with any linked links/deals, **cannot** be deleted; the app explicitly recommends Archive. Database foreign keys still enforce additional restrictions. No Google Drive files or Sheets are ever deleted by these actions.
5. **Admin Team screen**: Three focused sections: Team members, Invitations, Access & directory. Previous controls and logic remain mounted only in their chosen visible tab.
6. **UI affordances**: Buttons and links use hover states, pointer cursors, keyboard focus rings, expanded-state arrows, disabled/loading feedback and explicit destructive confirmation.

## Testing and limitations
- 159 TS/TSX files parsed with no syntax errors.
- 11 targeted tests pass, including 5 specific V9.2 regression checks.
- Existing runnable test suite: 109 passed, 1 skipped when excluding the older dependency-blocked upgrade-009 test. The original upgrade-009 requires the local Zod dependency, which this environment could not install.
- Full dependency-backed `next build` / `tsc --noEmit` and live Supabase RLS tests have **not** completed locally because npm dependencies are unavailable in this environment. Preview deployment is mandatory before Production.
- Unlike a full data-deletion workflow, Delete Permanently intentionally only handles *empty* records. For anything with history, use Archive. Google Sheets remain unchanged.
- No new database columns/tables are needed. Existing project `active` and collaboration partner `active` flags are reused.

## Safe deployment checklist
1. Back up Supabase. Confirm migrations through **014** are applied before using existing V9 pages; do NOT re-run completed migrations.
2. Extract ZIP and copy **contents** of `inhouse-request-tracker-main/` to a new Git branch (for example `v9-2-admin-ux`) without putting a second nesting folder into the repo root.
3. Run `npm ci`, `npx tsc --noEmit`, `npm run build` and `npm run test:v9` in an environment with packages installed.
4. Deploy the new branch to Vercel Preview; do not replace Production until build and smoke tests pass.
5. Verify active and archived Project tabs, Archive/Restore, empty-project Delete and refusal to delete a project with requests.
6. Verify Collaborations member accordion with 0, 1, multiple partners; owner grouping, partner details; Archive/Restore and refusal to delete a partner with deals or links; non-admin restrictions.
7. Verify Admin tabs, invitation operations, roles, team directory, Google OAuth, Create Project, Create Request, Guest Post Anchor sync, one-workbook Collaboration Sheet and V9 monitoring pages.
8. Merge approved branch to main for production deployment, and keep the previous successful Vercel deployment as rollback.

## Production operations
- `CRON_SECRET` is a V9 prerequisite for scheduled monitoring, **not** newly required for V9.2 UI. If already set, do not change it.
- Do not change the existing `TOKEN_ENCRYPTION_KEY`, Google OAuth credentials, Sheet IDs or webhook secrets.
- In the case of Vercel build/runtime errors, do not delete any data: inspect the error log, revert to the previous successful deployment if necessary, and reconcile on Preview.
