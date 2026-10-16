# V8.3 — Single Workbook Collaboration Template

## What changed
- One `.xlsx` template file replaces the ZIP of three CSV files. Excel/Google Sheets require XLSX for a multi-tab file; CSV cannot contain tabs.
- Template contains exactly three tabs: `Rankviz`, partner name (Excel-safe max 31 characters), `Summary`.
- Both link tabs contain columns A:G (`Date`, `Website`, `Placement Page`, `Anchor`, `Target Link`, `Status`, `Exchange ID`), plus hidden H `Record ID` for sync reconciliation.
- Summary tab has A:C metrics matching the app-generated report; values are initially zero and refreshed after connection.
- Partner Wizard and Partner Details both point to the same download endpoint.
- Automatic creation continues to produce one Google Spreadsheet with three tabs.
- Original project/Guest Post Anchor and collaboration CSV **data exports** remain unchanged.

## One-file manual connection workflow
1. Select **Excel Template & Connect** from Create Partner.
2. Download **Collaboration Template (.xlsx)** (one file).
3. In Google Drive choose **New -> File upload**; upload the XLSX **once**.
4. Open with Google Sheets and use **File -> Save as Google Sheets** if the uploaded file is still an XLSX.
5. Share the converted/native Google Spreadsheet with the app's Google service-account email as **Editor** (unless OAuth already has access).
6. Paste the **Google Sheets** URL into the wizard. The app checks all three tabs, headings and editor access and stores a single spreadsheet ID.

Do not upload three CSV files. Do not paste a Drive XLSX link where a Google Sheets `/spreadsheets/d/...` URL is required.

## Deployment
- This is a code change only; no new SQL migration from V8.2 to V8.3. Migration `010_collaboration_module.sql` must already be applied for collaboration functionality.
- Deploy source to GitHub/Vercel; test `/api/collaboration/templates?partner=Example` as an admin, open XLSX, and check three tabs.
- Test manual connect on a fresh test partner with Google Editor access.
- Google Sheet -> app still requires Apps Script trigger authorization; App -> Sheet uses existing Google Sheets API integration.

## Verification scope
- Tests and static TS/TSX parser checks are available locally.
- Full Vercel production build and live Google authorization/Sheet write require the production environment. Do not claim these are complete until deployed.
