# INHOUSE REQUEST — Upgrade Guide (Roman Urdu + English)

Ye guide current release ke database/auth changes ke liye hai. Production par apply karne se pehle backup aur Preview deployment zaroor karein.

## 1. Google Cloud setup (Drive OAuth ke liye)

1. Google Cloud Console kholein aur wahi project select karein jahan existing service account hai.
2. **APIs & Services → Library** mein **Google Drive API** aur **Google Sheets API** enable karein.
3. **Google Auth Platform → Branding** mein app ka naam, support email aur developer contact set karein.
4. **Audience** mein External select karein. Testing mode mein refresh tokens 7 din baad expire ho sakte hain; production use se pehle app publish karein.
5. **Data Access** mein minimum scopes rakhein: `openid`, `email`, `https://www.googleapis.com/auth/drive.file`.
6. **Clients → Create client → Web application** select karein.
7. Authorized redirect URI add karein: `https://YOUR-DOMAIN/api/google/callback` aur local testing ke liye `http://localhost:3000/api/google/callback`.
8. Client ID aur Client Secret ko private rakhein. Supabase Google provider ka redirect alag hota hai: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`. Dono URLs ko mix na karein.

## 2. Vercel environment variables

Vercel → Project → Settings → Environment Variables mein existing variables ko preserve karein. Per-user Drive OAuth implementation ke liye ye variables required hain:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` — 32 random bytes, base64 form mein.
- Existing `GOOGLE_SERVICE_ACCOUNT_JSON`, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET`, `ADMIN_EMAILS`, Supabase variables.

Encryption key generate karne ke liye local terminal mein run karein:

```bash
openssl rand -base64 32
```

Output ko Vercel mein `TOKEN_ENCRYPTION_KEY` ke value ke taur par add karein. Is key ko chat, GitHub ya browser mein paste na karein. `GOOGLE_OAUTH_REFRESH_TOKEN` legacy shared token hai; per-user connection fully verified hone ke baad hi Vercel se remove karein.

## 3. Supabase SQL

1. Supabase Dashboard → SQL Editor → New query kholein.
2. Pehle database backup lein.
3. `database/migrations/012_per_user_google_drive_and_access.sql` ka complete content paste karke Run karein.
4. Migration ko second time run karna idempotency check ke liye mumkin hona chahiye.
5. Neeche wali verification queries run karein:

```sql
select table_name from information_schema.tables where table_schema='public'
  and table_name in ('user_google_connections','access_requests','user_role_name_audit');
select email, display_name, sheet_name, role, status from user_invitations
  where lower(email) like '%@rankviz.com' order by email;
```

## 4. Supabase Auth settings

- Authentication → URL Configuration → Site URL mein production domain set karein.
- Redirect URLs mein `https://YOUR-DOMAIN/auth/callback` aur local callback URL add karein.
- Authentication → Hooks mein agar `hook_restrict_rankviz_signup` configured hai, migration us function ko Google provider sign-ins allow karne ke liye update karti hai. Alternative: hook ko disable kar sakte hain, lekin app-side invitation checks phir bhi required hain.
- Supabase Google provider ka OAuth client aur redirect Supabase callback ke liye hai. Per-user Drive consent ka OAuth client `/api/google/callback` use karta hai.

## 5. Deploy steps

1. Project ZIP ka backup rakhein.
2. Updated files ko repo mein replace karein; `.env`/secret files commit na karein.
3. GitHub par commit/push karein; Vercel Preview deployment check karein.
4. Preview mein typecheck, build aur tests pass hon to Production deploy karein.
5. Pehle admin account se test karein; phir ek normal user aur invited external account.

## 6. Feature test checklist

- [ ] Admin hi projects create/edit/deactivate kar sakta hai; direct API calls bhi reject hon.
- [ ] Seven fixed Rankviz accounts correct name aur role ke saath sign in karte hain.
- [ ] External invited Google account sign in kar sakta hai; uninvited account access nahi le sakta.
- [ ] Invitation first sign-in par accepted hoti hai; baad mein role change dobara overwrite nahi hota.
- [ ] User sirf apni collaborations dekh/modify/export kar sakta hai; admin all partners dekh sakta hai.
- [ ] Project sheet append/status sync aur Apps Script webhook dono directions mein test hon.
- [ ] New Inhouse tab duplicate name aur retry behaviour test hon.
- [ ] Removed flag aur Incomplete filter/badge verify hon.
- [ ] Google Drive connection, reconnect, disconnect, own-drive file creation, service-account editor access aur recovery retry verify hon.
- [ ] `npx tsc --noEmit`, `npm run build`, `node --experimental-strip-types --test tests/*.test.mjs` pass hon.

## 7. Rollback plan

1. Vercel → Deployments se previous working deployment promote karein.
2. Database backup restore karna ho to DBA/owner se coordinate karein. Migration tables ko bina review ke drop na karein, kyun ke woh user data rakh sakti hain.
3. OAuth issue ho to per-user Drive create flow temporarily disable karein aur existing sheets/manual connect workflow use karein.
4. Encryption key rotate karne se pehle existing refresh tokens ko re-encrypt karein; warna users ko dobara Google Drive connect karna hoga.

## Current implementation note

Migration 012 aur invitation/profile lifecycle ke kuch fixes is update mein included hain. Per-user OAuth routes, encrypted token storage, unified spreadsheet factory, full collaboration recovery, access-request UI, request flags, performance RPCs aur end-to-end Google Drive flow ko production se pehle code review/build/manual acceptance tests se verify karna abhi zaroori hai. Guide mein checklist ko complete maan kar tick na karein jab tak actual deployment par test na ho.
