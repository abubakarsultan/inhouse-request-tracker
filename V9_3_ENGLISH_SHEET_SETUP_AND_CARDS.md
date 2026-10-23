# V9.3 — English post-save Sheet setup and cleaner Project cards

## Included changes

- After a **new project** is successfully created in the four-step wizard, the API returns the saved project slug and redirects the admin to `/projects/[slug]/sheet-setup`.
- The setup guide is **English-only**. It shows **Open Google Sheet**, **Copy Apps Script**, **View Script**, permission/secret instructions, and a manual two-way-status-sync verification procedure.
- **Guest Post Anchor** projects get a distinct guide explaining that their existing workbook-level edit trigger must be reused. **Do not install a duplicate per-project trigger.**
- Project cards now have a directly clickable **Open Sheet** link, a compact **Sheet Details** button for admins, and a cleaner, flatter metrics strip. When no spreadsheet ID exists, no fake/invalid URL is rendered.
- Existing Edit Project saves return to the Projects page without a forced setup redirect.
- Existing database records, OAuth settings, column mappings, and Google Sheet sync logic are unchanged. No new Supabase migration or Vercel environment variable is required for this release.

## How to deploy safely

1. Back up your current source code and preserve your working Vercel deployment.
2. Extract the ZIP; commit the **contents** of `inhouse-request-tracker-main/` into your GitHub repository root on a new `v9-3-sheet-setup` branch.
3. Create a Vercel Preview deployment. Ensure `npm ci`, strict TypeScript checking, and `npm run build` complete successfully. (The local runtime used to create this ZIP could not install npm dependencies.)
4. Preview `/projects`: confirm cards show compact counts, **Open Project**, **Open Sheet**, and admin-only **Sheet Details**.
5. Create a disposable **new custom project** with a Sheet URL (or automatic creation). After successful save, check the **English setup guide** opens automatically.
6. Open the Sheet from that guide and verify it targets the correct spreadsheet. Do not paste secrets into logs/screenshots. Install the script manually following the guide and verify a safe test row's Status change reaches the app.
7. Create a disposable project using **Guest Post Anchor** and verify the guide tells you **not** to install a second trigger.
8. Check existing 19+ projects, normal request creation, and collaboration tracking are unaffected, then merge Preview into Production.

## Notes

- The guide **does not claim** an edit trigger is installed or that two-way sync has been verified. Generating the Apps Script is not the same as authorizing/installing it.
- On an already configured shared Guest Post Anchor workbook, re-installing the snippet can cause duplicate webhook events. Keep using the existing workbook-level trigger.
- Do not change or reveal `SHEET_WEBHOOK_SECRET`, OAuth Client Secret, `TOKEN_ENCRYPTION_KEY`, or Service Role Key to test the interface.
- No SQL migration needs to be repeated. Any previously required migrations for other V9 features are separate.
- If the Preview build fails, keep the current Production version and investigate the first Vercel build/runtime error rather than replacing Production.

## Verification in packaging environment

- New post-save tests: 5/5 passed.
- Full existing test suite: 114/115 passed; 1 blocked by missing local `zod` dependency.
- Source parser and local import scan: 161 TS/TSX files and 372 local imports checked before the card redesign; final scan and ZIP integrity performed again at packaging.
- Full dependency-backed `next build` **not verified** locally. The npm installer exited with an internal npm error, leaving the required packages unavailable.
