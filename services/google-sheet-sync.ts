import 'server-only';

import { randomUUID } from 'node:crypto';
import { google, type sheets_v4 } from 'googleapis';
import { adminClient } from '@/lib/supabase-admin';
import { normalizeForDuplicate, validateSheetTabName } from '@/lib/validators';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { buildInstallableTriggerSnippet, buildOwnSheetTriggerSnippet } from '@/lib/sheet-webhook';

type SyncableProject = {
  id: string;
  guest_post_tab_name: string | null;
  sync_enabled: boolean;
  google_sheet_id?: string | null;
  sheet_tab_name?: string | null;
  sheet_column_config?: Record<string, string> | null;
<<<<<<< HEAD
  sheet_source?: 'guest_post_anchor' | 'own_sheet' | 'none' | null;
=======
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
};

export type RequestSheetRecord = {
  id: string;
  project_id: string;
  approved_site: string;
  placement_page: string | null;
  target_url?: string | null;
  anchor: string;
  assign_to: string | null;
  status: string;
  team_tab: string | null;
  team_row: number | null;
  created_by_email?: string | null;
};

export type ProjectSiteSheetRecord = {
  id: string;
  project_id: string;
  website: string;
  opportunity: string | null;
  anchor: string | null;
  dr: number | null;
  traffic: number | null;
  status: string;
  note: string | null;
  team_row: number | null;
  created_by_email?: string | null;
};

export type SheetSyncResult = {
  state: 'synced' | 'skipped' | 'failed';
  text: string;
  tab?: string;
  row?: number;
  error?: string;
  repairedRow?: boolean;
};

let metadataCache: { spreadsheetId: string; expiresAt: number; titles: Set<string> } | null = null;
const METADATA_TTL_MS = 15_000;

function getTeamSheetId() {
  return (process.env.TEAM_SHEET_ID ?? '').trim();
}

function getSheetsClient() {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return google.sheets({ version: 'v4', auth });
}

function getServiceAccountCredentials() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!encoded) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  try { return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>; }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid base64-encoded JSON'); }
}

export function getServiceAccountEmail() {
  try { return String(getServiceAccountCredentials().client_email ?? '') || null; }
  catch { return null; }
}

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({ credentials: getServiceAccountCredentials(), scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth });
}

export async function prepareOwnSheetConnection(input: { mode: 'existing' | 'create'; title: string; url?: string | null; tabName?: string | null; shareEmails?: string[]; includeDrTraffic?: boolean }) {
  const tabName = (input.tabName || 'Live Link').trim();
  const invalid = validateSheetTabName(tabName);
  if (invalid) throw new Error(invalid);
  const sheets = getSheetsClient();
  let spreadsheetId = '';
  let url = '';
  if (input.mode === 'existing') {
    const match = String(input.url ?? '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error('Google Sheet URL is not valid. Copy the full URL from the browser address bar.');
    spreadsheetId = match[1];
    const response = await withGoogleRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'spreadsheetUrl,sheets.properties.title' }));
    const tabExists = (response.data.sheets ?? []).some((sheet) => sheet.properties?.title === tabName);
    if (!tabExists) throw new Error(`Tab “${tabName}” was not found in this Google Sheet.`);
    const headerResponse = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tabName)}!A1:Z1` }));
    const headers = (headerResponse.data.values?.[0] ?? []).map((value) => String(value ?? '').trim());
    const required = ['Live Link', 'Anchor', 'Target Page', 'Status'];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Missing required header(s) in “${tabName}”: ${missing.join(', ')}. Existing columns were left untouched.`);
    url = String(response.data.spreadsheetUrl ?? input.url ?? '');
  } else {
    const headers = input.includeDrTraffic ? ['Live Link', 'Anchor', 'Target Page', 'Status', 'DR', 'Traffic'] : ['Live Link', 'Anchor', 'Target Page', 'Status'];
    const created = await withGoogleRetry(() => sheets.spreadsheets.create({ requestBody: { properties: { title: input.title }, sheets: [{ properties: { title: tabName, gridProperties: { frozenRowCount: 1 } } }] } }));
    spreadsheetId = String(created.data.spreadsheetId ?? '');
    url = String(created.data.spreadsheetUrl ?? (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : ''));
    if (!spreadsheetId) throw new Error('Google created the sheet but did not return its ID. Check Google Cloud API access.');
    await withGoogleRetry(() => sheets.spreadsheets.values.update({ spreadsheetId, range: `${quoteTab(tabName)}!A1:${input.includeDrTraffic ? 'F' : 'D'}1`, valueInputOption: 'RAW', requestBody: { values: [headers] } }));
    const metadata = await withGoogleRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }));
    const sheetId = Number(metadata.data.sheets?.find((sheet) => sheet.properties?.title === tabName)?.properties?.sheetId);
    if (Number.isFinite(sheetId)) await withGoogleRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.12, green: 0.38, blue: 0.25 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
      { setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Request shared' }, { userEnteredValue: 'Live' }, { userEnteredValue: 'Rejected' }] }, strict: true, showCustomUi: true } } },
      { addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Live' }] }, format: { backgroundColor: { red: 0.82, green: 0.93, blue: 0.84 }, textFormat: { foregroundColor: { red: 0.08, green: 0.42, blue: 0.2 }, bold: true } } } } } },
    ] } }));
    const drive = getDriveClient();
    for (const email of [...new Set((input.shareEmails ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))]) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid sharing email: ${email}`);
      await withGoogleRetry(() => drive.permissions.create({ fileId: spreadsheetId, requestBody: { type: 'user', role: 'writer', emailAddress: email }, sendNotificationEmail: true, fields: 'id,emailAddress,role' }));
    }
  }
  return { spreadsheetId, url, tabName, serviceAccountEmail: getServiceAccountEmail(), sheetColumnConfig: { liveLink: 'Live Link', anchor: 'Anchor', targetUrl: 'Target Page', status: 'Status', ...(input.includeDrTraffic ? { dr: 'DR', traffic: 'Traffic' } : {}) }, shareEmails: input.shareEmails ?? [] };
}

function quoteTab(tab: string) {
  return `'${tab.replace(/'/g, "''")}'`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableGoogleError(error: unknown) {
  const candidate = error as { code?: number; status?: number; response?: { status?: number } };
  const code = Number(candidate?.code ?? candidate?.status ?? candidate?.response?.status ?? 0);
  return code === 429 || code >= 500;
}

async function withGoogleRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!retryableGoogleError(error) || attempt === attempts - 1) throw error;
      await wait(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function getTabTitles(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  if (metadataCache && metadataCache.spreadsheetId === spreadsheetId && metadataCache.expiresAt > Date.now()) {
    return metadataCache.titles;
  }

  const response = await withGoogleRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
  ) as { data: { sheets?: Array<{ properties?: { title?: string | null } | null }> } };
  const titles = new Set(
    (response.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title))
  );
  metadataCache = { spreadsheetId, expiresAt: Date.now() + METADATA_TTL_MS, titles };
  return titles;
}


export async function getTeamSheetTabs() {
  const spreadsheetId = getTeamSheetId();
  if (!spreadsheetId) throw new Error('TEAM_SHEET_ID is not configured.');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured.');
  const sheets = getSheetsClient();
  return [...(await getTabTitles(sheets, spreadsheetId))].sort((a, b) => a.localeCompare(b));
}

