# UPGRADE GUIDE — INHOUSE REQUEST

Yeh guide simple Roman Urdu + English mein hai. Upgrade karne se pehle apni current deployment aur database ka backup zaroor lein.

## 1. Pehle backup
1. Supabase Dashboard open karein → apna project select karein.
2. Database ka backup/export available ho to lein. Kam az kam important tables `projects`, `requests`, `users`, `project_sites` ka CSV export rakh lein.
3. Vercel → project → Deployments mein current working deployment ka record/link rakh lein.
4. Apni current project ZIP safe jagah par copy kar lein.

## 2. Database migration
1. Supabase Dashboard → SQL Editor → New query.
2. Is ZIP mein `database/migrations/009_project_categories_sheets_viewer.sql` file open karein.
3. File ka poora SQL copy karke SQL Editor mein paste karein.
4. Run click karein. Verification query output mein `projects_without_category` zero hona chahiye aur `seeded_categories` 3 hona chahiye.
5. Agar SQL error aaye to deployment update na karein; error message save karein aur rollback section follow karein.

## 3. Vercel environment variables
Current integration ke liye existing variables ko preserve karein: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `TEAM_SHEET_ID`, `SHEET_WEBHOOK_SECRET`, aur site URL variable agar pehle se configured hai.
- Service-account JSON ko browser/client code mein kabhi add na karein.
- Is upgrade foundation mein koi per-project environment variable required nahi.
- Client sheets create/share karne ke liye Google Cloud Console → APIs & Services → Library → **Google Drive API** enable karna zaroori hoga. Google Sheets API bhi enabled rehni chahiye.
- Google service-account email ko sheet par Editor permission dena hota hai. Service account ke owned spreadsheet ki ownership limitation ko yaad rakhein.

## 4. Project files replace aur deploy
1. ZIP extract karein.
2. Existing project ka backup lene ke baad updated project files repository mein copy karein.
3. Terminal mein project folder open karke `npm ci` run karein.
4. `npm run build` run karein. Build pass hue baghair deploy na karein.
5. Tests ke liye `npm run test:final` run karein.
6. Git changes review karein, phir commit/push karein; Vercel deployment complete hone ka wait karein.
7. Vercel deployment logs mein build errors check karein.

## 5. Google Apps Script
Existing Inhouse sheet trigger ko pehle uninstall na karein. Migration ke baad existing script ka normal status sync backward compatible rehna chahiye. Client/Onpage sheet ke liye project UI mein script snippet available hone par usay copy karein, sheet open karein → Extensions → Apps Script → code paste → Save → `installTrigger` ko ek dafa Run karein → Google permissions authorize karein. Phir sheet mein Status change karke verify karein.

## 6. Test checklist
- Login, onboarding aur pending approval check karein.
- Existing project list aur request list open karein.
- Existing request create/edit, status change, Search, Site Check, Import, Health, CSV export aur dark mode test karein.
- Migration verification query check karein.
- Tab-name validation and header-name mapping tests run karein.
- Sheet status `Removed` karne par request ka tool status preserve hona aur sheet flag set hona expected hai.
- Viewer permissions, separate client-sheet creation, generated Apps Script, complete category management UI, and end-to-end performance metrics require full integration validation before production use.

## 7. Rollback plan
1. Vercel → Deployments → previous known-good deployment → Promote to Production.
2. Database migration automatically existing records delete nahi karti. Is migration ko reverse karne ke liye tables/columns drop karna recommended nahi, kyun ke is se new data loss ho sakta hai.
3. Agar database issue ho, pehle application ko previous deployment par rollback karein aur backup restore/SQL fix admin ya developer ki guidance se karein.
4. Kisi bhi halat mein `projects` ya `requests` table drop na karein.

## Important status
Yeh deliverable migration aur shared helper foundation add karta hai. Full requested UI workflows (category manager, sheet creation/connection dialog, generated client Apps Script, complete viewer page guards, role-management UI, and verified before/after performance measurements) ko production-ready kehne se pehle implementation aur real Supabase/Google/Vercel integration testing complete honi chahiye.
