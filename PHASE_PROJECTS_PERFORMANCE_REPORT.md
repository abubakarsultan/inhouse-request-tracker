# Phase: Projects, Sheet Management, and Navigation Performance

## 1. What I built

- Added four fixed project categories: **Inhouse**, **Client**, **On Page**, and **Others**.
- Explicitly mapped the current 19 Inhouse projects, including **Get Pro Links**, to the Inhouse category.
- Added project-level `sheet_source` so Sheet behavior is no longer inferred only from the category.
- Inhouse Add Project now supports:
  - Guest Post Anchor
  - Existing Google Sheet
  - Create New Google Sheet
  - Tool Only
- Guest Post Anchor project creation can load existing team-sheet tab names and creates a missing tab using the standard A:H template when the project is saved.
- Added a **Sheet & Sync** dialog to project detail pages. Google Sheet links, connection testing, missing-tab creation, and Apps Script are behind this control instead of being rendered as a large code block on the page.
- Apps Script in Settings is now hidden behind **View Apps Script** and is generated with the current site URL only when revealed.
- Added an admin-only **Create Missing Tab** action for Guest Post Anchor projects.
- Updated project-sheet synchronization to respect project-level Sheet source for team sheets and project-owned sheets, including edit/archive row verification.
- Reworked Projects into four category tabs with local search and 3-column desktop project cards.
- Project counts now use database aggregation instead of loading all request rows into application memory.
- Paginated All Requests and project detail rows to reduce initial payloads and database work.
- Optimized Team & Approvals counts with a database aggregation RPC.
- Optimized request autocomplete loading with a database-side distinct query.
- Optimized Site Check with an indexed normalized-host lookup and exact host matching.
- Settings diagnostics now load in the background instead of blocking the Settings page on Google connection checks.
- Health, Projects, Requests, Team, and Create Request heavy data sections now use streaming/loading boundaries so navigation gives immediate visual feedback.
- Added a max content width so the tool stays readable on very large monitors instead of stretching indefinitely.
- Updated the canonical `database/schema.sql` and project documentation.

## 2. Files added / changed / deleted

### Added
- `database/migrations/010_project_sheet_sources_and_performance.sql`
- `tests/project-management.test.mjs`
- `app/api/diagnostics/route.ts`
- `components/app/projects-browser.tsx`
- `components/app/project-sheet-settings-dialog.tsx`
- `components/app/settings-diagnostics.tsx`
- `components/app/settings-script-panel.tsx`
- `components/app/pagination.tsx`

### Changed
- `database/migrations/008_search_trgm_index.sql`
- `database/schema.sql`
- `lib/validators.ts`
- `services/projects.ts`
- `services/google-sheet-sync.ts`
- `services/requests.ts`
- `services/sites.ts`
- `services/site-check.ts`
- `services/team.ts`
- `services/health.ts`
- `app/(protected)/layout.tsx`
- `app/(protected)/projects/page.tsx`
- `app/(protected)/projects/[slug]/page.tsx`
- `app/(protected)/requests/page.tsx`
- `app/(protected)/requests/new/page.tsx`
- `app/(protected)/health/page.tsx`
- `app/(protected)/settings/page.tsx`
- `app/(protected)/team/page.tsx`
- `components/app/project-form-dialog.tsx`
- `tests/upgrade-009.test.mjs`
- `README.md`
- `CHANGELOG.md`

### Deleted
- `components/app/client-sheet-script.tsx` (replaced by the hidden Sheet & Sync / Settings controls)

## 3. SQL to run

Use the migrations in this order on the Supabase database:

1. `database/migrations/009_project_categories_sheets_roles.sql` - already part of the previous phase; only run if it has not been applied.
2. `database/migrations/008_search_trgm_index.sql` - **updated and corrected**. It now stores a normalized `search_document` and uses a GIN trigram index instead of trying to index a non-immutable `concat_ws` expression.
3. `database/migrations/010_project_sheet_sources_and_performance.sql`

The new 010 migration adds the four categories, project-level Sheet source, pagination/count RPCs, autocomplete RPC, exact-host Site Check support, and supporting indexes.

**Important existing issue:** migration `007_domain_unique_index.sql` is still blocked by the duplicate project/domain rows already present in the database. I did not silently delete or choose a winning row. The duplicates need to be reconciled before the 007 unique index can be created.

### New environment variables

No new environment variables were added. The existing variables continue to be used:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `TEAM_SHEET_ID`
- `SHEET_WEBHOOK_SECRET`

## 4. How I verified it

### Syntax

Passed TypeScript/TSX transpile syntax check for **23 changed/relevant files** using the installed TypeScript parser.

### Targeted regression tests

Passed:

- `tests/project-management.test.mjs`
- `tests/ux-performance.test.mjs`
- `tests/phase4-sync.test.mjs`

Result: **10/10 tests passed**.

### Full pattern-based suite

`npm run test:final` ran **24 tests: 23 passed, 1 failed**.

The single failure is environmental, not an assertion failure: the sandbox dependency installation was incomplete and `node_modules/zod/index.js` was missing when `tests/upgrade-009.test.mjs` imported `lib/validators.ts`.

### Production build

`npm run build` could not be completed in this sandbox because the dependency installation did not finish with a usable `next` package. I therefore do **not** claim that the current phase passed the production build locally.

### Other checks

- Repository NUL-byte scan for `.ts`, `.tsx`, `.sql`, `.gs`, `.mjs`, and `.md`: **clean**.
- Project Sheet source references were checked across project creation, synchronization, health checking, and Site Check paths.
- No `node_modules` or `.next` directory is included in the delivery ZIP.

## 5. Assumptions / behavior decisions

- The 19 current Guest Post Anchor projects, including **Get Pro Links**, are treated as **Inhouse**.
- `Onpage` remains the stable database slug but displays as **On Page** in the UI.
- Sheet source is now a project-level setting. The four categories no longer force a single Sheet implementation for every project.
- Existing Inhouse projects with a Guest Post Anchor tab are mapped to `guest_post_anchor` by the migration.
- For new Inhouse projects, Guest Post Anchor is the default source; the admin can instead choose an existing project Sheet, create a new project Sheet, or keep the project tool-only.
- Apps Script remains available, but it is intentionally hidden behind explicit admin controls to keep normal project and Settings pages clean.
- Existing request/status/domain rules were preserved. The known 007 duplicate-data problem is not silently auto-resolved.

## 6. Improvement 5 - linear health-check scan cost

The health check still has a fallback linear scan when a stored Sheet row no longer matches and it must search the cached tab rows for the matching website + anchor. The realistic worst-case work is approximately:

**largest-tab-row-count x number-of-mismatched-requests-in-that-tab**.

At current outreach volumes this is an admin-triggered repair/check path and is still reasonable. It is a **revisit-later** optimization, not an urgent performance problem today. A per-tab Map keyed by normalized website + anchor would be the next optimization if the largest tab grows substantially or health checks begin finding many mismatches at once.
