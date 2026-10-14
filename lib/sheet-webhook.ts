type RequestStatus = 'Request shared' | 'Live' | 'Rejected';

function isRequestStatus(value: string): value is RequestStatus {
  return value === 'Request shared' || value === 'Live' || value === 'Rejected';
}

export type SheetWebhookPayload = {
  tab: string;
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
  const website = String(body.website ?? '').trim();
  const anchor = String(body.anchor ?? '').trim();
  const status = String(body.status ?? '').trim();

  if (!tab) return { ok: false, error: 'tab is required.' };
  if (!Number.isInteger(row) || row < 2) return { ok: false, error: 'row must be an integer >= 2.' };
  if (!website) return { ok: false, error: 'website is required.' };
  if (!anchor) return { ok: false, error: 'anchor is required.' };
  if (!isRequestStatus(status)) return { ok: false, error: 'status must be "Request shared", "Live", or "Rejected".' };

  return { ok: true, value: { tab, row, website, anchor, status } };
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

export function buildProjectTriggerSnippet(siteUrl: string, project: { guest_post_tab_name?: string | null; column_mapping?: unknown }) {
  const base = siteUrl.replace(/\/+$/, '');
  const mapping = Array.isArray(project.column_mapping) ? project.column_mapping as Array<{ column?: string; field?: string }> : [];
  const colNum = (field: string, fallback: number) => {
    const item = mapping.find((entry) => entry.field === field);
    const col = String(item?.column || '').toUpperCase();
    if (!col) return fallback;
    let n = 0; for (const c of col) n = n * 26 + c.charCodeAt(0) - 64; return n || fallback;
  };
  const websiteCol = colNum('approved_site', 1);
  const anchorCol = colNum('anchor', 3);
  const statusCol = colNum('status', 6);
  const tab = String(project.guest_post_tab_name || '').replace(/'/g, "\\'");
  return `const INHOUSE_REQUEST_WEBHOOK_URL = '${base}/api/sheet-webhook';\nconst SHEET_WEBHOOK_SECRET = 'PASTE_THE_SAME_SHEET_WEBHOOK_SECRET_HERE';\nconst PROJECT_TAB = '${tab}';\nconst WEBSITE_COLUMN = ${websiteCol};\nconst ANCHOR_COLUMN = ${anchorCol};\nconst STATUS_COLUMN = ${statusCol};\n\nfunction installTrigger() {\n  const spreadsheet = SpreadsheetApp.getActive();\n  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'onSheetEdit').forEach(t => ScriptApp.deleteTrigger(t));\n  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(spreadsheet).onEdit().create();\n}\n\nfunction onSheetEdit(e) {\n  if (!e || !e.range) return;\n  const range = e.range;\n  const sheet = range.getSheet();\n  if (sheet.getName() !== PROJECT_TAB || range.getColumn() !== STATUS_COLUMN || range.getNumColumns() !== 1) return;\n  const startRow = range.getRow();\n  const rowCount = range.getNumRows();\n  for (let i = 0; i < rowCount; i++) {\n    const sheetRow = startRow + i;\n    if (sheetRow <= 1) continue;\n    const website = String(sheet.getRange(sheetRow, WEBSITE_COLUMN).getDisplayValue() || '').trim();\n    const anchor = String(sheet.getRange(sheetRow, ANCHOR_COLUMN).getDisplayValue() || '').trim();\n    const status = String(sheet.getRange(sheetRow, STATUS_COLUMN).getDisplayValue() || '').trim();\n    if (!website || !anchor || !['Request shared','Live','Rejected'].includes(status)) continue;\n    const response = UrlFetchApp.fetch(INHOUSE_REQUEST_WEBHOOK_URL, {\n      method: 'post', contentType: 'application/json', headers: { 'x-sheet-webhook-secret': SHEET_WEBHOOK_SECRET },\n      payload: JSON.stringify({ tab: sheet.getName(), row: sheetRow, website, anchor, status }), muteHttpExceptions: true\n    });\n    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) console.error('INHOUSE REQUEST webhook failed', response.getResponseCode(), response.getContentText());\n  }\n}`;
}