export async function checkProjectSheetConnection(projectId: string) {
  await requireActiveUserForAction();
  const { data: project, error } = await adminClient
    .from('projects')
    .select('id,name,sheet_source,sync_enabled,guest_post_tab_name,google_sheet_id,sheet_tab_name')
    .eq('id', projectId)
    .single();
  if (error || !project) throw new Error(error?.message ?? 'Project not found.');

  const source = String(project.sheet_source ?? '').trim() as 'guest_post_anchor' | 'own_sheet' | 'none';
  if (!project.sync_enabled || source === 'none') {
    return { ok: true, source: 'none' as const, detail: 'Tool only. Sheet sync is disabled for this project.', sheetUrl: null, tabName: null, tabExists: false };
  }

  const spreadsheetId = source === 'own_sheet' ? String(project.google_sheet_id ?? '').trim() : getTeamSheetId();
  const tabName = source === 'own_sheet'
    ? String(project.sheet_tab_name ?? '').trim()
    : String(project.guest_post_tab_name ?? project.sheet_tab_name ?? '').trim();
  if (!spreadsheetId) return { ok: false, source, detail: source === 'own_sheet' ? 'Project Google Sheet ID is not configured.' : 'TEAM_SHEET_ID is not configured.', sheetUrl: null, tabName: tabName || null, tabExists: false };
  if (!tabName) return { ok: false, source, detail: 'Project Sheet tab is not configured.', sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, tabName: null, tabExists: false };
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { ok: false, source, detail: 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.', sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, tabName, tabExists: false };

  const sheets = getSheetsClient();
  try {
    const titles = await getTabTitles(sheets, spreadsheetId);
    const tabExists = titles.has(tabName);
    return {
      ok: tabExists,
      source,
      detail: tabExists ? `Connected. Tab "${tabName}" is available.` : `Connected to the spreadsheet, but tab "${tabName}" was not found.`,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      tabName,
      tabExists,
    };
  } catch (caught) {
    return { ok: false, source, detail: caught instanceof Error ? caught.message : String(caught), sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, tabName, tabExists: false };
  }
}

export async function getProjectSheetScript(projectId: string, siteUrl: string) {
  await requireAdminForAction();
  const { data: project, error } = await adminClient
    .from('projects')
    .select('id,name,sheet_source,sync_enabled,guest_post_tab_name,google_sheet_id,sheet_tab_name')
    .eq('id', projectId)
    .single();
  if (error || !project) throw new Error(error?.message ?? 'Project not found.');

  const source = String(project.sheet_source ?? '').trim() as 'guest_post_anchor' | 'own_sheet' | 'none';
  const spreadsheetId = source === 'own_sheet' ? String(project.google_sheet_id ?? '').trim() : source === 'guest_post_anchor' ? getTeamSheetId() : '';
  const tabName = source === 'own_sheet'
    ? String(project.sheet_tab_name ?? '').trim()
    : String(project.guest_post_tab_name ?? project.sheet_tab_name ?? '').trim();
  const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null;

  if (source === 'none' || !project.sync_enabled) {
    return { source: 'none' as const, tabName: null, sheetUrl: null, script: null, detail: 'Sheet sync is disabled for this project.' };
  }

  let script: string | null = null;
  if (source === 'guest_post_anchor') {
    script = buildInstallableTriggerSnippet(siteUrl);
  } else if (source === 'own_sheet') {
    const secret = String(process.env.SHEET_WEBHOOK_SECRET ?? '').trim();
    if (!secret) throw new Error('SHEET_WEBHOOK_SECRET is not configured.');
    script = buildOwnSheetTriggerSnippet(siteUrl, secret);
  }

  return { source, tabName: tabName || null, sheetUrl, script, detail: source === 'guest_post_anchor' ? 'Install the trigger in the Guest Post Anchor spreadsheet.' : 'Install the trigger in this project-owned spreadsheet.' };
}

function rowHasContent(row: unknown[] | undefined) {
  return Boolean(row?.some((cell) => String(cell ?? '').trim() !== ''));
}

function lastNonEmptyRow(values: unknown[][]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (rowHasContent(values[index])) return index + 1;
  }
  return 0;
}

function rowMatches(row: unknown[] | undefined, website: string, anchor: string) {
  if (!row) return false;
  return (
    normalizeForDuplicate(String(row[0] ?? '')) === normalizeForDuplicate(website) &&
    normalizeForDuplicate(String(row[2] ?? '')) === normalizeForDuplicate(anchor)
  );
}

async function ensureCreatedByEmailHeader(sheets: sheets_v4.Sheets, spreadsheetId: string, tab: string) {
  const response = await withGoogleRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!H1` })
  ) as { data: { values?: unknown[][] } };
  const current = String((response.data.values ?? [])[0]?.[0] ?? '').trim();
  if (current && current !== 'Created By Email') {
    throw new Error(`Column H in tab "${tab}" is already in use (header: "${current}"). Expected "Created By Email".`);
  }
  if (!current) {
    await withGoogleRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${quoteTab(tab)}!H1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Created By Email']] },
    }));
  }
}

async function logSync(entry: {
  requestId?: string | null;
  projectSiteId?: string | null;
  direction: 'to_sheet' | 'from_sheet';
  sheetName?: string | null;
  sheetRow?: number | null;
  status: 'success' | 'skipped' | 'error';
  detail?: string | null;
}) {
  try {
    await adminClient.from('sync_logs').insert({
      request_id: entry.requestId ?? null,
      project_site_id: entry.projectSiteId ?? null,
      direction: entry.direction,
      sheet_name: entry.sheetName ?? null,
      sheet_row: entry.sheetRow ?? null,
      status: entry.status,
      detail: entry.detail ?? null,
    });
  } catch (error) {
    // Logging failure cannot roll back an already-completed DB/sheet operation,
    // but it must not be silent. Vercel/server logs retain the diagnostic.
    console.error('Could not write sync_logs entry', error);
  }
}

async function acquireAppendLock(lockKey: string, ownerToken: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await adminClient.rpc('try_acquire_sheet_write_lock', {
      p_lock_key: lockKey,
      p_owner_token: ownerToken,
      p_ttl_seconds: 30,
    });
    if (error) throw new Error(`Could not acquire sheet append lock: ${error.message}`);
    if (data === true) return;
    await wait(175 * (attempt + 1));
  }
  throw new Error('Another request is writing to this sheet tab; please retry sync.');
}

async function releaseAppendLock(lockKey: string, ownerToken: string) {
  const { error } = await adminClient.rpc('release_sheet_write_lock', {
    p_lock_key: lockKey,
    p_owner_token: ownerToken,
  });
  if (error) throw new Error(error.message);
}

function syncPreflight(project: SyncableProject, tabOverride?: string | null): { state: 'ok'; tab: string; spreadsheetId: string; mode: 'own' | 'team' } | SheetSyncResult {
  if (!project.sync_enabled) return { state: 'skipped', text: '⚪ Sheet sync is disabled for this project (saved here only).' };
<<<<<<< HEAD

  const configuredSource = String(project.sheet_source ?? '').trim();
  const ownSheetId = String(project.google_sheet_id ?? '').trim();
  const ownTab = String(project.sheet_tab_name ?? '').trim();
  const inferredSource: 'own_sheet' | 'guest_post_anchor' | 'none' = ownSheetId && ownTab
    ? 'own_sheet'
    : project.guest_post_tab_name?.trim()
      ? 'guest_post_anchor'
      : 'none';
  const source = configuredSource === 'own_sheet' || configuredSource === 'guest_post_anchor' || configuredSource === 'none'
    ? configuredSource as 'own_sheet' | 'guest_post_anchor' | 'none'
    : inferredSource;

  if (source === 'none') return { state: 'skipped', text: '⚪ Sheet sync is disabled for this project (saved here only).' };

  const isOwnSheet = source === 'own_sheet';
  const tab = tabOverride?.trim() || (isOwnSheet ? ownTab : (project.guest_post_tab_name?.trim() || project.sheet_tab_name?.trim()));
=======
  const ownSheetId = String(project.google_sheet_id ?? '').trim();
  const ownTab = String(project.sheet_tab_name ?? '').trim();
  const isOwnSheet = Boolean(ownSheetId && ownTab);
  const tab = tabOverride?.trim() || (isOwnSheet ? ownTab : project.guest_post_tab_name?.trim());
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
  if (!tab) return { state: 'skipped', text: '⚪ This project has no configured Google Sheet tab (saved here only).' };
  const spreadsheetId = isOwnSheet ? ownSheetId : getTeamSheetId();
  if (!spreadsheetId) {
    const error = isOwnSheet ? 'Project Google Sheet is not configured' : 'TEAM_SHEET_ID is not configured';
    return { state: 'failed', text: `❌ Google Sheet sync failed: ${error}. Request is still saved.`, error };
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { state: 'failed', text: '❌ Google Sheet sync failed: Google service-account credentials are not configured. Request is still saved.', error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured' };
  return { state: 'ok', tab, spreadsheetId, mode: isOwnSheet ? 'own' : 'team' };
}

function ownSheetHeaderIndex(headers: unknown[], configuredName: string | undefined, fallbackName: string): number {
  const name = String(configuredName || fallbackName).trim().toLowerCase();
  return headers.findIndex((value) => String(value ?? '').trim().toLowerCase() === name);
}

async function appendRequestToOwnSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, tab: string, project: SyncableProject, request: RequestSheetRecord) {
  const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!1:1` })) as { data: { values?: unknown[][] } };
  const headers = (response.data.values?.[0] ?? []) as unknown[];
  const config = project.sheet_column_config ?? {};
  const indexes = {
    liveLink: ownSheetHeaderIndex(headers, config.liveLink, 'Live Link'),
    anchor: ownSheetHeaderIndex(headers, config.anchor, 'Anchor'),
    targetUrl: ownSheetHeaderIndex(headers, config.targetUrl, 'Target Page'),
    status: ownSheetHeaderIndex(headers, config.status, 'Status'),
    dr: ownSheetHeaderIndex(headers, config.dr, 'DR'),
    traffic: ownSheetHeaderIndex(headers, config.traffic, 'Traffic'),
  };
  if (indexes.liveLink < 0 || indexes.anchor < 0 || indexes.targetUrl < 0 || indexes.status < 0) throw new Error('Project sheet must have Live Link, Anchor, Target Page, and Status headers.');
  const rowsResponse = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:Z` })) as { data: { values?: unknown[][] } };
  const rows = rowsResponse.data.values ?? [];
  const rowNumber = Math.max(2, rows.length + 1);
  const values = Array.from({ length: Math.max(headers.length, 4) }, () => '');
  values[indexes.liveLink] = request.approved_site;
  values[indexes.anchor] = request.anchor;
  values[indexes.targetUrl] = request.target_url ?? '';
  values[indexes.status] = request.status;
  if (indexes.dr >= 0) values[indexes.dr] = '';
  if (indexes.traffic >= 0) values[indexes.traffic] = '';
  await withGoogleRetry(() => sheets.spreadsheets.values.update({ spreadsheetId, range: `${quoteTab(tab)}!A${rowNumber}:${columnLetter(values.length)}${rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [values] } }));
  return rowNumber;
}

