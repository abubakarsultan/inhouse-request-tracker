# Assumptions

- The app's configured public origin is provided by `NEXT_PUBLIC_SITE_URL`; Google OAuth redirect URI must match it exactly.
- `GOOGLE_SERVICE_ACCOUNT_JSON` remains necessary for legacy team-sheet access and server-side sync. It is not used to create new project or collaboration spreadsheets.
- New sheets are created by the connected user's OAuth account. The service account is granted Editor access so existing server-side sync can access them.
- Setup errors after a spreadsheet is created should not delete that spreadsheet. The spreadsheet ID is saved first when the database callback succeeds.
- The factory uses a common set of Status values (`Pending`, `Approved`, `Live`, `Rejected`) for project sheets; collaboration tabs also include `Removed` because collaboration link statuses already support it.
- Google OAuth consent configuration and external API enablement must be completed by the deployment owner; they cannot be verified from the local code environment.
- Full setup retry UI, broader collaboration privacy verification, and phases 2–5 are outside the completed scope of this Phase 1 pass and are not claimed as done.


## Review pass assumptions
- A project created in an admin's Drive stores `sheet_owner_user_id`; only that owner connection can repair service-account access. An admin without that owner's Google connection cannot repair the sheet by impersonation.
- Preparing an existing collaboration spreadsheet validates existing header rows and only writes missing header rows / Record ID header; it does not rewrite A:G data.
- External invited users do not automatically claim a fixed team sheet name; their Google display name/email prefix is used for request assignment while `sheet_name` remains null.
- Removed is treated as a sheet-only flag and never added to the app's request status selector.
- Full browser/E2E tests against Supabase and Google APIs require the deployment credentials and cannot be inferred from local source tests.
