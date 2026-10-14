# CHANGELOG — INHOUSE REQUEST upgrade foundations

## Added files

- `database/migrations/009_project_categories_sheets_roles.sql` — idempotent category seed/backfill, per-project sheet metadata, sheet-only request flags, viewer enum value, audit table, indexes, aggregate RPC and RLS policies.
- `UPGRADE_GUIDE.md` — simple Roman Urdu + English operational guide, migration steps, API enablement, deploy/rollback steps and current verification limitations.
- `tests/upgrade-009.test.mjs` — tab-name, incomplete-field and webhook compatibility tests.

## Changed files

- `database/schema.sql` — appended migration 009 definitions so fresh installs include the new schema.
- `lib/auth-types.ts` — added `viewer` role.
- `lib/auth.ts` — recognizes viewer profiles, permits approved viewers without a sheet-name mapping, and preserves manually changed roles instead of re-applying `ADMIN_EMAILS` on every profile upsert.
- `lib/validators.ts` — added project sheet metadata validation fields, Google tab-name validation and shared incomplete-field helper.
- `lib/sheet-webhook.ts` — supports `spreadsheetId`/`liveLink`, accepts sheet-only `Removed`, and keeps the old payload format.
- `services/google-sheet-sync.ts` — added Inhouse tab creation with headers/format/status validation; added own-sheet connection test/create helper; webhook can set/clear `sheet_flag` while preserving request status for `Removed`.
- `services/projects.ts` — added category listing and management actions, project category assignment/backfill use, Inhouse tab creation attempt, own-sheet connection metadata and stopped forcing `google_sheet_id` to null.
- `components/app/project-form-dialog.tsx` — category dropdown, own-sheet connection fields, service-account email display/copy, and category-change warning.
- `components/app/project-category-manager.tsx` — basic admin category create/edit/reorder/activate/deactivate UI with protection against deactivating categories that still have projects.
- `app/(protected)/projects/page.tsx` — category tabs/counts and category label on project cards; viewer-safe read-only project list.
- `app/(protected)/projects/[slug]/page.tsx` — viewer-safe read-only project detail rendering.
- `services/requests.ts` — viewer read-only company dashboard counts, mutation helper usage, and role-aware All Requests access.
- `app/(protected)/requests/page.tsx` — viewer read-only controls, incomplete-only filter, and Removed/Incomplete badges on the site cell.
- `app/(protected)/requests/new/page.tsx` and `app/(protected)/requests/[id]/edit/page.tsx` — block viewer access to mutation pages.
- `services/team.ts` — viewer onboarding approval, role change support, last-active-admin safeguards, and role/status/mapping audit records.
- `components/app/onboarding-name-selector.tsx` and `app/onboarding/page.tsx` — viewer onboarding option.
- `components/sidebar.tsx` — role-aware viewer navigation.
- `app/(protected)/team/page.tsx` — read-only viewer team directory.
- `components/app/team-admin-panel.tsx` — role dropdown and access-change history.
- `services/search.ts` — viewer search uses company-wide read query.
- `services/sites.ts` and `services/health.ts` — read-only viewer access to project site and health data.
- `app/(protected)/health/page.tsx` — viewer read-only health page.
- `app/(protected)/dashboard/page.tsx` — viewer company dashboard with Removed/Incomplete KPI links.
- `apps-script/SheetStatusWebhook.gs` — team-sheet trigger accepts `Removed` as a sheet-only state.
- `tests/phase4-sync.test.mjs` — updated webhook expectations for the new sheet-only flag.
- `package.json` and `package-lock.json` — replaced `latest` dependency ranges with versions already recorded in the lockfile.

## Assumptions

- All existing projects are assigned to the seeded `Inhouse` category to preserve existing behavior.
- `Removed` is a sheet-only flag and must never be written into the tool's request-status enum/check constraint.
- Viewer accounts are read-only and do not need a Guest Post Anchor sheet-name mapping, but still require admin approval.
- Existing sheet data must never be renamed or deleted automatically when a project category or tab name changes.
- Google service-account credentials remain server-only; only the service-account email may be shown in the UI.

## Verification / performance notes

- `node --experimental-strip-types --test tests/phase4-sync.test.mjs` passed in the available environment.
- `npm ci` did not complete in the available environment, so `npm run build` and the full test suite could not be verified here.
- Before/after query counts, payload sizes and navigation timings were not benchmarked; no performance improvement is claimed.
- This package is **not yet the complete implementation** described in the original prompt. See the remaining items in `UPGRADE_GUIDE.md` before considering production deployment.

- `components/ui/dialog.tsx` — constrained dialogs to the viewport and made the content region vertically scrollable; fixes long New Project forms on smaller screens.
- `lib/sheet-webhook.ts` — added a Client/Onpage Apps Script generator that resolves Status, Live Link, and Anchor by header names and sends spreadsheet ID + tab + row to the webhook.
- `components/app/client-sheet-script.tsx` — added copyable script and simple installation steps on project pages.
- `app/(protected)/projects/[slug]/page.tsx` — shows the client sheet setup panel to admins for projects with a configured separate sheet.
- `tests/upgrade-009.test.mjs` — added structural checks for the client script and scrollable dialog.
<<<<<<< HEAD

## Project management and performance refresh

- Added four fixed project categories in the UI: Inhouse, Client, On Page, and Others.
- Added explicit per-project Sheet source selection: Guest Post Anchor, Own Google Sheet, or Tool only.
- Inhouse project creation now defaults to the central Guest Post Anchor workflow and can select/type the project tab; own-sheet projects can use an existing sheet or create a new one.
- Moved Apps Script setup behind Sheet & Sync / Settings actions instead of rendering integration code on every project/settings page.
- Added project Sheet connection testing and admin-only missing Guest Post Anchor tab creation.
- Reworked Projects into a client-side category/search browser with 3-column desktop cards and project-level counts from the database RPC.
- Paginated All Requests and project detail rows to avoid loading entire histories during navigation.
- Moved Settings diagnostics into a background API request and streamed Health, Projects, Requests, and Create Request data behind loading states so navigation gives immediate visual feedback.
- Optimized Team & Approvals counts with a database aggregation RPC and optimized autocomplete loading with a database-side distinct query.
- Added explicit project Sheet source metadata and search-document/trigram support migrations.
=======
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