function columnLetter(column: number) { let n = column; let out = ''; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; }

<<<<<<< HEAD
async function findOwnSheetRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tab: string,
  project: SyncableProject,
  website: string,
  anchor: string,
  storedRow: number | null
) {
  const headerResponse = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!1:1` })) as { data: { values?: unknown[][] } };
  const headers = (headerResponse.data.values?.[0] ?? []) as unknown[];
  const config = project.sheet_column_config ?? {};
  const liveLinkIndex = ownSheetHeaderIndex(headers, config.liveLink, 'Live Link');
  const anchorIndex = ownSheetHeaderIndex(headers, config.anchor, 'Anchor');
  if (liveLinkIndex < 0 || anchorIndex < 0) throw new Error('Project sheet is missing required Live Link or Anchor headers.');

  if (storedRow && storedRow >= 2) {
    const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${storedRow}:Z${storedRow}` })) as { data: { values?: unknown[][] } };
    const row = (response.data.values?.[0] ?? []) as unknown[];
    if (normalizeForDuplicate(String(row[liveLinkIndex] ?? '')) === normalizeForDuplicate(website) && normalizeForDuplicate(String(row[anchorIndex] ?? '')) === normalizeForDuplicate(anchor)) {
      return { row: storedRow, repaired: false, headers, liveLinkIndex, anchorIndex };
    }
  }

  const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A2:Z` })) as { data: { values?: unknown[][] } };
  const rows = (response.data.values ?? []) as unknown[][];
  const index = rows.findIndex((row) => normalizeForDuplicate(String(row[liveLinkIndex] ?? '')) === normalizeForDuplicate(website) && normalizeForDuplicate(String(row[anchorIndex] ?? '')) === normalizeForDuplicate(anchor));
  return index >= 0 ? { row: index + 2, repaired: storedRow !== index + 2, headers, liveLinkIndex, anchorIndex } : null;
}

export async function ensureTeamSheetTab(tabName: string): Promise<{ tab: string; created: boolean }> {
  const invalid = validateSheetTabName(tabName);
  if (invalid) throw new Error(invalid);
  const spreadsheetId = getTeamSheetId();
  if (!spreadsheetId) throw new Error('TEAM_SHEET_ID is not configured.');
  const sheets = getSheetsClient();
  const titles = await getTabTitles(sheets, spreadsheetId);
  const expected = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note', 'Created By Email'];
  if (titles.has(tabName)) {
    const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tabName)}!A1:H1` }));
    const headers = (response.data.values?.[0] ?? []).map((value) => String(value ?? '').trim());
    if (expected.slice(0, 7).some((header, index) => headers[index] !== header)) {
      throw new Error(`A tab named “${tabName}” already exists but its headers do not match the Inhouse template. Choose another tab name or fix the existing headers first.`);
    }
    await ensureCreatedByEmailHeader(sheets, spreadsheetId, tabName);
    return { tab: tabName, created: false };
  }
=======

