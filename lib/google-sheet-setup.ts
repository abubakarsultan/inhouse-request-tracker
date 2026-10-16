import 'server-only';
import { google } from 'googleapis';
import { DEFAULT_COLUMN_MAPPING, type ColumnMapping, type SheetDataField } from '@/lib/project-sheet';
import { parseGoogleSheetUrl } from '@/lib/google-sheet-url';

function serviceAccountCredentials() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!encoded) throw new Error('Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON in Vercel.');
  try {
    const credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!credentials.client_email || !credentials.private_key) throw new Error('Incomplete service account');
    return credentials;
  } catch {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON. It must be a base64-encoded service-account key.');
  }
}

/** The email is public; never expose the private key or full credential. */
export function getServiceAccountEmail(): string | null {
  try { return String(serviceAccountCredentials().client_email); } catch { return null; }
}

const normalize = (heading: string) => heading.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim();
export function classifySheetHeader(heading: string): SheetDataField {
  const text = normalize(heading);
  if (/^(website|websites|site|approved site|domain|domain url|website url|site url|url|approved website)$/.test(text)) return 'approved_site';
  if (/^(target url|target link)$/.test(text)) return 'target_url';
  if (/^(opportunity|placement page|placement url|placement link|target page|page url|page link)$/.test(text)) return 'placement_page';
  if (/^(anchor|anchor text|keyword|anchor keyword)$/.test(text)) return 'anchor';
  if (/^(dr|domain rating)$/.test(text)) return 'dr';
  if (/^(traffic|organic traffic)$/.test(text)) return 'traffic';
  if (/^(notes|note)$/.test(text)) return 'note';
  if (/^(priority)$/.test(text)) return 'priority';
  if (/^(deadline|due date)$/.test(text)) return 'deadline';
  if (/^(status|link status|request status|publication status|live status)$/.test(text)) return 'status';
  if (/^(assigned to|assign to|assignee|note assigned to|owner)$/.test(text)) return 'assign_to';
  if (/^(created by email|requester email|email)$/.test(text)) return 'created_by_email';
  if (/^(created by|requester name)$/.test(text)) return 'created_by_name';
  return 'blank';
}

export function mappingFromHeaders(values: unknown[]): ColumnMapping[] {
  const headings = values.slice(0, 26).map((value) => String(value ?? '').trim());
  if (!headings.some(Boolean)) return DEFAULT_COLUMN_MAPPING;
  const seen = new Set<string>();
  const result: ColumnMapping[] = headings.map((heading, index) => {
    const field = classifySheetHeader(heading);
    const safeField = field !== 'blank' && !seen.has(field) ? field : 'blank';
    if (safeField !== 'blank') seen.add(safeField);
    return { column: String.fromCharCode(65 + index), heading, field: safeField };
  });
  return result;
}

export async function resolveGoogleSheetUrl(sheetUrl: string) {
  const { spreadsheetId, gid } = parseGoogleSheetUrl(sheetUrl);
  const account = serviceAccountCredentials();
  const auth = new google.auth.GoogleAuth({ credentials: account, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  try {
    const result = await sheets.spreadsheets.get({ spreadsheetId, fields: 'properties(title),sheets(properties(sheetId,title,index))' });
    const tabs = (result.data.sheets || []).map((item) => item.properties).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const tab = gid == null ? tabs[0] : tabs.find((item) => item.sheetId === gid);
    if (!tab?.title || tab.sheetId == null) throw new Error('This Google Sheet tab was not found. Check the tab link.');
    const escaped = tab.title.replace(/'/g, "''");
    const headingResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${escaped}'!A1:Z1` });
    return {
      google_sheet_id: spreadsheetId,
      google_sheet_gid: tab.sheetId,
      sheet_name: result.data.properties?.title || tab.title,
      guest_post_tab_name: tab.title,
      column_mapping: mappingFromHeaders(headingResponse.data.values?.[0] || []),
    };
  } catch (error) {
    const status = Number((error as { code?: number; response?: { status?: number } }).code ?? (error as { response?: { status?: number } }).response?.status ?? 0);
    if (status === 403 || status === 404) throw new Error(`Google cannot access this spreadsheet. Open Share, give Editor access to ${account.client_email}, and try again.`);
    if (status === 429) throw new Error('Google Sheets is temporarily rate limiting requests. Please try again.');
    throw error;
  }
}

/** List accessible tabs and their header-derived default mapping. Caller must authorize admin. */
export async function inspectProjectSpreadsheet(sheetUrl?: string, shared = false) {
  const spreadsheetId = shared ? process.env.TEAM_SHEET_ID : (sheetUrl ? parseGoogleSheetUrl(sheetUrl).spreadsheetId : null);
  if (!spreadsheetId) throw new Error(shared ? 'TEAM_SHEET_ID is missing in Vercel.' : 'Paste a Google Sheet URL.');
  const account = serviceAccountCredentials();
  const auth = new google.auth.GoogleAuth({ credentials: account, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const client = google.sheets({ version: 'v4', auth });
  try {
    const result = await client.spreadsheets.get({ spreadsheetId, fields: 'properties(title),sheets(properties(sheetId,title,index))' });
    const tabs = (result.data.sheets ?? []).flatMap((sheet) => sheet.properties?.title != null && sheet.properties.sheetId != null
      ? [{ gid: Number(sheet.properties.sheetId), title: sheet.properties.title }] : []);
    return { spreadsheetId, title: String(result.data.properties?.title || 'Google Sheet'), tabs };
  } catch (error) {
    const status = Number((error as any)?.code || (error as any)?.response?.status || 0);
    if (status === 403 || status === 404) throw new Error(`Google cannot open this spreadsheet. Share it with ${account.client_email} as Editor, then try again.`);
    throw error;
  }
}

export async function inspectProjectTab(sheetUrl: string) {
  const result = await resolveGoogleSheetUrl(sheetUrl);
  return result;
}

/** Best effort: some service accounts cannot create files without a Shared Drive. */
export async function createBlankProjectSpreadsheet(title: string, tab: string, adminEmail: string, columnMapping: ColumnMapping[]) {
  const account = serviceAccountCredentials();
  const auth = new google.auth.GoogleAuth({ credentials: account, scopes: [
    'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file',
  ] });
  const sheets = google.sheets({ version: 'v4', auth });
  const created = await sheets.spreadsheets.create({ requestBody: {
    properties: { title }, sheets: [{ properties: { title: tab } }],
  }, fields: 'spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title))' });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error('Google did not return a spreadsheet ID.');
  // Initialize column headings in a brand-new spreadsheet. This never touches an
  // existing Guest Post Anchor workbook or existing row data.
  const headers = columnMapping.map((item) => item.heading);
  if (headers.length) {
    const end = String.fromCharCode(64 + headers.length);
    const escapedTab = tab.replace(/'/g, "''");
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `'${escapedTab}'!A1:${end}1`, valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
  // Never assume the creating service account gave the signed-in user access.
  try {
    const drive = google.drive({ version: 'v3', auth });
    await drive.permissions.create({ fileId: spreadsheetId, sendNotificationEmail: true,
      requestBody: { type: 'user', role: 'writer', emailAddress: adminEmail }, fields: 'id' });
  } catch (error) {
    throw new Error(`Spreadsheet ${spreadsheetId} was created but could not be shared with ${adminEmail}. Share it manually in Google Drive, then connect its URL. ${error instanceof Error ? error.message : ''}`);
  }
  return {
    google_sheet_id: spreadsheetId, google_sheet_gid: Number(created.data.sheets?.[0]?.properties?.sheetId ?? 0),
    sheet_name: title, guest_post_tab_name: tab,
  };
}
