# Auth + Team Rollout Report

## 1. What was built

### Rankviz Google authentication
- Added Supabase Auth Google OAuth using `@supabase/ssr` browser/server clients and Next.js 16 `proxy.ts` session refresh.
- Added `/login` with **Continue with Google** only.
- App-side domain check only accepts `@rankviz.com`.
- Added an optional/strongly-recommended Supabase **Before User Created** database hook that rejects both non-Google providers and non-`@rankviz.com` emails before account creation.
- Added logout, callback handling, protected app layout, onboarding, pending approval, disabled-account handling, and server-side action guards.

### First-login Guest Post Anchor mapping
- Added searchable colored-chip name picker.
- Seeded: `M.ATIF`, `Wasif`, `Atif latif`, `Sohail Ahmad`, `Rizwan`, `Abubakar`, `Zunnorain Ali`.
- Names already claimed by another account cannot be selected.
- Migration also discovers distinct historical assignee/note names already present in requests/imported project sites, so full-team rollout is not limited to the seven seeded chips.
- Members become `pending`; configured admins become active after selecting their own name.
- Approval links historical `requests.assign_to` and imported `project_sites.note` rows to the user.

### Admin approval / Team panel
- New `/team` admin page.
- Pending approve + link history, reject, enable/disable, member/admin role switching, mapping reset.
- Workload counts: assigned, Live, Pending, Overdue, imported legacy rows.
- Read-only **View as user** preview.
- Add/enable/disable Guest Post Anchor names without code changes.
- Unmatched historical sheet names are surfaced, including names not pre-seeded; admin can add them as selectable names.
- Self-lockout protections prevent an admin from disabling or demoting their own current account.

### Personal member experience
- Member dashboard is personal rather than global.
- KPIs: Assigned, Live, Pending, Overdue.
- Upcoming deadlines, linked requests, imported Guest Post Anchor history, project breakdown.
- Member-created requests are automatically assigned to the member's approved sheet name.
- Member status/retry actions are limited server-side to their own work.
- Added profile page/menu with Google identity, mapped sheet name, role/status, and Logout.

### Admin experience
- Admin retains the existing global Dashboard, Projects, Requests, Search, Import, Health, Settings, failed-sync repair, and team-sheet tools.
- Global Requests now also shows the request creator email.
- Admin new-request form can assign any active/known Guest Post Anchor name.

### Sheet creator email (Option A)
- New request/project-site ownership fields store creator user ID + email.
- Google Sheet writes are now A:H.
- H header is `Created By Email`; it is created automatically when H1 is blank.
- If H1 is already occupied by another header, sync fails clearly instead of overwriting it.
- Existing installable column-F status webhook remains compatible because it validates only A:G.
- The service account remains the technical API writer; actual signed-in user email is the permanent row audit in column H.

### UI / responsive polish
- Added persistent Light/Dark theme toggle in top bar.
- Added profile dropdown.
- Responsive full-width app shell; laptop grid breakpoints reduced to avoid cramped cards.
- Wide tables scroll inside their own cards rather than forcing whole-page horizontal overflow.
- Mobile bottom navigation is horizontally scrollable and includes all allowed role links.
- Replaced fixed white surfaces with design-token card surfaces for dark mode support.

## 2. Database / migration

Existing Phase 4 production database: run only

```text
database/migrations/004_auth_team_rollout.sql
```

The migration is written to be re-runnable. It adds `team_names`, user onboarding/approval fields, request/project-site ownership and creator fields, indexes, `link_user_sheet_history`, member search, and the Rankviz signup hook.

`database/schema.sql` was also updated for fresh installations and now embeds the Auth/Team additions directly (no psql `\\i` directive).

## 3. New environment variables

Existing variables remain. Add:

```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ADMIN_EMAILS=
```

`ADMIN_EMAILS` is comma-separated. Only valid `@rankviz.com` entries are honored by the code.

No Google OAuth Client Secret is added to Vercel; that secret is configured inside Supabase Authentication -> Google provider.

## 4. Important behavior / assumptions

- `ADMIN_EMAILS` is the explicit admin bootstrap. If it is empty, no user is silently promoted to admin; set at least one real Rankviz admin email before team rollout.
- Admins must still choose their exact Guest Post Anchor name once so their own My Requests workspace maps correctly.
- Normal members never see data before admin approval.
- Historical imported `project_sites` rows remain history rows rather than being converted into full `requests`; they are shown in the user's workspace and included in KPIs/project counts.
- Option A was implemented exactly: actual creator email is stored in Sheet column H. Domain-wide delegation/Google-user impersonation was intentionally not added.
- The existing Sheets service account, webhook secret, team sheet ID, and installable edit trigger are preserved.

## 5. Verification performed

Successful:
- `npm run test:auth`: **11/11 tests passed**.
- Final TypeScript `transpileModule` syntax pass across **80 TS/TSX files: 0 syntax failures**.
- Final local `@/` import integrity scan across **80 TS/TSX files: 0 broken imports**.
- Client/server boundary scan: **0 client components importing service-role/server-only modules**.
- Secret scan: no service-account private key, `sb_secret_...` value, or project-specific Supabase URL is embedded in the delivered source.
- Added tests for exact Rankviz-domain filtering, `ADMIN_EMAILS` parsing, seeded team names, and column-H creator-email mirror behavior, alongside the previous CSV/domain/deadline/webhook tests.

Package-backed verification limitation:
- `npm ci --no-audit --no-fund` was attempted again before packaging but package-registry installation timed out in this execution environment, leaving no complete local dependency tree.
- `tsc --noEmit` was attempted and stopped because `@types/node`, `@types/react`, and `@types/react-dom` could not be installed completely.
- `npm run build` was attempted and stopped with `next: not found` for the same incomplete-install reason.
- Therefore I am **not** claiming a successful package-backed TypeScript/Next production build for this auth rollout. Vercel or another registry-connected environment must run the definitive build after deployment.

## 6. Setup order

See `README.md` for the exact production setup. In short:
1. Run migration 004.
2. Create Google OAuth Web client.
3. Enable Google provider in Supabase.
4. Add Vercel publishable key + `ADMIN_EMAILS`.
5. Configure Supabase Site/Redirect URLs + Before User Created hook.
6. Redeploy.
7. Admin first-login/name mapping.
8. Member registration -> admin approval -> history-link test.
9. Create test request and confirm G = sheet name, H = signed-in email.
