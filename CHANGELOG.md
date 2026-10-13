# Changelog — INHOUSE REQUEST upgrade foundation

## Added
- `database/migrations/009_project_categories_sheets_viewer.sql` — idempotent category seeds, project sheet metadata, request sheet flags, viewer enum value, audit table, indexes, category-deactivation safeguard, verification query.
- `lib/sheet-config.ts` — shared sheet header constants, header-name resolution, tab-name validation, and incomplete-field helper.
- `tests/upgrade-foundation.test.mjs` — tests for column resolution, tab names, and missing-field calculation.
- `UPGRADE_GUIDE.md` — Roman Urdu + English deployment and rollback instructions.

## Changed
- `database/schema.sql` — appended migration 009 logic so fresh installs receive the upgrade foundation.
- `lib/auth-types.ts` — adds the `viewer` role type.
- `lib/auth.ts` — normalizes viewer profiles and fixes `ADMIN_EMAILS` bootstrap so it only bootstraps an admin when the profile is first created; an existing manually changed role is not overridden.
- `lib/validators.ts` — accepts optional per-project category and sheet metadata fields.
- `services/projects.ts` — assigns legacy form-created projects to Inhouse by default and no longer forcibly nulls an existing Google Sheet ID during updates.
- `services/team.ts` — team role type includes viewer.
- `lib/sheet-webhook.ts` and `services/google-sheet-sync.ts` — webhook accepts `Removed`, preserves the tool status, and records a read-only request sheet flag.
- `package.json` — dependency versions pinned to versions already recorded in `package-lock.json`.

## Assumptions
- Existing projects should be categorized as Inhouse during migration, per the prompt.
- Existing project form submissions without a category continue to use Inhouse for backward compatibility.
- The `Removed` value is a sheet-only flag and must not become a tool request status.
- Existing production tables/data must not be dropped during rollback.
- The current repository ZIP is the baseline; no live Supabase, Google Cloud, or Vercel credentials were supplied, so external integrations cannot be verified from this workspace.

## Validation / known gaps
- No before/after DB query counts, payload sizes, or build measurements are claimed without running against the configured services.
- Full category-management UI, own-sheet Google Drive/Sheets lifecycle, per-project sync refactor, client-sheet Apps Script generator, complete viewer route/action enforcement, role-change audit UI, SQL aggregate performance refactor, and full UX redesign remain to be completed and integration-tested before this can be described as the complete implementation of the supplied prompt.
