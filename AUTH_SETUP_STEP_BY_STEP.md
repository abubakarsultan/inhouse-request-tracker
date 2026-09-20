# Auth + Team Rollout — Step-by-Step Production Setup

This guide assumes the current Phase 4 production app, Supabase database, Google Sheets service account, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET`, and installable Sheet status trigger are already working.

## 1. Upgrade the existing Supabase database

Open **Supabase -> SQL Editor -> New query**.

From this project, open:

```text
database/migrations/004_auth_team_rollout.sql
```

Copy the whole file, paste it into SQL Editor, and run it once.

For this existing production database, do **not** run `database/schema.sql` again.

After it runs, confirm these additions exist:

- `team_names` table
- new auth/team columns in `users`
- ownership/creator columns in `requests` and `project_sites`
- function `link_user_sheet_history`
- function `hook_restrict_rankviz_signup`

## 2. Add the two new Vercel environment variables

Keep all existing environment variables unchanged.

In **Vercel -> Project -> Settings -> Environment Variables**, add:

```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
ADMIN_EMAILS=YOUR-ADMIN@rankviz.com
```

Get `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from **Supabase -> Project Settings / API Keys -> Publishable key**.

`ADMIN_EMAILS` is required for the first admin. It is comma-separated if you want more than one admin, for example:

```text
abubakar@rankviz.com,anotheradmin@rankviz.com
```

Use exact real Rankviz Google email addresses.

## 3. Create the Google OAuth login client

Use the existing Google Cloud project **inhouse request tracker**.

Open **Google Auth Platform** (or APIs & Services -> Credentials / OAuth setup, depending on the UI).

If Google asks for app/audience setup:

- App name: `INHOUSE REQUEST`
- User support email: a Rankviz admin email
- Audience: **Internal** if your Rankviz Workspace organization offers that option

Create a new **OAuth Client**:

- Application type: `Web application`
- Name: `INHOUSE REQUEST Web`
- Authorized JavaScript origin:

```text
https://inhouse-request-tracker.vercel.app
```

- Authorized redirect URI:

```text
https://jjhuxhqnaavpejwxezez.supabase.co/auth/v1/callback
```

Save the generated **Client ID** and **Client Secret**. Do not put the Google Client Secret into Vercel.

## 4. Enable Google login in Supabase

Open **Supabase -> Authentication -> Providers -> Google**.

Enable Google, then paste:

- Google OAuth Client ID
- Google OAuth Client Secret

Save.

## 5. Configure Supabase redirect URLs

Open **Supabase -> Authentication -> URL Configuration**.

Set Site URL:

```text
https://inhouse-request-tracker.vercel.app
```

Add Redirect URL:

```text
https://inhouse-request-tracker.vercel.app/auth/callback
```

Save.

## 6. Turn on the Rankviz-only signup hook

Open **Supabase -> Authentication -> Hooks**.

For **Before User Created**, choose the Postgres function:

```text
public.hook_restrict_rankviz_signup
```

Enable/save it.

This blocks non-Google signups and emails outside `@rankviz.com` before an Auth user is created. The app also checks the domain server-side.

## 7. Deploy the new code

Replace/update the GitHub repository with this build and push it.

Redeploy the Vercel production deployment so the two new environment variables are included.

Do not remove or rotate the existing Sheet service account just for login. Google login and the Sheet service account are separate systems.

## 8. First admin login

Open:

```text
https://inhouse-request-tracker.vercel.app
```

Click **Continue with Google** and sign in with an email listed in `ADMIN_EMAILS`.

On first login, choose your exact Guest Post Anchor name. The initial seeded choices include:

- M.ATIF
- Wasif
- Atif latif
- Sohail Ahmad
- Rizwan
- Abubakar
- Zunnorain Ali

Existing historical assignee names already found in the database are also discovered by migration 004.

A configured admin becomes active after choosing their name and should reach the admin dashboard.

## 9. Test one normal team member

Ask one team member to:

1. Open the site.
2. Continue with their `@rankviz.com` Google account.
3. Select their exact Guest Post Anchor name.
4. They should see **Pending approval** and no private work data yet.

As admin, open **Team**, verify the selected name, then click **Approve & link history**.

After approval, that member's matching historical requests/imported sheet rows should appear in their personal workspace.

## 10. Test creator email in Guest Post Anchor

Before testing, make sure column H in each project tab is either blank or already has this header:

```text
Created By Email
```

Create a request while signed in as a normal team member.

Expected Sheet result:

```text
G = exact approved Guest Post Anchor name
H = signed-in @rankviz.com Google email
```

The Google service account can still appear as the technical API writer in Google version history. Column H is the human audit identity chosen for this rollout.

## 11. Final checks

Confirm:

- Member only sees personal dashboard/work.
- Admin sees global dashboard + Team management.
- Member cannot use another person's claimed sheet name.
- Admin approval links existing history.
- Profile menu shows email/role and Logout works.
- Light/dark theme toggle persists.
- Dashboard fits laptop/desktop widths without whole-page horizontal scrolling.
- Existing Sheet column-F Live / Request shared trigger still syncs back to the site.
- New requests still append at the intentional `lastRow + 2` position.
