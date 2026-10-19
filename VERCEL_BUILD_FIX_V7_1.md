# V7.1 — Vercel TypeScript build fix

## Reported error

`services/google-sheet-sync.ts(924,9): error TS2322: Type 'string | null' is not assignable to type 'string'.`

## Fix

In `readTeamSheetProjectRows()` the `TeamSheetProjectRow.note` field is declared as `string` and the reader `readCell()` always returns a string, but `|| null` changed the type to `string | null`. Removed `|| null` from that assignment.

Empty notes are still stored as `null` by `importFromTeamSheet()` in `services/sites.ts`, which has an explicit `const note = row.note || null;`. This avoids changing the persisted data representation and preserves existing mapping/import behavior.

## Deploy

1. Update the GitHub source from this ZIP's `inhouse-build` folder.
2. Commit and push to `main` and let Vercel build.
3. No Supabase migration is needed for this type-only source fix.
4. Verify `/projects`, an existing Inhouse project, and a new project's Google Sheet mapping after deployment.

Run `npm ci && npm run build` locally to check all TypeScript errors before deploying if npm registry is accessible.
