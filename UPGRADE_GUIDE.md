# INHOUSE REQUEST — Setup, deploy aur verification guide

Yeh guide Roman Urdu + simple English mein hai. Production par changes karne se pehle ZIP ka backup aur Supabase database backup zaroor banayein.

## 1. Google Cloud setup

1. Google Cloud Console mein apna project open karein.
2. **Google Drive API** aur **Google Sheets API** enable karein.
3. Google Auth Platform / OAuth consent screen ka audience **External** set karein. App ko **Publish to production** karein. Testing mode refresh tokens 7 din baad expire ho sakte hain; Internal audience outside Google accounts ko block karti hai.
4. Minimum scopes use karein: `https://www.googleapis.com/auth/drive.file`, `openid`, `email`. Full Drive scope add na karein.
5. Credentials → Create Credentials → OAuth client ID → **Web application** select karein.
6. Authorized redirect URI bilkul yeh ho: `https://YOUR-DOMAIN/api/google/callback`.
7. OAuth Client ID aur Client Secret note karein. In values ko public repository mein commit na karein.

## 2. Vercel environment variables

Vercel → Project → Settings → Environment Variables mein add/update karein:

- `GOOGLE_OAUTH_CLIENT_ID` — Google Web client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET` — Google Web client secret.
- `TOKEN_ENCRYPTION_KEY` — terminal mein `openssl rand -base64 32` run karein; output as-is save karein. Key change/lost hui to saved refresh tokens decrypt nahi ho sakte.
- `NEXT_PUBLIC_SITE_URL` — deployed origin, example `https://YOUR-DOMAIN`; path, query ya trailing slash include na karein.

Existing `GOOGLE_SERVICE_ACCOUNT_JSON`, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET`, Supabase URL/publishable key/service-role key aur Google service account settings ko preserve karein. `GOOGLE_OAUTH_REFRESH_TOKEN` legacy shared token hai: deploy ke baad OAuth connect/disconnect aur sheet-sync checks pass ho jayein to Vercel se remove karein. `GOOGLE_SERVICE_ACCOUNT_JSON` abhi existing Sheets ke server-side sync ke liye required hai.

## 3. Supabase SQL — order important hai

1. Supabase → SQL Editor open karein.
2. Agar pehle apply nahi ki, migration `database/migrations/012_per_user_google_drive_and_access.sql` run karein.
3. Us ke baad `database/migrations/013_team_directory_and_access_flow.sql` run karein.
4. Verification:

```sql
select to_regclass('public.user_google_connections') as google_connections,
       to_regclass('public.access_requests') as access_requests,
       to_regclass('public.team_directory') as team_directory,
       to_regclass('public.user_role_name_audit') as audit_table;
select email, sheet_name, role, active from public.team_directory order by email;
select column_name from information_schema.columns
where table_schema='public' and table_name='projects'
  and column_name in ('sheet_setup_state','sheet_setup_error','sheet_owner_user_id');
select pg_get_functiondef('public.hook_restrict_rankviz_signup(jsonb)'::regprocedure);
```

Migration 013 additive hai; existing tables/columns drop ya rename nahi karti. `team_directory` service-role-only hai; client-side access policy add na karein.

## 4. Supabase Auth settings

1. Authentication → URL Configuration mein Site URL deployed origin rakhein.
2. Redirect URLs mein `https://YOUR-DOMAIN/**` aur local development callback URL add karein.
3. Agar Before User Created hook enabled hai, function `public.hook_restrict_rankviz_signup` ko migration 013 se update karein. Allow ke liye `{}` return hota hai; app callback invitation/directory access enforce karta hai. Alternative: agar hook ko use nahi karna, Supabase Auth settings mein us hook ko disable karein; domain restrictions sirf hook ke bharose na chhorein.

## 5. Deploy steps

1. Project files GitHub par push karein aur Vercel deployment complete hone dein.
2. Build logs check karein; production ko tab tak use na karein jab tak `npx tsc --noEmit`, `npm run build`, aur tests local/CI par pass na hon.
3. `/profile` par Google Drive connect karein. Connected email confirm karein.
4. Test admin project sheet create karein; confirm karein file admin ke own Drive mein hai, headings/Status dropdown correct hain, aur service account Share list mein Editor hai.
5. Test collaboration sheet current user's Drive mein create karein; kisi doosre normal user se partner record/detail/export access verify karein.
6. Team page par invite, revoke, access request aur directory workflows test karein.
7. Production OAuth, Supabase, Drive permissions aur webhook ko real Google account se verify kiye baghair successful integration assume na karein.

## 6. Manual test checklist

- [ ] `NEXT_PUBLIC_SITE_URL` missing/invalid ho to `/profile` clear configuration error dikhata hai.
- [ ] Google Drive connect/callback state cookie, expiry aur same-site return path verify karein.
- [ ] Connect, reconnect, disconnect, revoked token aur missing refresh-token cases test karein.
- [ ] Project create without connected Drive: clear message, koi draft row nahi.
- [ ] Project sheet Status dropdown only `Request shared`, `Live`, `Rejected`.
- [ ] Collaboration sheet Status dropdown exactly `Pending`, `In Process`, `Live`, `Rejected`, `Cancelled`.
- [ ] Simulated failure after spreadsheet creation: saved ID retained, retry reuses ID and does not create a duplicate.
- [ ] Service account Editor permission and server-side read verification.
- [ ] Project card/detail show setup state/error; admin-only repair action works.
- [ ] Collaboration `Fix access`, `Prepare this sheet`, Apps Script panel and legacy owner assignment.
- [ ] Rankviz directory accounts sign in with Rankviz button; invited external users use Google button.
- [ ] Uninvited user can request invitation; admin sees request and can invite/dismiss; revoke blocks pending invite.
- [ ] Demoted admin stays demoted after next login; last active admin cannot be demoted/disabled.
- [ ] External user without sheet name can create request; `assigned_user_id` points to that user.
- [ ] Removed in sheet preserves app status and shows Removed badge; normal status clears flag.
- [ ] Incomplete badge tooltip lists missing fields; incomplete filter includes project-specific DR/Traffic rules.
- [ ] Client Live Link mapping, Inhouse new-tab creation, row matching and status sync.
- [ ] Every server action, API route, webhook, export and collaboration detail checks permission server-side.
- [ ] Mobile/responsive layouts, loading skeletons and reduced-motion behavior.

## 7. Rollback plan

1. Supabase backup/export aur current project ZIP save karein.
2. App issue aaye to Vercel par last known-good deployment rollback karein.
3. Migration 012/013 tables or columns manually drop na karein; yeh additive hain aur data preserve karte hain.
4. `TOKEN_ENCRYPTION_KEY` change/delete na karein jab tak `user_google_connections` rows retained hain.
5. Shared OAuth token ko code mein wapas add na karein. Google integration temporarily disable karni ho to Google Drive creation use na karein aur previous deployment par rollback karein.

## 8. Verification status for this package

Automated source-level tests are included. Actual Google OAuth/Drive and Supabase production behavior still requires environment-backed manual testing. Do not treat static tests as proof that Google APIs, migrations, permissions, or Vercel production runtime succeeded. This delivery report lists the commands that were actually run and any remaining gaps.
