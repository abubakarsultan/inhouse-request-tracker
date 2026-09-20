# INHOUSE REQUEST — Final V2

Internal Rankviz outreach-request app built with Next.js App Router, TypeScript, Supabase/Postgres, Google Sheets API and Vercel.

## Final workflow

- Google sign-in only; only `@rankviz.com` accounts are allowed.
- First login asks for the exact Guest Post Anchor name, then a normal member waits for admin approval.
- Admins are explicitly bootstrapped through `ADMIN_EMAILS`.
- Approved team roster is fixed to: `M.ATIF`, `Wasif`, `Atif latif`, `Sohail Ahmad`, `Rizwan`, `Abubakar`, `Zunnorain Ali`.
- `Abubakar Sultan` historical assignments are normalized to `Abubakar`.
- Historical labels such as `Index` / `No Index` are not treated as people; Admin → Team & Approvals surfaces them for reassignment.
- Existing imported Guest Post Anchor rows are converted into first-class requests, so they appear in Dashboard, Requests, member dashboards and project counts.
- Request statuses are exactly `Request shared`, `Live`, `Rejected`.
- Requests can be edited or deleted/archived. Archive keeps audit history but removes the request from active views and clears the verified Sheet row.
- `live_date` is set on first Live and is never cleared by a later revert/rejection.
- Google Sheet column H is `Created By Email` and stores the signed-in Rankviz email for site-created requests.

## Project/domain uniqueness rule

The canonical business rule is:

```text
same project + same normalized website/domain = blocked
same website/domain + different project = allowed
```

Anchor text does not change the decision. `https://www.example.com/page`, `www.example.com` and `example.com` normalize to the same host, while `example.co` and `example.com` remain different.

The rule is enforced in three places:

1. Debounced form hint for the selected project only.
2. Server-side request/import validation.
3. Database trigger to protect against simultaneous writes/races.

Historical duplicates are preserved rather than silently deleted; Health Check surfaces active same-project/domain duplicates so an admin can resolve them deliberately.

## Member workspace

A member sees personal data only:

- Assigned / Live / Pending / Rejected / Overdue KPIs
- Upcoming deadlines
- New + imported historical requests
- Project breakdown
- Edit / Delete / status controls for owned requests
- Profile, theme toggle and logout

New member requests automatically use their approved Guest Post Anchor name for `Assign To` and their signed-in Rankviz email for `Created By Email`.

## Admin workspace

Admins see a clearly marked ADMIN workspace with:

- Company-wide dashboard
- Pending registration count
- Active team account count
- Invalid-assignment count
- Team approval queue showing Google name, Rankviz email, selected Sheet name, requested time and matching historical record count
- Team accounts / role / enable-disable / reset mapping / View as user
- Fixed seven-name roster
- Invalid historical assignment reassignment
- Projects, Requests, Search, Site Check, Import, Health and Settings

## Google Sheet mirror

Project tabs use:

```text
A Website
B Opportunity
C Anchor
D DR
E Traffic
F Status
G Note / Assign To
H Created By Email
```

Sheet status edits support `Request shared`, `Live`, and `Rejected`. The Apps Script must use the installable `onSheetEdit` trigger from `apps-script/SheetStatusWebhook.gs` (or the generated Settings snippet).

The service account remains the technical Sheets API writer; column H stores the real signed-in employee email for business auditing.

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

No new environment variable is introduced by Final V2.

## Database upgrades

For the user's current production installation, migrations 001–004 are already installed. Run only:

```text
database/migrations/005_final_workflow_upgrade.sql
```

`005` is designed to be re-runnable. It adds Final V2 fields/functions, converts existing unlinked `project_sites` history to real requests, activates only the exact seven-person roster, normalizes `Abubakar Sultan`, adds `Rejected`, archive/edit audit support and the project-domain guard.

For a completely fresh database use current `database/schema.sql`.

## Verification commands

```bash
npm ci
npx tsc --noEmit
npm run test:final
npm run build
```

Final V2's source-level test suite checks auth/domain rules, project-domain hard blocking, the exact seven-person roster, Rejected status, edit/archive wiring, creator email and admin approval/cleanup UI.

## Production acceptance

1. Run migration 005.
2. Deploy the Final V2 code with the existing environment variables.
3. Replace the team Sheet Apps Script with the new Final V2 trigger code and run `installTrigger()` once so direct Sheet edits can send `Rejected` too.
4. Run Import from team sheet once. Existing already-imported rows were backfilled by migration 005; this catches rows added to the Sheet since the last import.
5. Open Team & Approvals and reassign any invalid `Index` / `No Index` labels.
6. Test one normal member: Google login → select exact name → pending → admin sees identity/details → approve → history appears.
7. Test uniqueness: `Project A + example.com` once succeeds, second attempt is blocked; `Project B + example.com` is allowed.
8. Test Edit, Rejected, Revert, Delete/archive and verify the same team-sheet row changes.
9. Run Health Check to surface linkage or historical duplicate-domain problems.