export async function ensureTeamSheetTab(tabName: string): Promise<{ tab: string; created: boolean }> {
  const invalid = validateSheetTabName(tabName);
  if (invalid) throw new Error(invalid);
  const spreadsheetId = getTeamSheetId();
  if (!spreadsheetId) throw new Error('TEAM_SHEET_ID is not configured.');
  const sheets = getSheetsClient();
  const titles = await getTabTitles(sheets, spreadsheetId);
  const expected = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note', 'Created By Email'];
  if (titles.has(tabName)) {
    const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tabName)}!A1:H1` }));
    const headers = (response.data.values?.[0] ?? []).map((value) => String(value ?? '').trim());
    if (expected.slice(0, 7).some((header, index) => headers[index] !== header)) {
      throw new Error(`A tab named “${tabName}” already exists but its headers do not match the Inhouse template. Choose another tab name or fix the existing headers first.`);
    }
    await ensureCreatedByEmailHeader(sheets, spreadsheetId, tabName);
    return { tab: tabName, created: false };
  }
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
  const created = await withGoogleRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName, gridProperties: { frozenRowCount: 1 } } } }] },
  }));
  const sheetId = Number(created.data.replies?.[0]?.addSheet?.properties?.sheetId);
  await withGoogleRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId, range: `${quoteTab(tabName)}!A1:H1`, valueInputOption: 'RAW',
    requestBody: { values: [expected] },
  }));
  if (Number.isFinite(sheetId)) {
    await withGoogleRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.12, green: 0.38, blue: 0.25 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
      { setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Request shared' }, { userEnteredValue: 'Live' }, { userEnteredValue: 'Rejected' }] }, strict: true, showCustomUi: true } } },
      { addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Live' }] }, format: { backgroundColor: { red: 0.82, green: 0.93, blue: 0.84 }, textFormat: { foregroundColor: { red: 0.08, green: 0.42, blue: 0.2 }, bold: true } } } } } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 8 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
    ] } }));
  }
  metadataCache = null;
  await logSync({ direction: 'to_sheet', sheetName: tabName, status: 'success', detail: 'Created Inhouse project tab with standard headers and status validation.' });
  return { tab: tabName, created: true };
}

export async function appendRequestToTeamSheet(
  project: SyncableProject,
  request: RequestSheetRecord,
  projectSiteId?: string | null
): Promise<SheetSyncResult> {
  const preflight = syncPreflight(project);
  if (preflight.state !== 'ok') {
    await logSync({
      requestId: request.id,
      projectSiteId,
      direction: 'to_sheet',
      sheetName: project.guest_post_tab_name,
      status: preflight.state === 'failed' ? 'error' : 'skipped',
      detail: preflight.error ?? preflight.text,
    });
    return preflight;
  }

  const { tab, spreadsheetId } = preflight;
  if (preflight.mode === 'own') {
    try {
      const sheets = getSheetsClient();
      const titles = await getTabTitles(sheets, spreadsheetId);
      if (!titles.has(tab)) throw new Error(`Project sheet tab “${tab}” was not found. Check the Tab name in project settings.`);
      const row = await appendRequestToOwnSheet(sheets, spreadsheetId, tab, project, request);
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: row, status: 'success', detail: 'Request appended to project-owned sheet.' });
      return { state: 'synced', text: `✅ Request added to this project's Google Sheet tab “${tab}”, row ${row}.`, tab, row };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
      return { state: 'failed', text: `❌ Project Google Sheet sync failed: ${reason}. Request is still saved.`, tab, error: reason };
    }
  }
  const ownerToken = randomUUID();
  const lockKey = `team-sheet:${spreadsheetId}:${tab}`;

  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) {
      const result: SheetSyncResult = {
        state: 'skipped',
        text: '⚪ This client has no tab in the team sheet (saved here only).',
        tab,
      };
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'skipped', detail: 'Mapped team tab does not exist' });
      return result;
    }

    await ensureCreatedByEmailHeader(sheets, spreadsheetId, tab);
    await acquireAppendLock(lockKey, ownerToken);
    try {
      let allRows = await withGoogleRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:H` })
      ) as { data: { values?: unknown[][] } };
      let targetRow = Math.max(2, lastNonEmptyRow((allRows.data.values ?? []) as unknown[][]) + 2);

      // The lock prevents app/app races. Re-check the exact target as a
      // second guard against a person writing to the sheet at the same time.
      let freeTargetConfirmed = false;
      for (let check = 0; check < 10; check += 1) {
        const target = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${targetRow}:H${targetRow}` })
        ) as { data: { values?: unknown[][] } };
        const occupied = rowHasContent((target.data.values ?? [])[0]);
        if (!occupied) {
          freeTargetConfirmed = true;
          break;
        }
        allRows = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:H` })
        ) as { data: { values?: unknown[][] } };
        targetRow = Math.max(targetRow + 1, lastNonEmptyRow((allRows.data.values ?? []) as unknown[][]) + 2);
      }
      if (!freeTargetConfirmed) throw new Error('Could not find a safe empty row for the team-sheet append.');

      await withGoogleRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quoteTab(tab)}!A${targetRow}:H${targetRow}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              request.approved_site,
              request.placement_page ?? '',
              request.anchor,
              '',
              '',
              request.status,
              request.assign_to ?? '',
              request.created_by_email ?? '',
            ]],
          },
        })
      );

      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: targetRow, status: 'success' });
      return {
        state: 'synced',
        text: `✅ Added to team sheet tab "${tab}" row ${targetRow}.`,
        tab,
        row: targetRow,
      };
    } finally {
      try {
        await releaseAppendLock(lockKey, ownerToken);
      } catch (releaseError) {
        const detail = `Append lock release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`;
        console.error(detail);
        await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail });
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
    return {
      state: 'failed',
      text: `❌ Team sheet sync failed: ${reason}. Request is still saved.`,
      tab,
      error: reason,
    };
  }
}

async function findVerifiedRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tab: string,
  storedRow: number | null,
  website: string,
  anchor: string
) {
  if (storedRow && storedRow >= 2) {
    const response = await withGoogleRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${storedRow}:C${storedRow}` })
    ) as { data: { values?: unknown[][] } };
    if (rowMatches((response.data.values ?? [])[0] as unknown[] | undefined, website, anchor)) {
      return { row: storedRow, repaired: false };
    }
  }

  const response = await withGoogleRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A2:C` })
  ) as { data: { values?: unknown[][] } };
  const rows = (response.data.values ?? []) as unknown[][];
  const index = rows.findIndex((row) => rowMatches(row, website, anchor));
  return index >= 0 ? { row: index + 2, repaired: storedRow !== index + 2 } : null;
}

export async function syncRequestStatusToTeamSheet(
  project: SyncableProject,
  request: RequestSheetRecord,
  projectSiteId?: string | null
): Promise<SheetSyncResult> {
  const preflight = syncPreflight(project, request.team_tab);
  if (preflight.state !== 'ok') {
    await logSync({
      requestId: request.id,
      projectSiteId,
      direction: 'to_sheet',
      sheetName: request.team_tab || project.guest_post_tab_name,
      status: preflight.state === 'failed' ? 'error' : 'skipped',
      detail: preflight.error ?? preflight.text,
    });
    return preflight;
  }

  const { tab, spreadsheetId } = preflight;
  try {
    const sheets = getSheetsClient();
    if (preflight.mode === 'own') {
      const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:Z` })) as { data: { values?: unknown[][] } };
      const rows = response.data.values ?? [];
      const headers = (rows[0] ?? []) as unknown[];
      const config = project.sheet_column_config ?? {};
      const liveIndex = ownSheetHeaderIndex(headers, config.liveLink, 'Live Link');
      const anchorIndex = ownSheetHeaderIndex(headers, config.anchor, 'Anchor');
      const statusIndex = ownSheetHeaderIndex(headers, config.status, 'Status');
      if (liveIndex < 0 || anchorIndex < 0 || statusIndex < 0) throw new Error('Project sheet is missing required Live Link, Anchor, or Status headers.');
      const rowIndex = rows.findIndex((row, index) => index > 0 && String(row[liveIndex] ?? '').trim().toLowerCase() === request.approved_site.trim().toLowerCase() && String(row[anchorIndex] ?? '').trim().toLowerCase() === request.anchor.trim().toLowerCase());
      if (rowIndex < 1) throw new Error(`Could not find a matching row for “${request.approved_site}” and anchor “${request.anchor}”.`);
      await withGoogleRetry(() => sheets.spreadsheets.values.update({ spreadsheetId, range: `${quoteTab(tab)}!${columnLetter(statusIndex + 1)}${rowIndex + 1}`, valueInputOption: 'RAW', requestBody: { values: [[request.status]] } }));
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: rowIndex + 1, status: 'success', detail: 'Project-owned sheet status updated.' });
      return { state: 'synced', text: `✅ Status updated in project sheet “${tab}”, row ${rowIndex + 1}.`, tab, row: rowIndex + 1 };
    }
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) {
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'skipped', detail: 'Mapped team tab does not exist' });
      return { state: 'skipped', text: '⚪ This client has no tab in the team sheet (saved here only).', tab };
    }

    const verified = await findVerifiedRow(sheets, spreadsheetId, tab, request.team_row, request.approved_site, request.anchor);
    if (!verified) {
      const reason = `Could not find a row in "${tab}" matching both website "${request.approved_site}" and anchor "${request.anchor}".`;
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
      return { state: 'failed', text: `❌ Team sheet sync failed: ${reason}`, tab, error: reason };
    }

    await withGoogleRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${quoteTab(tab)}!F${verified.row}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[request.status]] },
      })
    );

    await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: verified.row, status: 'success', detail: verified.repaired ? 'Stored row was repaired before status update' : null });
    return {
      state: 'synced',
      text: `✅ Status updated in team sheet tab "${tab}" row ${verified.row}.`,
      tab,
      row: verified.row,
      repairedRow: verified.repaired,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
    return { state: 'failed', text: `❌ Team sheet sync failed: ${reason}`, tab, error: reason };
  }
}


