# Final V2 — Production Setup

This checklist assumes the current Google OAuth, Supabase Auth, service account, TEAM_SHEET_ID and webhook are already working.

## 1. Supabase

Open Supabase → SQL Editor → New query.

Run the complete contents of:

`database/migrations/005_final_workflow_upgrade.sql`

Do **not** rerun schema.sql or migrations 001–004 on the current production database.

After success, verify:
- `team_names`: only the seven supplied names are active.
- `requests`: new columns such as `source` / `deleted_at` exist.
- `request_change_logs` exists.

## 2. Deploy

Replace/push the new code to the existing GitHub/Vercel project and redeploy.

No new env variables are required. Keep all existing auth + Sheet variables.

## 3. Update the Sheet edit trigger

Final V2 adds `Rejected`, so the existing Apps Script must be updated.

After deploying:
1. Website → Settings.
2. Copy the full Team sheet → site trigger snippet.
3. Guest Post Anchor → Extensions → Apps Script → existing `SheetStatusWebhook` file.
4. Replace its code with the new snippet.
5. Put the existing `SHEET_WEBHOOK_SECRET` into the placeholder.
6. Save.
7. Run `installTrigger()` once and authorize if asked.

The installer deletes the old app trigger and creates the new installable edit trigger.

## 4. Sync latest legacy Sheet rows

Admin → Import → Import from team sheet → Run.

Migration 005 already converts previously imported `project_sites` rows into real requests. This import only catches newer Sheet rows that were never imported.

## 5. Clean invalid people labels

Admin → Team & Approvals → Invalid assignments.

Reassign `Index`, `No Index`, or any other non-person label to one of:
- M.ATIF
- Wasif
- Atif latif
- Sohail Ahmad
- Rizwan
- Abubakar
- Zunnorain Ali

`Abubakar Sultan` is automatically normalized to `Abubakar` by migration 005.

## 6. Test a normal user

A member signs in with `@rankviz.com`, selects their exact name, and sees Pending Approval.

Admin → Team & Approvals must show:
- Google name
- Rankviz email
- selected Guest Post Anchor name
- registration/requested time
- number of existing matching requests

Click `Approve & link data` and verify the member's Dashboard / Requests immediately includes imported history.

## 7. Test domain uniqueness

Create a request in one project for `https://www.example.com/page`.

A second request in the same project using `example.com` must be blocked even with a different anchor/person/status.

The same `example.com` in another project must be allowed.

## 8. Test request management

Verify:
- Request shared → Live → Rejected → Request shared
- Edit Website/Anchor/Placement/Assignee updates the verified Sheet row
- Edit preserves DR and Traffic in the Sheet
- Delete archives the request and clears A:H on the linked Sheet row
- Dashboard/Requests/member counts update

## 9. Health

Run Admin → Health. It now checks linkage plus active same-project/domain duplicates left over from historical data.
