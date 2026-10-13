# INHOUSE REQUEST — Upgrade Guide

> **Important status note:** This is an upgrade-in-progress package, not yet a production-ready replacement for the live project. The migration and foundations below are included, but the complete per-project Google Sheets sync, all viewer read-only page guards, full request-flag coverage, performance benchmark, and full end-to-end verification still need to be finished before deploying this package to Vercel. Keep the currently working deployment available for rollback.

## 1. Backup first

1. GitHub Desktop mein `Repository → Show in Explorer` kholo.
2. `inhouse-request-tracker` folder ki copy bana lo, for example `inhouse-request-tracker-backup-2026-10-13`.
3. Supabase Dashboard → **Database → Backups** mein latest backup check kar lo. Agar project plan manual backup support nahi karta, to pehle Supabase SQL Editor se current schema/data export karwao.
4. GitHub par current `main` branch ka latest commit note kar lo. Abhi force-push mat karna.

## 2. Supabase migration

1. Supabase Dashboard kholo aur apna INHOUSE REQUEST project select karo.
2. Left menu se **SQL Editor** kholo.
3. `database/migrations/009_project_categories_sheets_roles.sql` file local project folder se open karo.
4. File ka poora SQL copy karo, SQL Editor mein paste karo aur **Run** click karo.
5. Successful run ke baad migration ke end par diye gaye verification queries ek-ek karke run karo:
   - categories aur `sheet_mode` check;
   - `projects_without_category` zero hona chahiye;
   - `sheet_flag` aur `sheet_flag_at` columns check;
   - roles mein `viewer` check.

Migration idempotent banayi gayi hai, lekin production par run karne se pehle backup zaroor rakho.

## 3. Environment variables

Is change set mein naya per-project environment variable add karna required nahi hai. Existing Vercel variables ko delete ya rename mat karna:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `TEAM_SHEET_ID`
- `SHEET_WEBHOOK_SECRET`

Google Sheets API already use ho rahi hai. New spreadsheet create/share karne ke liye Google Cloud Console → **APIs & Services → Library** mein **Google Drive API** enable karna bhi zaroori hai. Service-account JSON ko browser/client code mein kabhi paste na karo.

## 4. Google Sheet sharing

- Existing sheet ke liye service-account email ko **Editor** permission do.
- Nayi sheet service account ke ownership mein create hoti hai; ye Google API ki ownership limitation hai. Client email ko Editor access diya ja sakta hai.
- Apps Script ka installable trigger `installTrigger()` se ek martaba install hota hai. Google authorization prompts accept karne honge.
- Existing installed team-sheet script backward-compatible payload bhej sakti hai. Is build mein `Removed` flag webhook support bhi add hua hai.

## 5. Local files aur Vercel

1. Pehle local machine par `npm ci` chalao.
2. `npm run build` aur `npm run test:phase4` run karo.
3. **Is package ko production mein replace na karo agar build ya tests fail hon.** Is waqt build verification is environment mein complete nahi ho saki, kyun ke npm dependencies install nahi ho sakin.
4. Jab build verified ho, GitHub Desktop mein sirf project source files copy karo. `.git` folder ko kabhi delete/replace na karna.
5. `Changes` tab mein changed files review karo; commit message likho, e.g. `Upgrade request tracker foundations`.
6. Push se pehle check karo ke branch `main` hai aur koi unresolved merge conflict nahi.
7. Push ke baad Vercel → Deployments → latest deployment → **Build Logs** check karo. `Ready` hone ke baad hi site visit karo.

## 6. Included checks

- `Removed` webhook payload accepts the sheet-only flag while preserving tool status in the handler.
- Legacy webhook payload without `spreadsheetId` remains accepted.
- Tab-name validation and incomplete-field helper tests have been added.
- Role-change service guards last active admin demotion/disable and writes audit entries.

## 7. Not yet verified / remaining before production

The original upgrade request is broader than the implemented foundation. Do **not** treat these as complete in this package:

- per-project header-name based sync for every operation (append/update/clear/verify/refresh/import) across separate client sheets;
- client-generated Apps Script with secret and webhook URL, plus connected/not-installed project status;
- `Removed`/`Incomplete` badges on every list, Search, Site Check, project detail, and all dashboard surfaces;
- viewer permission enforcement and read-only rendering across every route/action, plus complete role/name/status audit history UI;
- server-side pagination, aggregate/RPC replacement for every large list, caching, route-level Suspense/loading states, animation/accessibility audit;
- complete end-to-end test coverage and before/after performance measurements.

These items must be finished and verified before using this as the live replacement.

## 8. Rollback plan

1. Vercel → Deployments mein last known-good deployment select karo → **Instant Rollback**.
2. GitHub Desktop mein known-good commit identify karo. Normal revert commit use karo; force-push mat karna.
3. Agar migration se issue aaye to pehle app rollback karo. SQL rollback manually chalane se pehle database backup aur foreign-key/data impact review karna zaroori hai; migration-created categories/columns ko blindly drop mat karna because project data may now depend on them.