export async function syncRequestFullRowToTeamSheet(
  project: SyncableProject,
  original: RequestSheetRecord,
  updated: RequestSheetRecord,
  projectSiteId?: string | null
): Promise<SheetSyncResult> {
  const preflight = syncPreflight(project, original.team_tab || updated.team_tab);
  if (preflight.state !== 'ok') return preflight;
  const { tab, spreadsheetId } = preflight;

  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) {
      const text = preflight.mode === 'own'
        ? `❌ Project Google Sheet tab "${tab}" was not found.`
        : '⚪ This client has no tab in the team sheet (saved here only).';
      await logSync({ requestId: updated.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: preflight.mode === 'own' ? 'error' : 'skipped', detail: text });
      return { state: preflight.mode === 'own' ? 'failed' : 'skipped', text, tab, ...(preflight.mode === 'own' ? { error: text } : {}) };
    }

    if (preflight.mode === 'own') {
      const verified = await findOwnSheetRow(sheets, spreadsheetId, tab, project, original.approved_site, original.anchor, original.team_row);
      if (!verified) {
        const reason = `Could not find a row in "${tab}" matching the original website "${original.approved_site}" and anchor "${original.anchor}".`;
        await logSync({ requestId: updated.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
        return { state: 'failed', text: `❌ Project Google Sheet sync failed: ${reason}`, tab, error: reason };
      }
      const statusIndex = ownSheetHeaderIndex(verified.headers, project.sheet_column_config?.status, 'Status');
      const targetIndex = ownSheetHeaderIndex(verified.headers, project.sheet_column_config?.targetUrl, 'Target Page');
      if (statusIndex < 0 || targetIndex < 0) throw new Error('Project sheet is missing required Target Page or Status headers.');
      await withGoogleRetry(() => sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `${quoteTab(tab)}!${columnLetter(verified.liveLinkIndex + 1)}${verified.row}`, values: [[updated.approved_site]] },
            { range: `${quoteTab(tab)}!${columnLetter(verified.anchorIndex + 1)}${verified.row}`, values: [[updated.anchor]] },
            { range: `${quoteTab(tab)}!${columnLetter(targetIndex + 1)}${verified.row}`, values: [[updated.target_url ?? updated.placement_page ?? '']] },
            { range: `${quoteTab(tab)}!${columnLetter(statusIndex + 1)}${verified.row}`, values: [[updated.status]] },
          ],
        },
      }));
      await logSync({ requestId: updated.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: verified.row, status: 'success', detail: verified.repaired ? 'Project-owned sheet row updated after stored-row repair' : 'Project-owned sheet row updated' });
      return { state: 'synced', text: `✅ Project sheet row ${verified.row} updated in "${tab}".`, tab, row: verified.row, repairedRow: verified.repaired };
    }

    await ensureCreatedByEmailHeader(sheets, spreadsheetId, tab);
    const verified = await findVerifiedRow(sheets, spreadsheetId, tab, original.team_row, original.approved_site, original.anchor);
    if (!verified) {
      const reason = `Could not find a row in "${tab}" matching the original website "${original.approved_site}" and anchor "${original.anchor}".`;
      await logSync({ requestId: updated.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
      return { state: 'failed', text: `❌ Team sheet sync failed: ${reason}`, tab, error: reason };
    }
    const existingResponse = await withGoogleRetry(() => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quoteTab(tab)}!A${verified.row}:H${verified.row}`,
    })) as { data: { values?: unknown[][] } };
    const existingRow = (existingResponse.data.values ?? [])[0] ?? [];
    await withGoogleRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${quoteTab(tab)}!A${verified.row}:H${verified.row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[
        updated.approved_site,
        updated.placement_page ?? '',
        updated.anchor,
        existingRow[3] ?? '',
        existingRow[4] ?? '',
        updated.status,
        updated.assign_to ?? '',
        updated.created_by_email ?? existingRow[7] ?? '',
      ]] },
    }));
    await logSync({ requestId: updated.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: verified.row, status: 'success', detail: verified.repaired ? 'Full row updated after stored-row repair' : 'Full row updated' });
    return { state: 'synced', text: `✅ Team sheet row ${verified.row} updated in "${tab}".`, tab, row: verified.row, repairedRow: verified.repaired };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logSync({ requestId: updated.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
    return { state: 'failed', text: `❌ Team sheet sync failed: ${reason}`, tab, error: reason };
  }
}

export async function clearRequestFromTeamSheet(
  project: SyncableProject,
  request: RequestSheetRecord,
  projectSiteId?: string | null
): Promise<SheetSyncResult> {
  const preflight = syncPreflight(project, request.team_tab);
  if (preflight.state !== 'ok') return preflight;
  const { tab, spreadsheetId } = preflight;
  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) {
      const text = preflight.mode === 'own' ? `❌ Project Google Sheet tab "${tab}" was not found.` : '⚪ Mapped team tab does not exist; archived in app only.';
      return { state: preflight.mode === 'own' ? 'failed' : 'skipped', text, tab, ...(preflight.mode === 'own' ? { error: text } : {}) };
    }

    if (preflight.mode === 'own') {
      const verified = await findOwnSheetRow(sheets, spreadsheetId, tab, project, request.approved_site, request.anchor, request.team_row);
      if (!verified) {
        const reason = `Could not find the linked row in "${tab}" for ${request.approved_site} + ${request.anchor}.`;
        await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
        return { state: 'failed', text: `❌ Archived in app, but project Sheet row could not be cleared: ${reason}`, tab, error: reason };
      }
      const clearEnd = Math.max(verified.headers.length, 4);
      await withGoogleRetry(() => sheets.spreadsheets.values.clear({ spreadsheetId, range: `${quoteTab(tab)}!A${verified.row}:${columnLetter(clearEnd)}${verified.row}` }));
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: verified.row, status: 'success', detail: 'Archived request row cleared from project-owned sheet' });
      return { state: 'synced', text: `✅ Archived and cleared project sheet row ${verified.row} in "${tab}".`, tab, row: verified.row };
    }

    const verified = await findVerifiedRow(sheets, spreadsheetId, tab, request.team_row, request.approved_site, request.anchor);
    if (!verified) {
      const reason = `Could not find the linked team-sheet row for ${request.approved_site} + ${request.anchor}.`;
      await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
      return { state: 'failed', text: `❌ Archived in app, but Sheet row could not be cleared: ${reason}`, tab, error: reason };
    }
    await withGoogleRetry(() => sheets.spreadsheets.values.clear({ spreadsheetId, range: `${quoteTab(tab)}!A${verified.row}:H${verified.row}` }));
    await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, sheetRow: verified.row, status: 'success', detail: 'Archived request row cleared from team sheet' });
    return { state: 'synced', text: `✅ Archived and cleared team sheet row ${verified.row} in "${tab}".`, tab, row: verified.row };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logSync({ requestId: request.id, projectSiteId, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
    return { state: 'failed', text: `❌ Archived in app, but team-sheet cleanup failed: ${reason}`, tab, error: reason };
  }
}

export async function appendProjectSiteToTeamSheet(
  project: SyncableProject,
  site: ProjectSiteSheetRecord
): Promise<SheetSyncResult> {
  const preflight = syncPreflight(project);
  if (preflight.state !== 'ok') {
    await logSync({
      projectSiteId: site.id,
      direction: 'to_sheet',
      sheetName: project.guest_post_tab_name,
      status: preflight.state === 'failed' ? 'error' : 'skipped',
      detail: preflight.error ?? preflight.text,
    });
    return preflight;
  }

  const { tab, spreadsheetId } = preflight;
  if (preflight.mode === 'own') {
    try {
      const sheets = getSheetsClient();
      const titles = await getTabTitles(sheets, spreadsheetId);
      if (!titles.has(tab)) throw new Error(`Project sheet tab "${tab}" was not found. Check the Tab name in project settings.`);
      const row = await appendRequestToOwnSheet(sheets, spreadsheetId, tab, project, {
        id: site.id,
        project_id: site.project_id,
        approved_site: site.website,
        placement_page: site.opportunity,
        target_url: site.opportunity,
        anchor: site.anchor ?? '',
        assign_to: site.note,
        status: site.status,
        team_tab: tab,
        team_row: site.team_row,
        created_by_email: site.created_by_email ?? null,
      });
      await logSync({ projectSiteId: site.id, direction: 'to_sheet', sheetName: tab, sheetRow: row, status: 'success', detail: 'Project-site row appended to project-owned sheet.' });
      return { state: 'synced', text: `✅ Project sheet row ${row} added in "${tab}".`, tab, row };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await logSync({ projectSiteId: site.id, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
      return { state: 'failed', text: `❌ Project Google Sheet sync failed: ${reason}. Row is still saved here.`, tab, error: reason };
    }
  }
  const ownerToken = randomUUID();
  const lockKey = `team-sheet:${spreadsheetId}:${tab}`;
  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) {
      await logSync({ projectSiteId: site.id, direction: 'to_sheet', sheetName: tab, status: 'skipped', detail: 'Mapped team tab does not exist' });
      return { state: 'skipped', text: '⚪ This client has no tab in the team sheet (saved here only).', tab };
    }

    await ensureCreatedByEmailHeader(sheets, spreadsheetId, tab);
    await acquireAppendLock(lockKey, ownerToken);
    try {
      const allRows = await withGoogleRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:H` })
      ) as { data: { values?: unknown[][] } };
      let targetRow = Math.max(2, lastNonEmptyRow((allRows.data.values ?? []) as unknown[][]) + 2);
      let freeTargetConfirmed = false;
      for (let check = 0; check < 10; check += 1) {
        const target = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${targetRow}:H${targetRow}` })
        ) as { data: { values?: unknown[][] } };
        if (!rowHasContent((target.data.values ?? [])[0])) {
          freeTargetConfirmed = true;
          break;
        }
        const reread = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:H` })
        ) as { data: { values?: unknown[][] } };
        targetRow = Math.max(targetRow + 1, lastNonEmptyRow((reread.data.values ?? []) as unknown[][]) + 2);
      }
      if (!freeTargetConfirmed) throw new Error('Could not find a safe empty row for the team-sheet append.');

      await withGoogleRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quoteTab(tab)}!A${targetRow}:H${targetRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[
            site.website,
            site.opportunity ?? '',
            site.anchor ?? '',
            site.dr ?? '',
            site.traffic ?? '',
            site.status,
            site.note ?? '',
            site.created_by_email ?? '',
          ]] },
        })
      );
      await logSync({ projectSiteId: site.id, direction: 'to_sheet', sheetName: tab, sheetRow: targetRow, status: 'success', detail: 'Imported project-site row pushed to team sheet' });
      return { state: 'synced', text: `✅ Added to team sheet tab "${tab}" row ${targetRow}.`, tab, row: targetRow };
    } finally {
      try {
        await releaseAppendLock(lockKey, ownerToken);
      } catch (releaseError) {
        const detail = `Append lock release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`;
        console.error(detail);
        await logSync({ projectSiteId: site.id, direction: 'to_sheet', sheetName: tab, status: 'error', detail });
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logSync({ projectSiteId: site.id, direction: 'to_sheet', sheetName: tab, status: 'error', detail: reason });
    return { state: 'failed', text: `❌ Team sheet sync failed: ${reason}. Imported row is still saved here.`, tab, error: reason };
  }
}

