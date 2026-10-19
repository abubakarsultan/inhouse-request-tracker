type RequestStatus = 'Request shared' | 'Live' | 'Rejected';

function isRequestStatus(value: string): value is RequestStatus {
  return value === 'Request shared' || value === 'Live' || value === 'Rejected';
}

export type SheetWebhookPayload = {
  tab: string;
  spreadsheetId?: string;
  row: number;
  website: string;
  anchor: string;
  status: RequestStatus;
};

export function parseSheetWebhookPayload(input: unknown):
  | { ok: true; value: SheetWebhookPayload }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'JSON body is required.' };
  const body = input as Record<string, unknown>;
  const tab = String(body.tab ?? '').trim();
  const row = Number(body.row);
  const spreadsheetId = body.spreadsheetId == null ? undefined : String(body.spreadsheetId).trim();
  const website = String(body.website ?? '').trim();
  const anchor = String(body.anchor ?? '').trim();
  const status = String(body.status ?? '').trim();

  if (!tab) return { ok: false, error: 'tab is required.' };
  if (spreadsheetId != null && !/^[A-Za-z0-9_-]{10,}$/.test(spreadsheetId)) return { ok: false, error: 'Invalid spreadsheetId.' };
  if (!Number.isInteger(row) || row < 2) return { ok: false, error: 'row must be an integer >= 2.' };
  if (!website) return { ok: false, error: 'website is required.' };
  if (!anchor) return { ok: false, error: 'anchor is required.' };
  if (!isRequestStatus(status)) return { ok: false, error: 'status must be "Request shared", "Live", or "Rejected".' };

  return { ok: true, value: { tab, spreadsheetId, row, website, anchor, status } };
}

export function normalizeImportedSiteStatus(value: unknown): RequestStatus {
  const cleaned = String(value ?? '').trim().toLowerCase();
  if (cleaned === 'live') return 'Live';
  if (cleaned === 'rejected' || cleaned === 'reject') return 'Rejected';
  return 'Request shared';
}

export function buildInstallableTriggerSnippet(siteUrl: string) {
  const base = siteUrl.replace(/\/+$/, '');
  return `const INHOUSE_REQUEST_WEBHOOK_URL = '${base}/api/sheet-webhook';
const SHEET_WEBHOOK_SECRET = 'PASTE_THE_SAME_SHEET_WEBHOOK_SECRET_HERE';

function installTrigger() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'onSheetEdit')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();
}

function isProjectTab_(sheet) {
  const headers = sheet.getRange(1, 1, 1, 7).getDisplayValues()[0];
  const expected = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note'];
  return expected.every((value, index) => String(headers[index] || '').trim() === value);
}

function onSheetEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  if (range.getColumn() !== 6 || range.getNumColumns() !== 1) return;
  if (!isProjectTab_(sheet)) return;

  const startRow = range.getRow();
  const rowCount = range.getNumRows();
  const values = sheet.getRange(startRow, 1, rowCount, 7).getDisplayValues();

  values.forEach((row, index) => {
    const sheetRow = startRow + index;
    if (sheetRow <= 1) return;
    const website = String(row[0] || '').trim();
    const anchor = String(row[2] || '').trim();
    const status = String(row[5] || '').trim();
    if (!website || !anchor) return;
    if (status !== 'Request shared' && status !== 'Live' && status !== 'Rejected') return;

    const response = UrlFetchApp.fetch(INHOUSE_REQUEST_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-sheet-webhook-secret': SHEET_WEBHOOK_SECRET },
      payload: JSON.stringify({
        tab: sheet.getName(),
        row: sheetRow,
        website: website,
        anchor: anchor,
        status: status
      }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      console.error('INHOUSE REQUEST webhook failed', response.getResponseCode(), response.getContentText());
    }
  });
}`;
}

/**
 * Each project gets its own named edit handler. This allows multiple project
 * tabs to live in the same Apps Script project without deleting another
 * project's installed trigger. The legacy Guest Post Anchor handler stays put.
 */
