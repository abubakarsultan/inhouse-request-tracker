# Assumptions

- The app's configured public origin is provided by `NEXT_PUBLIC_SITE_URL`; Google OAuth redirect URI must match it exactly.
- `GOOGLE_SERVICE_ACCOUNT_JSON` remains necessary for legacy team-sheet access and server-side sync. It is not used to create new project or collaboration spreadsheets.
- New sheets are created by the connected user's OAuth account. The service account is granted Editor access so existing server-side sync can access them.
- Setup errors after a spreadsheet is created should not delete that spreadsheet. The spreadsheet ID is saved first when the database callback succeeds.
- The factory uses a common set of Status values (`Pending`, `Approved`, `Live`, `Rejected`) for project sheets; collaboration tabs also include `Removed` because collaboration link statuses already support it.
- Google OAuth consent configuration and external API enablement must be completed by the deployment owner; they cannot be verified from the local code environment.
- Full setup retry UI, broader collaboration privacy verification, and phases 2–5 are outside the completed scope of this Phase 1 pass and are not claimed as done.