export type VerifiedTeamRowResult =
  | { state: 'ok'; tab: string; row: number; repaired: boolean; sheetStatus: string }
  | { state: 'failed'; tab?: string; reason: string };

export async function verifyRequestTeamRow(request: {
  id: string;
  approved_site: string;
  anchor: string;
  team_tab: string | null;
  team_row: number | null;
  project_site_id?: string | null;
  sheet_source?: 'guest_post_anchor' | 'own_sheet' | 'none' | null;
  google_sheet_id?: string | null;
  sheet_tab_name?: string | null;
  sheet_column_config?: Record<string, string> | null;
}, persistRepair = false): Promise<VerifiedTeamRowResult> {
  const tab = request.team_tab?.trim() || request.sheet_tab_name?.trim();
  if (!tab) return { state: 'failed', reason: 'Request has no stored Sheet tab.' };
  const source = request.sheet_source === 'own_sheet' ? 'own_sheet' : 'guest_post_anchor';
  const spreadsheetId = source === 'own_sheet' ? String(request.google_sheet_id ?? '').trim() : getTeamSheetId();
  if (!spreadsheetId) return { state: 'failed', tab, reason: source === 'own_sheet' ? 'Project Google Sheet is not configured.' : 'TEAM_SHEET_ID is not configured.' };
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { state: 'failed', tab, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.' };

  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) return { state: 'failed', tab, reason: `Sheet tab "${tab}" does not exist.` };

    let verified: { row: number; repaired: boolean } | null = null;
    let sheetStatus = '';
    if (source === 'own_sheet') {
      const own = await findOwnSheetRow(sheets, spreadsheetId, tab, {
        id: request.id,
        guest_post_tab_name: null,
        sync_enabled: true,
        google_sheet_id: spreadsheetId,
        sheet_tab_name: tab,
        sheet_column_config: request.sheet_column_config ?? null,
        sheet_source: 'own_sheet',
      }, request.approved_site, request.anchor, request.team_row);
      if (!own) return { state: 'failed', tab, reason: `No row in "${tab}" matches both website "${request.approved_site}" and anchor "${request.anchor}".` };
      verified = { row: own.row, repaired: own.repaired };
      const statusIndex = ownSheetHeaderIndex(own.headers, request.sheet_column_config?.status, 'Status');
      const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${own.row}:Z${own.row}` })) as { data: { values?: unknown[][] } };
      const row = (response.data.values ?? [])[0] ?? [];
      sheetStatus = statusIndex >= 0 ? String(row[statusIndex] ?? '').trim() : '';
    } else {
      const team = await findVerifiedRow(sheets, spreadsheetId, tab, request.team_row, request.approved_site, request.anchor);
      if (!team) return { state: 'failed', tab, reason: `No row in "${tab}" matches both website "${request.approved_site}" and anchor "${request.anchor}".` };
      verified = { row: team.row, repaired: team.repaired };
      const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${team.row}:F${team.row}` })) as { data: { values?: unknown[][] } };
      const row = (response.data.values ?? [])[0] ?? [];
      if (!rowMatches(row as unknown[], request.approved_site, request.anchor)) return { state: 'failed', tab, reason: `Verified row ${team.row} changed before it could be read again.` };
      sheetStatus = String(row[5] ?? '').trim();
    }

    if (persistRepair && verified.repaired) {
      await adminClient.from('requests').update({ team_row: verified.row, sync_state: 'synced', sync_error: null }).eq('id', request.id);
      if (request.project_site_id) await adminClient.from('project_sites').update({ team_row: verified.row }).eq('id', request.project_site_id);
      await logSync({ requestId: request.id, projectSiteId: request.project_site_id, direction: 'from_sheet', sheetName: tab, sheetRow: verified.row, status: 'success', detail: 'Stored row repaired by verify-and-search' });
    }

    return { state: 'ok', tab, row: verified.row, repaired: verified.repaired, sheetStatus };
  } catch (error) {
    return { state: 'failed', tab, reason: error instanceof Error ? error.message : String(error) };
  }
}

