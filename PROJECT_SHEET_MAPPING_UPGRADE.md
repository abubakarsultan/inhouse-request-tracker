# Project + Sheet Mapping Upgrade

This build adds the requested project architecture and keeps existing Guest Post Anchor sync compatible.

## Visible changes
- Projects now have four categories: Inhouse, Client, On Page, Others.
- Existing projects default to Inhouse, including Get Pro Links.
- Add/Edit Project now includes category and Sheet Source.
- Sheet Source can be Guest Post Anchor or Custom/New Google Sheet.
- Each project stores its Sheet ID (for custom sheets), display name, tab name, sync status, and column mapping.
- Column mapping lets the admin choose both the Sheet heading and the app data written under that heading.
- Project details now show Open Sheet and Sheet Details & Apps Script buttons.
- Apps Script is generated for the project's tab and mapped Website/Anchor/Status columns.
- Settings no longer keeps the full Apps Script permanently open; it is behind View Apps Script.
- Tool -> Sheet request writes use the saved per-project mapping. Blank/manual columns are preserved during row updates.
- Missing header cells are initialized from the saved mapping without overwriting existing non-empty headers.

## Required database step for an existing Supabase project
Run `database/migrations/007_project_categories_sheet_mapping.sql` in Supabase SQL Editor before deploying this build.

New installs using `database/schema.sql` already include the new project columns.

## Environment variables
Existing variables remain valid. Guest Post Anchor continues to use `TEAM_SHEET_ID`. A custom project can store its own Google Sheet ID in the project settings.

## Deployment
After applying migration 007, deploy the repository to Vercel as before. No existing request rows need to be recreated.
