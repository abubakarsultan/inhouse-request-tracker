# Phase 1 Report

## Built

- Phase 1 migration + canonical schema for two reversible request statuses, three priorities, free-text ownership, sync metadata, project-site links, migration audit, append lock, and the 19 NAME_MAP projects.
- DB-first request creation with duplicate override, linked `project_sites`, Google Sheet mirror, skipped/failed/synced outcomes, and Retry sync.
- Canonical `setRequestStatus` used by request controls, with `live_date` preservation, project-site update, request log, verified Sheet row repair, and best-effort Sheet failure handling.
- Global server-only Google Sheet integration using `TEAM_SHEET_ID`, service-account credentials, retries, metadata cache, exact A/C row verification, and serialized `lastRow + 2` writes.
- Browser-only Who-are-you picker plus free-text Assign To / Shared With autocomplete.
- Phase 1 UI vocabulary/design-token pass and mobile navigation. Old user-management/status widgets and session helper removed.

## SQL

Run `database/migrations/001_phase1_core.sql` on the existing Supabase database. `database/schema.sql` is the canonical fresh-install schema.

Legacy mappings made by the migration:
- `Request Shared` -> `Request shared`
- `Removed` -> `Request shared`
- `Urgent` -> `High`

Rows changed from `Removed`/`Urgent` are recorded in `migration_audit`. This workspace does not have the production Supabase credentials, so their actual request IDs cannot be listed until the migration is run.

## Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `TEAM_SHEET_ID`
- `SHEET_WEBHOOK_SECRET`

## Verification performed

- Read the complete updated Next.js source and the complete supplied Apps Script specification before implementation.
- Static TypeScript/TSX syntax parse: 35 files, 0 syntax errors.
- Local import integrity scan: 0 missing local imports.
- Old application vocabulary/auth sweep: no old request status/priority/auth dependencies remain in application code.
- Project mapping cross-check: all 19 seed mappings match Apps Script `NAME_MAP`.

`npm ci` could not complete in this execution environment because npm registry DNS resolution failed (`EAI_AGAIN`), and offline install also failed because packages were not cached. Therefore `npx tsc --noEmit` and `npm run build` could not be validly completed: their failures are dependency-missing failures (`next`, `react`, etc.), not a claimed application test pass. Run the commands below in an environment with npm registry access:

```bash
npm ci
npx tsc --noEmit
npm run build
```

Live Supabase migration and Google Sheet writes were not executed because production credentials were not provided in the attached project.
