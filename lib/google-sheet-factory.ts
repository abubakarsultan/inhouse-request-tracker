import 'server-only';
import { google } from 'googleapis';
import { getServiceAccountEmail } from '@/lib/google-sheet-setup';
import { getUserGoogleClient } from '@/lib/google-user-auth';

export type SpreadsheetTabSpec = { title: string; headers: string[]; statusValues?: string[]; hiddenColumns?: number[] };
export type CreatedUserSpreadsheet = { spreadsheetId: string; url: string; tabs: Array<{ title: string; gid: number }>; ownerEmail: string; setupState: 'connected' | 'error'; setupError: string | null };
function explainGoogleError(error: unknown) {
  const e = error as { code?: number; response?: { status?: number }; message?: string };
  const code = Number(e?.code || e?.response?.status || 0);
  const message = String(e?.message || error || 'Unknown Google API error');
  if (/storage quota|quota exceeded.*storage/i.test(message)) return 'Your Google Drive storage may be full. Free up Drive space and retry setup.';
  if (code === 403 && /drive api|drive.googleapis.com/i.test(message)) return 'Enable the Google Drive API in Google Cloud, then retry setup.';
  if (code === 403 && /sheets api|sheets.googleapis.com/i.test(message)) return 'Enable the Google Sheets API in Google Cloud, then retry setup.';
  if (code === 403 || code === 404) return 'Google could not grant or verify service-account access. The sheet was kept; use Retry / Repair access.';
  return message.slice(0, 350);
}
function serviceAccountAuth() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!encoded) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing. Configure the service account used for server-side sheet sync.');
  let credentials: { client_email?: string; private_key?: string };
  try { credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is invalid.'); }
  if (!credentials.client_email || !credentials.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');
  return new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });
}
function columnLetters(number: number) { let n = number; let out = ''; while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); } return out; }

/** Creates in the user's own Drive. onCreated must persist the ID before any setup step. */
export async function createSpreadsheetForUser(input: { userId: string; title: string; tabs: SpreadsheetTabSpec[]; extraEditors?: string[]; onCreated?: (sheet: { spreadsheetId: string; url: string; tabs: Array<{ title: string; gid: number }>; ownerEmail: string }) => Promise<void> }): Promise<CreatedUserSpreadsheet> {
  if (!input.tabs.length) throw new Error('At least one tab is required.');
  const owner = await getUserGoogleClient(input.userId);
  const sheets = google.sheets({ version: 'v4', auth: owner });
  let ownerEmail = '';
  try { const me = await google.oauth2({ version: 'v2', auth: owner }).userinfo.get(); ownerEmail = String(me.data.email || ''); } catch { /* Drive creation remains authoritative; email is display metadata. */ }
  const created = await sheets.spreadsheets.create({ requestBody: { properties: { title: input.title }, sheets: input.tabs.map((tab) => ({ properties: { title: tab.title } })) }, fields: 'spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title))' });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error('Google did not return a spreadsheet ID.');
  const url = String(created.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  const tabs = (created.data.sheets || []).flatMap((sheet) => sheet.properties?.title && sheet.properties.sheetId != null ? [{ title: sheet.properties.title, gid: Number(sheet.properties.sheetId) }] : []);
  // Critical recovery point: callers persist this ID before any further API call.
  await input.onCreated?.({ spreadsheetId, url, tabs, ownerEmail });
  try {
    const requests: any[] = [];
    for (const spec of input.tabs) {
      const meta = tabs.find((tab) => tab.title === spec.title);
      if (!meta) throw new Error(`Google did not create tab "${spec.title}".`);
      if (spec.headers.length) {
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${spec.title.replace(/'/g, "''")}'!A1:${columnLetters(spec.headers.length)}1`, valueInputOption: 'RAW', requestBody: { values: [spec.headers] } });
      }
      requests.push({ updateSheetProperties: { properties: { sheetId: meta.gid, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
      requests.push({ repeatCell: { range: { sheetId: meta.gid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.78, green: 0.91, blue: 0.80 }, textFormat: { bold: true, foregroundColor: { red: 0.08, green: 0.25, blue: 0.12 } }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)' } });
      for (const hiddenIndex of spec.hiddenColumns || []) requests.push({ updateDimensionProperties: { range: { sheetId: meta.gid, dimension: 'COLUMNS', startIndex: hiddenIndex, endIndex: hiddenIndex + 1 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
      for (let i = 0; i < spec.headers.length; i++) requests.push({ updateDimensionProperties: { range: { sheetId: meta.gid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: Math.min(280, Math.max(110, spec.headers[i].length * 9 + 36)) }, fields: 'pixelSize' } });
      const statusIndex = spec.headers.findIndex((header) => header.trim().toLowerCase() === 'status');
      if (statusIndex >= 0 && spec.statusValues?.length) requests.push({ setDataValidation: { range: { sheetId: meta.gid, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: statusIndex, endColumnIndex: statusIndex + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: spec.statusValues.map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true } } });
      if (statusIndex >= 0) requests.push({ addConditionalFormatRule: { rule: { ranges: [{ sheetId: meta.gid, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: statusIndex, endColumnIndex: statusIndex + 1 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Live' }] }, format: { backgroundColor: { red: 0.78, green: 0.91, blue: 0.80 }, textFormat: { foregroundColor: { red: 0.08, green: 0.35, blue: 0.15 }, bold: true } } } }, index: 0 } });
    }
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    const serviceEmail = getServiceAccountEmail();
    if (!serviceEmail) throw new Error('Service account is not configured; set GOOGLE_SERVICE_ACCOUNT_JSON before enabling server-side sync.');
    const drive = google.drive({ version: 'v3', auth: owner });
    for (const email of [...new Set([serviceEmail, ...(input.extraEditors || []).map((item) => item.trim().toLowerCase()).filter(Boolean)])]) {
      await drive.permissions.create({ fileId: spreadsheetId, sendNotificationEmail: false, requestBody: { type: 'user', role: 'writer', emailAddress: email }, fields: 'id' });
    }
    const verify = google.sheets({ version: 'v4', auth: serviceAccountAuth() });
    await verify.spreadsheets.get({ spreadsheetId, fields: 'spreadsheetId,properties(title)' });
    return { spreadsheetId, url, tabs, ownerEmail, setupState: 'connected', setupError: null };
  } catch (error) {
    return { spreadsheetId, url, tabs, ownerEmail, setupState: 'error', setupError: explainGoogleError(error) };
  }
}

export async function repairServiceAccountAccess(userId: string, spreadsheetId: string) {
  const owner = await getUserGoogleClient(userId);
  const email = getServiceAccountEmail();
  if (!email) throw new Error('Configure GOOGLE_SERVICE_ACCOUNT_JSON before repairing access.');
  const drive = google.drive({ version: 'v3', auth: owner });
  const existing = await drive.permissions.list({ fileId: spreadsheetId, fields: 'permissions(id,emailAddress,role,type)' });
  const alreadyShared = (existing.data.permissions || []).some((permission) => String(permission.emailAddress || '').toLowerCase() === email.toLowerCase() && ['writer','owner'].includes(String(permission.role || '').toLowerCase()));
  if (!alreadyShared) await drive.permissions.create({ fileId: spreadsheetId, sendNotificationEmail: false, requestBody: { type: 'user', role: 'writer', emailAddress: email }, fields: 'id' });
  await google.sheets({ version: 'v4', auth: serviceAccountAuth() }).spreadsheets.get({ spreadsheetId, fields: 'spreadsheetId' });
}