export function buildProjectTriggerSnippet(siteUrl: string, project: {
  id?: string | null;
  guest_post_tab_name?: string | null;
  google_sheet_id?: string | null;
  sheet_source?: string | null;
  column_mapping?: unknown;
}) {
  const base = siteUrl.replace(/\/+$/, '');
  const mapping = Array.isArray(project.column_mapping) ? project.column_mapping as Array<{ column?: string; field?: string }> : [];
  const colNum = (field: string, fallback: number) => {
    const item = mapping.find((entry) => entry.field === field);
    const col = String(item?.column || '').toUpperCase();
    if (!/^[A-Z]$/.test(col)) return fallback;
    return col.charCodeAt(0) - 64;
  };
  const websiteCol = colNum('approved_site', 1);
  const anchorCol = colNum('anchor', 3);
  const statusCol = colNum('status', 6);
  const tab = String(project.guest_post_tab_name || '');
  const spreadsheetId = project.sheet_source === 'custom_sheet' ? String(project.google_sheet_id || '') : '';
  // Stable short identifier, independent of Google tab names / special characters.
  const key = String(project.id || `${spreadsheetId}:${tab}`);
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const suffix = hash.toString(16).padStart(8, '0');
  const handler = `onProjectSheetEdit_${suffix}`;
  const installer = `installProjectTrigger_${suffix}`;
  const urlLiteral = JSON.stringify(`${base}/api/sheet-webhook`);
  const tabLiteral = JSON.stringify(tab);
  const idLiteral = JSON.stringify(spreadsheetId);
  return `// Project tab: ${tab.replace(/[\r\n]/g, ' ')}
// 1. Change SHEET_WEBHOOK_SECRET to the same secret set in Vercel.
// 2. Open Extensions > Apps Script in this Sheet and paste the code.
// 3. Run ${installer} once and approve the Google permission prompt.
// Existing Guest Post Anchor workbook: DO NOT install another trigger.

function ${installer}() {
  const spreadsheet = SpreadsheetApp.getActive();
  const expectedSheetId = ${idLiteral};
  if (expectedSheetId && spreadsheet.getId() !== expectedSheetId) {
    throw new Error('Wrong Google Sheet. Open Apps Script from the selected project spreadsheet.');
  }
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === ${JSON.stringify(handler)})
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(${JSON.stringify(handler)})
    .forSpreadsheet(spreadsheet).onEdit().create();
}

function ${handler}(e) {
  if (!e || !e.range) return;
  const PROJECT_TAB = ${tabLiteral};
  const PROJECT_SPREADSHEET_ID = ${idLiteral};
  const INHOUSE_REQUEST_WEBHOOK_URL = ${urlLiteral};
  const SHEET_WEBHOOK_SECRET = 'PASTE_THE_SAME_SHEET_WEBHOOK_SECRET_HERE';
  const WEBSITE_COLUMN = ${websiteCol};
  const ANCHOR_COLUMN = ${anchorCol};
  const STATUS_COLUMN = ${statusCol};
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== PROJECT_TAB) return;
  if (PROJECT_SPREADSHEET_ID && sheet.getParent().getId() !== PROJECT_SPREADSHEET_ID) return;
  if (range.getColumn() > STATUS_COLUMN || range.getLastColumn() < STATUS_COLUMN) return;
  for (let i = 0; i < range.getNumRows(); i++) {
    const sheetRow = range.getRow() + i;
    if (sheetRow <= 1) continue;
    const website = String(sheet.getRange(sheetRow, WEBSITE_COLUMN).getDisplayValue() || '').trim();
    const anchor = String(sheet.getRange(sheetRow, ANCHOR_COLUMN).getDisplayValue() || '').trim();
    const status = String(sheet.getRange(sheetRow, STATUS_COLUMN).getDisplayValue() || '').trim();
    if (!website || !anchor || !['Request shared', 'Live', 'Rejected'].includes(status)) continue;
    const response = UrlFetchApp.fetch(INHOUSE_REQUEST_WEBHOOK_URL, {
      method: 'post', contentType: 'application/json',
      headers: { 'x-sheet-webhook-secret': SHEET_WEBHOOK_SECRET },
      payload: JSON.stringify({
        tab: sheet.getName(), spreadsheetId: PROJECT_SPREADSHEET_ID || undefined,
        row: sheetRow, website, anchor, status
      }), muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      console.error('Project status sync error', response.getResponseCode(), response.getContentText());
    }
  }
}`;
}
