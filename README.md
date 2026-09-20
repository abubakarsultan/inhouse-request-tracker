# INHOUSE REQUEST

Rankviz internal outreach request app. Supabase/Postgres is the source of truth; the **Guest Post Anchor** Google Sheet is a server-side mirror. The current build adds Rankviz-only Google login, personal workspaces, admin approval, creator-email auditing, and responsive light/dark UI on top of the completed Phase 1–4 request/sync system.

## Access model

- Sign-in is **Continue with Google** only.
- Only `@rankviz.com` accounts are accepted by the app; migration `004_auth_team_rollout.sql` also provides a Supabase **Before User Created** hook for a database-level Google + domain restriction.
- First login asks the member to choose the exact Guest Post Anchor name used in the team sheet.
- Members remain **Pending** until an admin approves the mapping.
- Admins are bootstrapped from comma-separated `ADMIN_EMAILS`. If that variable is empty and there is no active admin yet, the first Rankviz user can bootstrap as admin as an emergency fallback.
- Active members see a personal dashboard and only their own status actions. Admins see the global dashboard, Projects, Requests, Search, Import, Health, Team, and Settings.

### Seeded Guest Post Anchor names

- M.ATIF
- Wasif
- Atif latif
- Sohail Ahmad
- Rizwan
- Abubakar
- Zunnorain Ali

The migration also discovers distinct existing assignee names from `requests.assign_to` and imported `project_sites.note`, so a full-team rollout can surface historical names automatically. Admins can add or disable future names from **Team** without a code change.

## Member workflow

1. User signs in with their `@rankviz.com` Google account.
2. On first login, they choose their exact Guest Post Anchor name.
3. The account waits for admin approval.
4. Admin approves it from **Team**; the app links historical `requests.assign_to` and imported `project_sites.note` rows that match that exact name (case-insensitive).
5. The member gets a personal dashboard with Assigned / Live / Pending / Overdue, next-7-days deadlines, linked requests, imported sheet history, and per-project counts.
6. A member-created request is automatically assigned to that member's approved sheet name.

## Admin workspace

The **Team** page provides:

- pending-registration approve/reject;
- selected sheet name plus historical-match count before approval;
- member/admin role management;
- enable/disable access;
- reset name mapping;
- read-only **View as user** workspace preview;
- team workload counts;
- selectable Guest Post Anchor name management;
- unmatched historical sheet names, with an option to add them as selectable names.

Admin/global tools from the existing app remain available: Projects, Requests, Search, Import, Health, sync diagnostics, team-sheet import, failed-sync retry, and live-status reconciliation.

## User profile and UI

- Top-right profile menu shows name, email, role, status, Profile, and Logout.
- Light/dark toggle is in the top bar and is remembered in browser localStorage.
- Desktop layout uses the available monitor width; laptop breakpoints reduce grid columns; mobile uses a horizontally scrollable bottom navigation.
- The page itself avoids horizontal overflow; wide data tables scroll inside their own cards.

## Google Sheet creator email (Option A)

The technical Sheets API still uses the Google service account for server-side writes. For human audit attribution, every new site-created request writes the signed-in user's real Google email into **column H**:

```text
A Website | B Opportunity | C Anchor | D DR | E Traffic | F Status | G Note / Assign To | H Created By Email
```

The app creates `H1 = Created By Email` the first time it needs to write to a tab if H1 is blank. If column H is already being used for another header, sync fails clearly rather than overwriting it.

This is intentionally **Option A**: Google version history may still show the service account as the API writer, while column H permanently records the actual Rankviz user who created the request.

## Existing request and sync behavior