<<<<<<< HEAD
=======
export async function applyStatusFromSheet(payload: {
  tab: string;
  row: number;
  website: string;
  anchor: string;
  status: 'Request shared' | 'Live' | 'Rejected' | 'Removed';
  spreadsheetId?: string;
  liveLink?: string;
}) {
  // The main team sheet remains backward-compatible. For project-owned sheets,
  // resolve the project by spreadsheet ID + tab before matching the request.
  let data: any; let error: any;
  if (payload.spreadsheetId) {
    const { data: project, error: projectError } = await adminClient.from('projects').select('id,google_sheet_id,sheet_tab_name,guest_post_tab_name').eq('google_sheet_id', payload.spreadsheetId).or(`sheet_tab_name.eq.${payload.tab},guest_post_tab_name.eq.${payload.tab}`).maybeSingle();
    if (projectError) { data = null; error = projectError; }
    else if (project) {
      const siteKey = String(payload.liveLink ?? payload.website ?? '').trim();
      const { data: requestRows, error: requestError } = await adminClient.from('requests').select('id,project_id,approved_site,placement_page,anchor,status,team_tab,team_row').eq('project_id', project.id).eq('anchor', payload.anchor).is('deleted_at', null).limit(100);
      if (requestError) { data = null; error = requestError; }
      else {
        const found = (requestRows ?? []).find((row: any) => String(row.placement_page ?? row.approved_site ?? '').trim() === siteKey || String(row.approved_site ?? '').trim() === siteKey);
        data = found ? [{ request_id: found.id, match_type: 'project_sheet_identity' }] : [];
        error = null;
      }
    } else { data = []; error = null; }
  } else {
    const rpcResult = await adminClient.rpc('find_request_from_sheet', { p_tab: payload.tab, p_website: payload.website, p_anchor: payload.anchor, p_row: payload.row });
    data = rpcResult.data; error = rpcResult.error;
  }
  if (error) {
    await logSync({ direction: 'from_sheet', sheetName: payload.tab, sheetRow: payload.row, status: 'error', detail: `Request lookup failed: ${error.message}` });
    throw new Error(`Request lookup failed: ${error.message}`);
  }

  const match = Array.isArray(data) ? data[0] : null;
  if (!match?.request_id) {
    const reason = 'No request matched this tab + website + anchor, or the stored row fallback.';
    await logSync({ direction: 'from_sheet', sheetName: payload.tab, sheetRow: payload.row, status: 'error', detail: reason });
    return { ok: false, notFound: true, error: reason };
  }

  const requestId = String(match.request_id);
  const { data: site } = await adminClient.from('project_sites').select('id').eq('request_id', requestId).maybeSingle();
  if (payload.status === 'Removed') {
    const { error: flagError } = await adminClient.from('requests').update({ sheet_flag: 'Removed', sheet_flag_at: new Date().toISOString(), team_tab: payload.tab, team_row: payload.row, sync_state: 'synced', sync_error: null }).eq('id', requestId);
    if (flagError) throw new Error(`Could not save Removed flag: ${flagError.message}`);
    await logSync({ requestId, projectSiteId: site?.id ?? null, direction: 'from_sheet', sheetName: payload.tab, sheetRow: payload.row, status: 'success', detail: 'Sheet-only Removed flag set; tool request status was preserved.' });
    return { ok: true, requestId, flag: 'Removed', statusPreserved: true };
  }
  await adminClient.from('requests').update({ sheet_flag: null, sheet_flag_at: null }).eq('id', requestId);
  const { setRequestStatusCore } = await import('@/services/request-status-core');
  const result = await setRequestStatusCore(requestId, payload.status, 'team sheet', {
    pushToSheet: false,
    sheetRow: payload.row,
  });

  await adminClient.from('requests').update({
    team_tab: payload.tab,
    team_row: payload.row,
    sync_state: 'synced',
    sync_error: null,
  }).eq('id', requestId);
  const warning = result.ok ? null : [result.database.reason, result.projectSite.reason, result.teamSheet.reason].filter(Boolean).join(' | ');
  await logSync({
    requestId,
    projectSiteId: site?.id ?? null,
    direction: 'from_sheet',
    sheetName: payload.tab,
    sheetRow: payload.row,
    status: result.ok ? 'success' : 'error',
    detail: result.ok
      ? `Webhook applied via ${String(match.match_type ?? 'unknown')} match`
      : `Webhook status was applied with warnings: ${warning || 'linked step failed'}`,
  });
  return result.ok
    ? { ok: true, requestId, matchType: String(match.match_type ?? ''), result }
    : { ok: false, notFound: false, error: warning || 'Status changed with linked-step warnings.', requestId, result };
}

export type RefreshSheetStatusReport = {
  checked: number;
  updated: number;
  repairedRows: number;
  unchanged: number;
  invalidStatuses: number;
  failed: number;
  errors: string[];
  refreshedAt: string;
};

