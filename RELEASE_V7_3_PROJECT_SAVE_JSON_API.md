# V7.3: Project Save JSON API & Error Diagnostics

## Why V7.2 could still show React #441

React #441 is an error envelope for a production React Server Components failure, not a diagnosis. The earlier Create Project path used a Next.js Server Action; Server Action/RSC failures could still surface as React #441 instead of a useful failure reason, even with a try/catch in the action. The original error from Vercel Runtime Logs is needed to determine whether the database, permissions, or runtime caused the failure.

## Changes

- **POST `/api/projects/save`** is the new project-create/update route. It returns JSON, independently of React Server Action transport.
- The route uses existing `createProject` and `updateProject` business logic, database writes, duplicate checking, and Google Sheet resolution. Admin verification remains in each service function.
- Incoming operations undergo Zod validation, basic request size checks, and same-origin checks.
- Errors are logged on the server as `[project:save][XXXXXXXX] ...`. The user sees a sanitized explanation and matching `Reference: XXXXXXXX`.
- The Add Project wizard preserves form values and stays open when an API request fails. It displays a clear network, HTTP, or server response error.
- No changes to existing database migrations, Google Sheets, project records, or old A:H mapping.

## Deployment

1. Back up your Vercel env settings/database as appropriate. Upload this package's `inhouse-build` **contents** to your existing GitHub repository; commit/push to the branch Vercel deploys.
2. Confirm Vercel production deployment is **Ready** and that the deployment contains `app/api/projects/save/route.ts`.
3. In Supabase **SQL Editor**, run `database/checks/001_project_save_readiness.sql`. This read-only diagnostic never modifies data. If a 007 or 008 column is missing, apply the relevant migration in sequence. **Do not re-run full schema.sql or reset a populated database.**
4. Check whether the attempted project already exists under any category, to avoid accidentally creating duplicates. Then open Add Project and save once.
5. If save fails, copy **the exact error and `Reference`** shown in the modal. Open **Vercel > Project > Logs** for the same deployment/time and find `[project:save][REFERENCE]`. Share the sanitized message and log lines, hiding any credentials/tokens. This identifies the actual failure.
6. If you still see the literal React #441 *in the modal on Create Project*, hard-reload the page and inspect the browser's Network tab: the new wizard calls `/api/projects/save` (a JSON endpoint), not a server action. If it does not call that endpoint, the new code is not being served.

## Verification scope

- 43 automated regression tests pass (including 3 new route regression tests).
- Static TypeScript/TSX syntax validation pass (see release verification output).
- Full `next build` and live Supabase/Google integration **not run** in the local environment: npm registry DNS is unavailable. Vercel build and a real project save are still required.

## Data safety

- No DB schema mutation in V7.3's new files; the SQL check is read-only.
- Legacy shared Guest Post Anchor mapping is preserved.
- The new route does not modify Google Sheets beyond actions already performed by `createProject` (new Sheet creation if selected).
