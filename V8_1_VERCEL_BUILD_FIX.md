# V8.1 Collaboration Vercel build hotfix

## Root cause

The V8 ZIP accidentally had a shell heredoc (`TS`, `cat > components/app/collaboration/partner-actions.tsx <<'TSX'`) and the whole `partner-actions.tsx` client component appended to the end of `partner-wizard.tsx` instead of stored in its own file. This led to four linked Turbopack errors: misplaced `use client`, duplicate `useState`/`useRouter` imports, and an unresolved `partner-actions` module.

## Corrections

- Restored `components/app/collaboration/partner-wizard.tsx` as a standalone client component.
- Created `components/app/collaboration/partner-actions.tsx` containing `ConnectPartnerSheet`, `DealCreator`, `LinkCreator`, `LinkRowActions`, and `AllocateGiven`.
- Removed shell/heredoc artifacts from the TSX source.
- Added `tests/collaboration-build-files.test.mjs` to guard against recurrence.
- Preserved V8 collaboration functionality, SQL migration, and previous project/request features. No new SQL migration is required for **this build fix**.

## Validation performed

- `node --experimental-strip-types --test tests/*.test.mjs` — **61/61 tests passed**.
- TypeScript parser successfully parsed **115 JS/TS source files** with zero syntax diagnostics (before the additional test file was added).
- Both client components start with `use client`; imported partner-actions exports exist.
- ZIP integrity checked after packaging.

**Limit:** Full `npm run build` could not be performed in this environment: the npm registry DNS request failed with `EAI_AGAIN`, so dependencies could not be installed. Vercel deployment is required for full Next.js compilation and type-checking confirmation. Reported Turbopack errors were directly addressed, but later TypeScript errors may be exposed once compilation continues.

## Deploy

1. Extract the updated V8.1 ZIP. Copy the contents of `inhouse-build` to the repository root (maintain project paths).
2. Commit and push to GitHub `main` and redeploy on Vercel.
3. Confirm the `collaborations` pages compile and load. If a new error appears, share the **first error** in the Vercel build log.
4. Migration `010_collaboration_module.sql` is only needed for V8's database features if not already applied; do not re-run it just for this hotfix.

Do not place generated shell commands inside .tsx files.
