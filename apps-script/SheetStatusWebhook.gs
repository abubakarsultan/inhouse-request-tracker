// Install this in the TEAM SHEET (Guest Post Anchor) Apps Script project.
// Replace the two constants below, save, then run installTrigger() once.
// This must be an INSTALLABLE edit trigger because UrlFetchApp is not allowed
// from a simple onEdit trigger.

const INHOUSE_REQUEST_WEBHOOK_URL = 'https://YOUR-SITE.example/api/sheet-webhook';
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
    if (status !== 'Request shared' && status !== 'Live') return;

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
}
