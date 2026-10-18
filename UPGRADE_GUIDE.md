# INHOUSE REQUEST — Google Drive setup (Phase 1)

Yeh guide per-user Google Drive connection aur new spreadsheet setup ke liye hai. Har admin apne Google account ko connect karega; har collaboration user apna account connect karega. Naye sheets service account ke naam par create nahi hotay.

## 1. Google Cloud setup

1. Google Cloud Console mein apna project open karein.
2. **Google Drive API** aur **Google Sheets API** enable karein.
3. Google Auth Platform / OAuth consent screen mein audience **External** rakhein. App ko **Publish to production** karein. Testing mode refresh tokens ko 7 din baad expire kar sakta hai; Internal audience outside Google accounts ko block karti hai.
4. OAuth scopes minimum `https://www.googleapis.com/auth/drive.file`, `openid`, aur `email` hon. `drive.file` app-created/selected files ke liye hai; full Drive scope add na karein.
5. Credentials mein **Web application** OAuth client banayein.
6. Authorized redirect URI mein exact URL add karein: `https://YOUR-DOMAIN/api/google/callback`.

## 2. Vercel environment variables

Vercel → Project → Settings → Environment Variables mein yeh add karein:

- `GOOGLE_OAUTH_CLIENT_ID` — Google Web client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET` — usi client ka secret.
- `TOKEN_ENCRYPTION_KEY` — terminal mein `openssl rand -base64 32` run karein aur output yahan paste karein. Is key ko change/lost karne se stored refresh tokens decrypt nahi honge.
- `NEXT_PUBLIC_SITE_URL` — deployed site ka origin, misal `https://YOUR-DOMAIN` (ending slash ke baghair).

Existing `GOOGLE_SERVICE_ACCOUNT_JSON`, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET`, aur Supabase variables ko abhi preserve karein. Service account existing sheets ke server-side sync aur owner-created sheets par Editor access ke liye use hota hai. `GOOGLE_OAUTH_REFRESH_TOKEN` code se remove kar diya gaya hai; agar Vercel mein yeh legacy variable maujood ho to deploy verify karne ke baad remove karein.

## 3. Supabase SQL

1. Supabase → SQL Editor open karein.
2. Project ZIP ke `database/migrations/012_per_user_google_drive_and_access.sql` ko pehle apply karein agar pehle apply nahi ki.
3. Migration apply hone ke baad verify karein:

```sql
select to_regclass('public.user_google_connections') as google_connections_table;
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'projects'
  and column_name in ('sheet_setup_state', 'sheet_setup_error');
```

Phase 2 migration 013 abhi is Phase 1 delivery ka hissa nahi hai. Existing tables/columns drop ya rename na karein.

## 4. Supabase Auth

1. Authentication → URL Configuration mein Site URL deployed origin rakhein.
2. Redirect URLs mein `https://YOUR-DOMAIN/**` aur local development URL add karein.
3. Agar Supabase Before User Created hook enabled hai, existing login flow ke mutabiq hook ko verify karein. Hook ka response allow ke liye `{}` hona chahiye; reject ke liye `error` object. Hook behavior verify kiye baghair production sign-up policy change na karein.

## 5. Deploy

1. Updated project GitHub par push karein; Vercel deployment complete hone dein.
2. Vercel logs mein build errors check karein.
3. `/profile` open karein, Google Drive card se **Connect Google Drive** select karein, consent approve karein.
4. Profile par connected Google email verify karein.
5. Admin ke taur par test project create karein aur confirm karein ke spreadsheet connected Google account ki Drive mein hai.
6. Google Sheet ka Share dialog open karke verify karein ke service account Editor hai.
7. Sheet setup error aaye to project record ka `sheet_setup_error` check karein. Existing sheet delete na karein; manually Share permissions repair karein. Automated retry/repair UI abhi complete nahi hai.

## 6. Phase 1 manual test checklist

- [ ] Profile par Connect Google Drive OAuth consent khulta hai.
- [ ] Callback wrong/missing state par reject hota hai.
- [ ] Return path external URL ya `//host` accept nahi hota.
- [ ] Profile par connected Google email show hota hai.
- [ ] Disconnect connection row delete karta hai; existing files remain karti hain.
- [ ] Admin new project banata hai; sheet admin ki own Drive mein hoti hai.
- [ ] New sheet mein headers, frozen header, green bold heading, Status dropdown, aur Live conditional formatting hain.
- [ ] Service account Editor hai aur service-account client sheet read kar sakta hai.
- [ ] Collaboration auto-create current user's Google Drive mein sheet banata hai.
- [ ] Google OAuth revoked token par Reconnect message milta hai.
- [ ] Failure after sheet creation par database mein spreadsheet ID retained rehta hai.

## 7. Rollback plan

1. Rollback se pehle Supabase backup/export lein.
2. App code ko previous known deployment par rollback karein.
3. `user_google_connections` table ya migration columns manually drop na karein; existing files/sheets independent rehti hain.
4. `TOKEN_ENCRYPTION_KEY` delete/change na karein jab tak encrypted connections table retained hai.
5. Legacy shared refresh token code mein wapas add na karein. Agar OAuth setup temporarily disable karna ho, Connect UI use na karein aur previous deployment par rollback karein.

## Current limitations for this delivery

- Retry/Repair access UI for a saved project sheet ID is not implemented.
- Project creation draft survives the Drive OAuth round trip, but complete recovery UX after a partial setup failure still needs testing.
- Collaboration factory saves the created sheet ID before setup continues, but dedicated Retry/Repair action and owner privacy verification across all endpoints are not complete.
- Typecheck and production build could not be verified in this environment because `npm ci` timed out and left incomplete type packages. The full Node test suite did run; see delivery report.