- Request creation stays DB-first: `requests` -> linked `project_sites` -> team-sheet mirror.
- Sheet appends intentionally use `lastRow + 2`.
- Statuses are exactly `Request shared` and `Live`; revert is allowed and first `live_date` is retained.
- Team-sheet status edits use the installable `onSheetEdit` webhook and do not ping-pong back to Sheets.
- Stored sheet rows are verified by Website + Anchor before status updates.
- Failed Sheets writes never lose the database request.
- Site Check uses exact normalized host matching.
- Outreach OS CSV remains the exact 9-column format.

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=
GOOGLE_SERVICE_ACCOUNT_JSON=
TEAM_SHEET_ID=
SHEET_WEBHOOK_SECRET=
```

Notes:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the browser-safe Supabase key beginning with `sb_publishable_`.
- `SUPABASE_SERVICE_ROLE_KEY` is the server-only `sb_secret_...` / service-role secret already used by the app. Never expose it to the browser.
- `ADMIN_EMAILS` is a comma-separated list of exact Rankviz Google addresses, for example `person1@rankviz.com,person2@rankviz.com`.
- Existing Google Sheet variables remain unchanged.

## Database upgrade

The current production installation already has Phases 1–4. Run only:

```text
database/migrations/004_auth_team_rollout.sql
```

Do **not** re-run `schema.sql` on the populated production database. `004_auth_team_rollout.sql` is idempotent and adds:

- team/user onboarding fields;
- user ownership and creator-email columns;
- `team_names`;
- history-linking RPC;
- member-search RPC;
- Rankviz/Google Before User Created hook function;
- indexes/triggers/grants.

For a completely fresh database, the current `database/schema.sql` already contains the full canonical schema through this rollout.

## Google OAuth / Supabase Auth setup

### Google Cloud

Use the existing **inhouse request tracker** Google Cloud project.

1. Configure the Google Auth application. For a Rankviz Workspace-owned project, use **Internal** audience if available.
2. Create an OAuth Client ID with application type **Web application**.
3. Authorized JavaScript origin: your production Vercel origin, e.g. `https://inhouse-request-tracker.vercel.app`.
4. Authorized redirect URI: use the exact Supabase Google-provider callback URL shown in **Supabase -> Authentication -> Providers -> Google**. It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Copy the OAuth Client ID and Client Secret.

### Supabase

1. **Authentication -> Providers -> Google**: enable Google and paste the Google OAuth Client ID + Secret.
2. **Authentication -> URL Configuration**:
   - Site URL: production Vercel origin.
   - Redirect URL: `https://YOUR-VERCEL-DOMAIN/auth/callback`.
3. **Authentication -> Hooks -> Before User Created**: select `public.hook_restrict_rankviz_signup` created by migration 004. This rejects non-Google signups and non-`@rankviz.com` addresses before an Auth user is created.
4. Copy the Supabase **Publishable key** into Vercel as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Google OAuth Client Secret belongs in the Supabase Google-provider settings, **not** in Vercel.

## Existing Google Sheet setup

Keep the existing service account, `TEAM_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_WEBHOOK_SECRET`, and installed `onSheetEdit` trigger. No new service-account key is needed for login. Google login and the Sheets service account are separate systems.

## Production rollout order

1. Run `004_auth_team_rollout.sql` in Supabase SQL Editor.
2. Configure Google OAuth in Google Cloud.
3. Enable/configure Google provider in Supabase Auth.
4. Configure Supabase Site URL + `/auth/callback` redirect.
5. Enable `public.hook_restrict_rankviz_signup` under Before User Created hooks.
6. Add Vercel `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `ADMIN_EMAILS`.
7. Redeploy Vercel.
8. Sign in first with an email listed in `ADMIN_EMAILS`, select the correct Guest Post Anchor name, and confirm the admin dashboard opens.
9. Have one member sign in, choose their name, and confirm they land on Pending.
10. Admin -> Team -> approve that member and confirm historical rows are linked.
11. Create a test request as that member and confirm Sheet columns G/H contain the exact sheet name and member email.
12. Test member status Live/Revert, logout/login, dark theme, admin View-as-user, and mobile/laptop layout.

## Verification commands

```bash
npm ci
npx tsc --noEmit
npm run test:auth
npm run build
```

The test suite includes the original Phase 2–4 domain/deadline/CSV/webhook tests plus Rankviz-domain/admin-email and auth-rollout structure checks.
