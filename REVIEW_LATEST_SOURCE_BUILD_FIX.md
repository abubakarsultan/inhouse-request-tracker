# Latest uploaded source — Vercel build fix and implementation review

Base: **user-uploaded `inhouse-request-tracker-main.zip`**, not a previous V8.3 archive.

## Confirmed reported failure

The ProjectCategoryManager imported `saveProjectCategory` and `deactivateProjectCategory` from `services/projects.ts`, but neither server action existed. Vercel compiled and then failed during TypeScript checking with TS2305 twice.

### Code fixes in this release

1. Implemented **admin-authorized** project-category actions in `services/projects.ts`: create/update, activate, deactivate, ordering, validation, and checks to prevent deactivation/renaming categories containing projects. The four default category identities/Sheet modes are protected.
2. Wired ProjectCategoryManager into the Projects page. Previously the new component was not rendered anywhere.
3. Changed category list and Add/Edit Project wizard to use active `project_categories` database records rather than only four hardcoded labels. Custom categories can now be selected for a project (their IDs resolve by slug).
4. Used FK/slug matching on Projects page and initial wizard selection for the **`On Page` versus `Onpage`** legacy naming difference, avoiding invisible projects. Kept legacy Guest Post Anchor project mappings unchanged.
5. Kept `guest_post_anchor` limited to categories with `sheet_mode = team_sheet_tab`, checked again on the server rather than trusting the client.
6. Fixed collaboration single-workbook template download permission: active members who can create a partner may download the `.xlsx` template; previously the endpoint required an administrator.
7. Use configured `NEXT_PUBLIC_SITE_URL` as the stable origin when generating Google Sheets Apps Script webhook URLs, falling back to the request origin for local development.
8. Added 3 focused category-regression tests in `tests/project-category-crud-regression.test.mjs`.

## Audited existing/new features (present in the uploaded source)

- **Google Drive OAuth** per user, encrypted refresh tokens; Create New Google Sheet in the connected user's own Drive.
- **Project wizard** supports existing team tab, creating a new team tab, connecting a custom Sheet, creating a custom Sheet, choosing columns and optional metrics, and showing a preview.
- **Failure recovery** stores new Sheet ID before subsequent configuration; error state and repair action exist. Creation and trigger activation are separate operations.
- **Collaboration** supports ratio-based exchanges, partner ownership checks, status counters, a template with **one XLSX workbook containing Rankviz, partner, Summary tabs**, a Google Sheet link, and per-partner script generation. Manual Sheet-to-App sync requires an installed/authorized Apps Script edit trigger.
- **Performance-oriented** pagination/aggregates and loading skeletons are present in multiple sections.

## High-priority items still needing real environment verification

1. **Run a genuine Vercel preview build.** `next build`/full TypeScript checking could not complete here because the npm registry was not accessible. All 146 source JS/TS files parsed syntactically and 386 named local imports were checked with no missing code imports. These are **not** a replacement for a successful production build.
2. **Database setup:** Verify existing migrations for project categories (`009_project_categories_sheets_roles.sql` / `009_project_category_ids.sql` depending on deployment history), Google Drive (`012`), Team Directory (`013`), and Collaboration (`010`). There are duplicate numeric migration prefixes; confirm what has already been applied. Do **not** blindly rerun everything or drop tables.
3. **Google Drive:** Test an admin creates a new project Sheet, it is owned by the connected Drive user, the service account is Editor, its headers/selected tab are correct, and any partial failure recovers instead of creating duplicates.
4. **Collaboration:** Confirm an active **non-admin** can download the XLSX, import exactly one 3-tab Google Spreadsheet, connect it, create a 2:1 exchange, and observe app -> Sheet and Sheet -> app status updates (latter requires trigger authorization).
5. **Cross-user access:** Check that a member cannot read another member's collaboration record or export its CSV by guessing the ID. Server-side checks exist, but must be verified against live policies.

## Next improvements (not claimed as implemented)

- Replace category edit/sheet-mode `window.prompt()` with a proper inline modal, and add optimistic UI feedback/undo or transactions for multi-row reordering.
- Add explicit **Test Connection** in the newly created Sheet recovery UI, including granular OAuth, service-account-sharing, tab-header and trigger health checks.
- Show setup steps as a checklist with completion states; don't imply Sheet creation also installed an Apps Script trigger.
- Add a background queue for Google Sheet writes and a visible sync-outbox/last-error dashboard; manual retry alone is not a strong long-term guarantee.
- Add cursor pagination and large-data exports for partners with >500 links / >250 deals in detailed tables (the current detail view intentionally caps history, while aggregate RPC is intended for counts). CSV export has its own 5000-row cap.
- Add integration tests using a staging Supabase and Google test account to cover RLS, migrations, API failures, duplicate prevention and OAuth reconnect.

## Tests and limitations

- Focused category tests: 3/3 passed; existing V7.4 category tests: 4/4 passed.
- Full local `npm run test:final`: **89 passed, 1 could not run**, because `tests/upgrade-009.test.mjs` imports `zod` but npm packages could not be installed. No assertion failure from that missing dependency is claimed as passing.
- TypeScript parser: 146 TS/JS source files, **0 syntax diagnostics** at the time of audit.
- Named local import scan: 386 imports checked; no missing named local exports. Three excluded expected non-JS references: global CSS and Next-generated `.next/types` declaration files.
- No live Supabase, Google Drive, Apps Script, or successful full Vercel build was available here.

## Deployment

1. Back up source + current Supabase data, then deploy this ZIP to a **Vercel preview** rather than immediately replacing production.
2. Check the preview build for TypeScript errors. This change requires **no new migration**, but category management depends on an existing `project_categories` table with `id, name, slug, sheet_mode, sort_order, active`.
3. Verify `/projects` (new category, assign, reorder, deactivate empty category); ensure Inhouse existing projects and On Page projects are visible.
4. Verify Create New Sheet and Collaboration single XLSX template flow with a test project/partner; install/authorize Apps Script only where necessary.
5. Promote preview if successful; otherwise roll back to the prior deployment and share the first exact error message.
