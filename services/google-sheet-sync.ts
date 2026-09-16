'use server';
import { google } from 'googleapis';
import { adminClient } from '@/lib/supabase-admin';

// ── Real Google Sheets push (app -> sheet) ───────────────────────────
// Requires a service account with edit access to the target spreadsheet.
// Set GOOGLE_SERVICE_ACCOUNT_JSON to the *base64-encoded* contents of the
// service account's JSON key file, and share the Guest Post Anchor sheet
// with that service account's client_email.
function credentialsConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

function getSheetsClient() {
  const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!, 'base64').toString('utf8');
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

type SyncableProject = {
  id: string;
  guest_post_tab_name: string | null;
  google_sheet_id: string | null;
  sync_enabled: boolean;
};

// Pushes a single "Status" cell update to the Guest Post Anchor sheet for
// the row that matches `website` in column A of the project's tab. Called
// whenever a project_site's or request's status changes.
export async function syncStatusToSheet(project: SyncableProject, website: string, status: string, requestId?: string, projectSiteId?: string) {
  if (!project.sync_enabled || !project.guest_post_tab_name || !project.google_sheet_id) {
    return { skipped: true, reason: 'sync not configured for this project' };
  }
  if (!credentialsConfigured()) {
    await adminClient.from('sync_logs').insert({
      request_id: requestId ?? null,
      project_site_id: projectSiteId ?? null,
      direction: 'to_sheet',
      sheet_name: project.guest_post_tab_name,
      status: 'skipped',
      detail: 'GOOGLE_SERVICE_ACCOUNT_JSON is not set',
    });
    return { skipped: true, reason: 'no service account configured' };
  }

  try {
    const sheets = getSheetsClient();
    const tab = project.guest_post_tab_name;
    const range = `${tab}!A2:G`;
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: project.google_sheet_id, range });
    const rows = data.values ?? [];
    const rowIndex = rows.findIndex((r) => (r[0] ?? '').trim().toLowerCase() === website.trim().toLowerCase());
    if (rowIndex === -1) {
      await adminClient.from('sync_logs').insert({
        request_id: requestId ?? null,
        project_site_id: projectSiteId ?? null,
        direction: 'to_sheet',
        sheet_name: tab,
        status: 'error',
        detail: `Website "${website}" not found in sheet`,
      });
      return { error: 'row not found' };
    }
    const sheetRow = rowIndex + 2; // header is row 1
    // Column F = Status, per the Website/Opportunity/Anchor/DR/Traffic/Status/Note layout.
    await sheets.spreadsheets.values.update({
      spreadsheetId: project.google_sheet_id,
      range: `${tab}!F${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[status]] },
    });
    await adminClient.from('sync_logs').insert({
      request_id: requestId ?? null,
      project_site_id: projectSiteId ?? null,
      direction: 'to_sheet',
      sheet_name: tab,
      sheet_row: sheetRow,
      status: 'success',
    });
    return { success: true, sheetRow };
  } catch (err: any) {
    await adminClient.from('sync_logs').insert({
      request_id: requestId ?? null,
      project_site_id: projectSiteId ?? null,
      direction: 'to_sheet',
      sheet_name: project.guest_post_tab_name,
      status: 'error',
      detail: String(err?.message ?? err),
    });
    return { error: String(err?.message ?? err) };
  }
}

// ── Sheet -> app (webhook receiver) ──────────────────────────────────
// See app/api/sheet-webhook/route.ts and the Apps Script snippet in the
// README: when someone edits the Status column in the Guest Post Anchor
// sheet, the sheet POSTs here and we mirror the change back into
// project_sites (and log it), completing the two-way sync.
export async function applyStatusFromSheet(projectId: string, website: string, status: string, sheetName: string, sheetRow: number) {
  const { data: site } = await adminClient
    .from('project_sites')
    .select('id')
    .eq('project_id', projectId)
    .ilike('website', website)
    .maybeSingle();

  if (!site) {
    await adminClient.from('sync_logs').insert({
      direction: 'from_sheet',
      sheet_name: sheetName,
      sheet_row: sheetRow,
      status: 'error',
      detail: `No project_sites row for website "${website}"`,
    });
    return { error: 'not found' };
  }

  await adminClient.from('project_sites').update({ status, sheet_row: sheetRow }).eq('id', site.id);
  await adminClient.from('sync_logs').insert({
    project_site_id: site.id,
    direction: 'from_sheet',
    sheet_name: sheetName,
    sheet_row: sheetRow,
    status: 'success',
  });
  return { success: true };
}