export async function refreshStatusesFromTeamSheet(): Promise<RefreshSheetStatusReport> {
  await requireAdminForAction();
  const report: RefreshSheetStatusReport = {
    checked: 0,
    updated: 0,
    repairedRows: 0,
    unchanged: 0,
    invalidStatuses: 0,
    failed: 0,
    errors: [],
    refreshedAt: new Date().toISOString(),
  };

  const requests: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await adminClient
      .from('requests')
      .select('id,approved_site,anchor,status,team_tab,team_row,project_sites(id)')
      .is('deleted_at', null)
      .not('team_tab', 'is', null)
      .not('team_row', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(`Could not load requests for refresh: ${error.message}`);
    requests.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const spreadsheetId = getTeamSheetId();
  if (!spreadsheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error(!spreadsheetId ? 'TEAM_SHEET_ID is not configured.' : 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.');
  }
  const sheets = getSheetsClient();
  const titles = await getTabTitles(sheets, spreadsheetId);
  const rowsByTab = new Map<string, unknown[][]>();

  for (const request of requests) {
    report.checked += 1;
    const tab = String(request.team_tab ?? '').trim();
    const projectSiteId = Array.isArray(request.project_sites) ? request.project_sites[0]?.id ?? null : request.project_sites?.id ?? null;
    try {
      if (!titles.has(tab)) throw new Error(`Tab "${tab}" does not exist.`);
      let rows = rowsByTab.get(tab);
      if (!rows) {
        const response = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A2:F` })
        ) as { data: { values?: unknown[][] } };
        rows = (response.data.values ?? []) as unknown[][];
        rowsByTab.set(tab, rows);
      }

      const storedIndex = Number(request.team_row) - 2;
      let index = storedIndex >= 0 && rowMatches(rows[storedIndex], request.approved_site, request.anchor) ? storedIndex : -1;
      if (index < 0) index = rows.findIndex((row) => rowMatches(row, request.approved_site, request.anchor));
      if (index < 0) throw new Error(`No matching row for ${request.approved_site} + ${request.anchor}.`);
      const verifiedRow = index + 2;
      const sheetStatus = String(rows[index]?.[5] ?? '').trim();
      const repaired = verifiedRow !== Number(request.team_row);
      if (repaired) report.repairedRows += 1;

      if (sheetStatus !== 'Request shared' && sheetStatus !== 'Live' && sheetStatus !== 'Rejected') {
        report.invalidStatuses += 1;
        report.errors.push(`${tab} row ${verifiedRow}: invalid status "${sheetStatus || '(blank)'}".`);
        await adminClient.from('requests').update({ team_row: verifiedRow, sync_state: 'failed', sync_error: `Invalid team-sheet status: ${sheetStatus || '(blank)'}` }).eq('id', request.id);
        if (projectSiteId) await adminClient.from('project_sites').update({ team_row: verifiedRow }).eq('id', projectSiteId);
        await logSync({ requestId: request.id, projectSiteId, direction: 'from_sheet', sheetName: tab, sheetRow: verifiedRow, status: 'error', detail: `Invalid status: ${sheetStatus || '(blank)'}` });
        continue;
      }

      const { setRequestStatusCore } = await import('@/services/request-status-core');
      const statusResult = await setRequestStatusCore(request.id, sheetStatus, 'team sheet refresh', { pushToSheet: false, sheetRow: verifiedRow });
      await adminClient.from('requests').update({ team_tab: tab, team_row: verifiedRow, sync_state: 'synced', sync_error: null }).eq('id', request.id);
      if (request.status === sheetStatus) report.unchanged += 1;
      else report.updated += 1;
      if (!statusResult.ok) {
        report.failed += 1;
        const warning = [statusResult.database.reason, statusResult.projectSite.reason, statusResult.teamSheet.reason].filter(Boolean).join(' | ') || 'linked status step failed';
        report.errors.push(`${tab} row ${verifiedRow}: ${warning}`);
        await logSync({ requestId: request.id, projectSiteId, direction: 'from_sheet', sheetName: tab, sheetRow: verifiedRow, status: 'error', detail: `Refresh applied status with warnings: ${warning}` });
      } else {
        await logSync({ requestId: request.id, projectSiteId, direction: 'from_sheet', sheetName: tab, sheetRow: verifiedRow, status: 'success', detail: repaired ? 'Refresh reconciled status and repaired row' : 'Refresh reconciled status' });
      }
    } catch (error) {
      report.failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      report.errors.push(`${tab || '(no tab)'}: ${reason}`);
      await adminClient.from('requests').update({ sync_state: 'failed', sync_error: reason }).eq('id', request.id);
      await logSync({ requestId: request.id, projectSiteId, direction: 'from_sheet', sheetName: tab || null, sheetRow: request.team_row, status: 'error', detail: reason });
    }
  }

  await logSync({
    direction: 'from_sheet',
    sheetName: '__refresh__',
    status: report.failed > 0 || report.invalidStatuses > 0 ? 'error' : 'success',
    detail: JSON.stringify(report),
  });
  revalidatePath('/dashboard');
  revalidatePath('/requests');
  revalidatePath('/projects');
  revalidatePath('/my-requests');
  revalidatePath('/health');
  return report;
}

export async function checkTeamSheetConnection() {
  const spreadsheetId = getTeamSheetId();
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { ok: false, detail: 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.' };
  if (!spreadsheetId) return { ok: false, detail: 'TEAM_SHEET_ID is not configured.' };
  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    return { ok: true, detail: `Team sheet reachable (${titles.size} tab${titles.size === 1 ? '' : 's'} visible).` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
export type TeamSheetProjectRow = {
  teamRow: number;
  website: string;
  opportunity: string;
  anchor: string;
  dr: string | number | null;
  traffic: string | number | null;
  status: string;
  note: string;
  createdByEmail: string;
};

export type TeamSheetReadResult =
  | { state: 'ok'; tab: string; rows: TeamSheetProjectRow[] }
  | { state: 'skipped'; tab?: string; rows: TeamSheetProjectRow[]; reason: string }
  | { state: 'failed'; tab?: string; rows: TeamSheetProjectRow[]; reason: string };

// Phase 2 team-sheet import reader. This intentionally does not auto-create
// missing tabs and does not write anything back to Google Sheets.
export async function readProjectSheetRows(project: SyncableProject): Promise<TeamSheetReadResult> {
  const preflight = syncPreflight(project);
  if (preflight.state !== 'ok') return { state: preflight.state === 'failed' ? 'failed' : 'skipped', tab: preflight.tab, rows: [], reason: preflight.error ?? preflight.text };
  if (preflight.mode === 'team') {
    return readTeamSheetProjectRows({ id: project.id, name: project.id, guest_post_tab_name: preflight.tab });
  }

  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, preflight.spreadsheetId);
    if (!titles.has(preflight.tab)) return { state: 'failed', tab: preflight.tab, rows: [], reason: `Project sheet tab "${preflight.tab}" does not exist.` };
    const response = await withGoogleRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: preflight.spreadsheetId, range: `${quoteTab(preflight.tab)}!A:Z` })) as { data: { values?: unknown[][] } };
    const values = response.data.values ?? [];
    const headers = (values[0] ?? []) as unknown[];
    const config = project.sheet_column_config ?? {};
    const liveLinkIndex = ownSheetHeaderIndex(headers, config.liveLink, 'Live Link');
    const anchorIndex = ownSheetHeaderIndex(headers, config.anchor, 'Anchor');
    const statusIndex = ownSheetHeaderIndex(headers, config.status, 'Status');
    const targetIndex = ownSheetHeaderIndex(headers, config.targetUrl, 'Target Page');
    if (liveLinkIndex < 0 || anchorIndex < 0 || statusIndex < 0) return { state: 'failed', tab: preflight.tab, rows: [], reason: 'Project sheet is missing required Live Link, Anchor, or Status headers.' };
    const rows: TeamSheetProjectRow[] = [];
    for (let index = 1; index < values.length; index += 1) {
      const row = values[index] ?? [];
      if (!rowHasContent(row)) continue;
      rows.push({
        teamRow: index + 1,
        website: String(row[liveLinkIndex] ?? '').trim(),
        opportunity: targetIndex >= 0 ? String(row[targetIndex] ?? '').trim() : '',
        anchor: String(row[anchorIndex] ?? '').trim(),
        dr: null,
        traffic: null,
        status: String(row[statusIndex] ?? '').trim(),
        note: '',
        createdByEmail: '',
      });
    }
    return { state: 'ok', tab: preflight.tab, rows };
  } catch (error) {
    return { state: 'failed', tab: preflight.tab, rows: [], reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function readTeamSheetProjectRows(project: {
  id: string;
  name: string;
  guest_post_tab_name: string | null;
}): Promise<TeamSheetReadResult> {
  const tab = project.guest_post_tab_name?.trim();
  if (!tab) return { state: 'skipped', rows: [], reason: 'Project has no team-sheet tab mapping.' };

  const spreadsheetId = getTeamSheetId();
  if (!spreadsheetId) return { state: 'failed', tab, rows: [], reason: 'TEAM_SHEET_ID is not configured.' };
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { state: 'failed', tab, rows: [], reason: 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.' };
  }

  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) return { state: 'skipped', tab, rows: [], reason: 'Mapped tab does not exist in the team sheet.' };

    const response = await withGoogleRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A2:H` })
    ) as { data: { values?: unknown[][] } };

    const rows: TeamSheetProjectRow[] = [];
    for (let index = 0; index < (response.data.values ?? []).length; index += 1) {
      const row = (response.data.values ?? [])[index] ?? [];
      if (!rowHasContent(row)) continue;
      rows.push({
        teamRow: index + 2,
        website: String(row[0] ?? '').trim(),
        opportunity: String(row[1] ?? '').trim(),
        anchor: String(row[2] ?? '').trim(),
        dr: row[3] == null || String(row[3]).trim() === '' ? null : String(row[3]).trim(),
        traffic: row[4] == null || String(row[4]).trim() === '' ? null : String(row[4]).trim(),
        status: String(row[5] ?? '').trim(),
        note: String(row[6] ?? '').trim(),
        createdByEmail: String(row[7] ?? '').trim(),
      });
    }
    return { state: 'ok', tab, rows };
  } catch (error) {
    return { state: 'failed', tab, rows: [], reason: error instanceof Error ? error.message : String(error) };
  }
}
