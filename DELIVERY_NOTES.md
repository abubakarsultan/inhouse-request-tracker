# Delivery notes — INHOUSE REQUEST review pass

## Verified in this session

- `node --experimental-strip-types --test tests/*.test.mjs`: **86 passed, 0 failed**.
- Source parsing check using global TypeScript with `--noResolve` found no TS1xxx syntax diagnostics. This is not a full typecheck.
- `tsc --noEmit`: **blocked** — missing type definitions for `node`, `react`, and `react-dom` after dependency installation timed out.
- `npm run build`: **blocked** — `next: not found` because dependencies are not installed.
- Google OAuth, Google Drive, Supabase migration execution and live collaboration flows were not run against real credentials. Do not infer they work from source tests.

## Included work

- Project dropdown statuses corrected to `Request shared`, `Live`, `Rejected`.
- Collaboration dropdown driven by `COLLAB_STATUSES`.
- Project Google connection preflight before draft insertion, draft cleanup when no sheet ID was saved, stored owner ID and retry/repair actions.
- Project card/detail setup state, error, create-sheet and retry-tab actions.
- OAuth callback URL requires `NEXT_PUBLIC_SITE_URL`; profile displays known and unknown Google result codes.
- Collaboration Fix access, Prepare this sheet, non-destructive existing-sheet preparation, owner assignment for legacy partner records and Apps Script details.
- Migration 013: team directory, safe signup hook, project owner/tab setup columns, dashboard incomplete/Removed fields and last-admin database guard.
- Rankviz vs guest login pages, cookie-selected sign-in mode, not-invited invitation request flow, invitation revocation, directory management, audit history, last-admin service checks.
- Guest Post Anchor new-tab creation with tab-name validation and retry; Client Live Link mapping preset and optional DR/Traffic; Removed flag and Incomplete helper/badges in the request list, search, project detail and dashboard.
- Loading skeletons added to previously uncovered protected routes. No before/after performance numbers are claimed because a comparable measurement run was not possible.

## Remaining gaps / do not treat as production-complete

- Full `tsc --noEmit` and `npm run build` must pass after `npm ci` on a machine with package access.
- Google OAuth and Drive sheet creation/permission-repair need manual end-to-end verification with production OAuth credentials, Supabase, service account, and a real owner account.
- Supabase migrations 012 and 013 have not been executed here; review and run them against a backup before deploy.
- The complete requested Phase 4 performance project (query/payload benchmarking, caching and all layout/page refinements) is not finished; no fabricated metrics are included.
- The Incomplete-only SQL filter can undercount rows whose only missing fields are project-specific DR/Traffic; the badges and dashboard helper account for these fields, but the filter needs a dedicated query/RPC for exact parity at scale.
- The full acceptance checklist has not been end-to-end tested; use the guide's manual checklist before production rollout.
