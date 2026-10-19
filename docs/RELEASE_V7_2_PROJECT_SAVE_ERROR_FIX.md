# V7.2 — Project creation error handling fix

## Reported production issue
The Add Project wizard reaches Preview & Save and shows `Minified React error #441` after a project save attempt. This is Next.js/React's masked production Server Action error, not an explanation of the underlying database/Google failure. The exact cause requires Vercel Runtime/Function Logs.

## Code changes
- `services/projects.ts`: Added `createProjectWithFeedback` and `updateProjectWithFeedback`, Server Actions that return `{ok: true}` or `{ok: false, message}` instead of allowing expected project-save exceptions to be masked as React #441. Full errors are logged server-side with `[project:save]`.
- `lib/project-save-error.ts`: Formats common Supabase PostgREST errors (missing columns/migrations, database constraints, duplicate keys, permissions), existing Google-sharing errors, and project-specific validation errors. Unknown server errors are not echoed to the browser.
- `components/app/project-form-dialog.tsx`: Uses the new safe actions in the final wizard step; preserves user input and keeps the modal open when save fails. Only closes and refreshes after a successful return.
- `tests/v7-2-project-save-feedback.test.mjs`: Covers DB-migration hints, duplicate conflicts, unknown error redaction, and use of safe actions in the wizard.

## If a save still fails after deployment
1. Check the red error text now shown in the wizard. A missing-column error points to the Supabase schema, not to the mapping UI.
2. In Supabase SQL Editor, inspect whether migrations `007_project_categories_sheet_mapping.sql` and then `008_project_url_speed.sql` have been applied. **Do not rerun unrelated baseline migrations, reset the DB or delete data.** Apply missing migrations only after backing up and verifying dependencies.
3. In Vercel: Project > Logs > Runtime Logs, filter for `[project:save]` around the Save attempt. Do not post Google private keys, JWTs, or service-role secrets.
4. Check whether the project was created before retrying (a cache/revalidation error after a completed insert could leave the project saved).
5. For existing Sheets, Google Sheet URL and Editor access must refer to the same selected workbook/tab; sharing is necessary but not proof that database save succeeds.

## Compatibility and verification
- Existing 19 Inhouse/Guest Post Anchor projects and A:H mapping were not migrated or modified by this code change.
- No new database migration is required **for the V7.2 error-reporting code**. However, migrations 007/008 may still be required for V7/V7.1 functionality in an environment where they were not previously run.
- `node --experimental-strip-types --test tests/*.test.mjs`: 40 tests passed.
- All 99 TS/TSX files parsed with TypeScript parser without syntax errors.
- A full `npm run build`, authenticated Supabase write, and live Google Sheets workflow were not verified here; deploy to Vercel to check integration and actual server error details.
