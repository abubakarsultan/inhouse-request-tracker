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
