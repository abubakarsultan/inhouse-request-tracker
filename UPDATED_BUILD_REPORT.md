# Updated Build Report - Project Categories + Sheet Mapping

Implemented from the latest requested changes:

1. Projects page now has Inhouse, Client, On Page, and Others category tabs.
2. Existing project rows default to Inhouse; the existing seed already contains 19 projects including Get Pro Links.
3. Add/Edit Project now stores Category, Sheet Source, Sheet ID (custom), Sheet name, Tab name, Sync enabled, and per-column mapping.
4. Admin can define each Sheet column letter, heading, and which app value should be written below it.
5. Project detail page includes Open Sheet and Sheet Details & Apps Script.
6. Project Apps Script is generated using that project's tab plus its mapped Website, Anchor, and Status columns.
7. Settings keeps global Guest Post Anchor Apps Script access behind a View Apps Script button instead of displaying the entire script by default.
8. Request -> Google Sheet writes now respect per-project column mapping, while blank/manual columns are preserved on updates.
9. Custom projects can use their own saved Google Sheet ID; existing Guest Post Anchor projects continue to fall back to TEAM_SHEET_ID.
10. Migration added: database/migrations/007_project_categories_sheet_mapping.sql.

Before deploying an EXISTING Supabase instance, run migration 007 in Supabase SQL Editor. Then push this build to GitHub and redeploy on Vercel.

Verification note: source files were syntax-parsed with the available global TypeScript compiler. A full Next.js build could not be executed in this workspace because the uploaded ZIP does not contain node_modules and dependency installation exceeded the execution window; Vercel/GitHub deployment will install dependencies from package-lock.json normally.
