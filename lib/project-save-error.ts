/**
 * Show admins actionable errors from project setup without exposing raw server
 * exceptions (Google API bodies, SQL details, or credentials) to the browser.
 * The complete error is logged only on the server by the calling action.
 */
export function describeProjectSaveError(error: unknown): string {
  const value = error && typeof error === 'object' ? error as {
    code?: unknown; message?: unknown; status?: unknown;
    issues?: { message?: string }[];
  } : null;
  const code = String(value?.code ?? '');
  const message = typeof value?.message === 'string' ? value.message : error instanceof Error ? error.message : '';

  // Zod validation errors may arise from stale/malformed wizard input.
  if (Array.isArray(value?.issues) && value.issues.length > 0) {
    return `Check the project setup: ${value.issues[0]?.message || 'invalid input'}.`;
  }

  // PostgREST/Supabase errors: guide admins to migration and permission fixes.
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST205' ||
      /column .* of relation .* does not exist|could not find the .* column .* in the schema cache/i.test(message)) {
    return 'The Supabase projects table is missing a required field. Apply project migrations 007 and 008 in order, refresh the PostgREST schema cache, and try again.';
  }
  if (code === '23514') {
    return 'The database rejected this project category or Sheet source. Verify project migration 007_project_categories_sheet_mapping.sql has been applied.';
  }
  if (code === '23505') return 'A project or Sheet connection with the same unique value already exists. Review the project name, tab and linked Sheet.';
  if (code === '42501' || code === 'PGRST301') {
    return 'Supabase denied this project save. Check the server-side service-role configuration and the signed-in admin account.';
  }
  if (code === '23502') return 'The database requires a field that was not supplied. Check the project configuration and database migrations.';
  if (code === '22P02') return 'The database rejected an invalid field value. Recheck the Sheet tab and column mapping.';
  if (code === 'PGRST116') return 'The project record could not be found. Refresh the Projects page and try again.';
  if (/duplicate key value violates unique constraint/i.test(message)) {
    return 'A project with that name or Sheet configuration already exists. Check the existing projects before saving.';
  }

  // Only server-authored messages from known, intentional validation checks.
  const safePatterns = [
    /^This Guest Post Anchor tab is already connected to /,
    /^This Google Sheet tab already belongs to /,
    /^This spreadsheet tab is already mapped to /,
    /^That Guest Post Anchor tab was not found/,
    /^Select a Guest Post Anchor project tab\./,
    /^Google cannot access this spreadsheet\./,
    /^Google cannot open this spreadsheet\./,
    /^This Google Sheet tab was not found\./,
    /^Google Sheets is temporarily rate limiting requests\./,
    /^Paste the Google Sheet URL/,
    /^Invalid Google Sheets URL/,
    /^Only https:\/\/docs\.google\.com Google Sheets links are supported\./,
    /^New Sheet title and tab name are required\./,
    /^Create a new Google Sheet only while adding a project\./,
    /^Existing Guest Post Anchor project tabs cannot be reassigned\./,
    /^Admin access required\./,
    /^Please sign in again\./,
    /^Your account is (disabled|waiting for admin approval)\./,
    /^Complete your profile first\./,
    /^The (Inhouse|Client|On Page|Others) category is missing or inactive\./,
    /^Project categories could not be loaded\./,
    /^TEAM_SHEET_ID is missing in Vercel\./,
    /^Google Sheets is not configured\./,
    /^Invalid GOOGLE_SERVICE_ACCOUNT_JSON\./,
  ];
  if (safePatterns.some((pattern) => pattern.test(message))) return message;
  if (/\b(403|404)\b/.test(message) && /sheets|google/i.test(message)) {
    return 'Google could not access this Sheet. Confirm that the service-account email has Editor access.';
  }
  return 'Project could not be saved. Check the Vercel Runtime Logs for [project:save] and confirm Supabase migrations 007/008 are installed.';
}
