# V7.5 - Create Request per-project Google Sheet sync fix

## Root cause found in V7.4 source

The `createRequest()` project lookup in `services/requests.ts` selected the tab and sync status but did not select `google_sheet_id`, `sheet_source`, or `column_mapping`. Consequently, the Sheet sync service could fall back to the shared Guest Post Anchor workbook and default A:H columns even when a Client / On Page / Others project had a separate Google Sheet. A missing tab in that *wrong* workbook returned the misleading message: "This client has no tab in the team sheet (saved here only)." A different genuinely unconfigured project can also yield the same old message. The user's screenshot does not reveal which project was selected after the form reset.

## Changes

- `createRequest` now loads the selected project's `google_sheet_id`, `sheet_source`, `sheet_name`, `column_mapping`, and tab, so `getTeamSheetId` routes custom-sheet projects to their own spreadsheet.
- Pass target URL, priority, deadline, creator and project info to the dynamically mapped Sheet row.
- Show selected project's Sheet destination and sync availability *before* Create Request is submitted, and show saved project name in the confirmation.
- Missing configured tab / missing custom spreadsheet ID / wrong tab now return actionable failed-sync messages instead of a silent skipped sync; the DB request remains saved.
- Add Retry Sync to the action menu for previously saved unsynced requests on All Requests and My Requests. This operates on the existing request ID, not by creating another request.
- Before appending a row, check for an existing row with matching approved site and anchor in the selected project tab under the per-tab write lock. If a matching row already exists, sync its status and re-link the row instead of appending a duplicate.
- Preserve existing Guest Post Anchor mapping and status webhook code; no destructive data migration.
- Add read-only diagnostic SQL: `database/checks/002_request_sheet_sync_readiness.sql`.

## Deployment and verification

1. Deploy the full `inhouse-build` source to GitHub / Vercel. No new database migration is required for V7.5 if previous required migrations are already applied.
2. Confirm that custom-sheet projects have the correct Sheet URL/ID, tab, mapping, Editor access for the service account, and enabled sync via **Projects > Sheet Details**.
3. Run optional read-only readiness SQL in Supabase.
4. Open Create Request and select a configured project. The form should show the project's target Sheet and tab.
5. Create one new test request, and verify the success message shows an actual tab and row in the expected spreadsheet. If the request was already saved in an earlier test, use **All Requests/My Requests > Retry sync**, not Create Request again.
6. For a new custom project, install and authorize its Apps Script edit trigger once if bidirectional status editing from Google Sheets is required. Outbound app-to-Sheet writing itself uses the Google Sheets API and does not require that trigger.

## Verification performed

- `node --experimental-strip-types --test tests/*.test.mjs`: 52/52 passed.
- Parsed 101 TypeScript / TSX source files using the TypeScript parser: no syntax errors.
- ZIP integrity checked after packaging.
- Full production `next build` and live Google Sheets write could not be verified in this container. `npm ci` failed with npm's "Exit handler never called" error. Verify build and live Sheet write after deploying.

No live database rows or spreadsheets were modified by this patch.
