'use server';

import { randomUUID } from 'node:crypto';
import { google, type sheets_v4 } from 'googleapis';
import { adminClient } from '@/lib/supabase-admin';
import { normalizeForDuplicate } from '@/lib/validators';
import { revalidatePath } from 'next/cache';

type SyncableProject = {
  id: string;
  guest_post_tab_name: string | null;
  sync_enabled: boolean;
};

export type RequestSheetRecord = {
  id: string;
  project_id: string;
  approved_site: string;
  placement_page: string | null;
  anchor: string;
  assign_to: string | null;
  status: string;
  team_tab: string | null;
  team_row: number | null;
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
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!encoded) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');

  let credentials: Record<string, unknown>;
  try {
    const raw = Buffer.from(encoded, 'base64').toString('utf8');
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid base64-encoded JSON');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
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

function syncPreflight(project: SyncableProject, tabOverride?: string | null): { state: 'ok'; tab: string; spreadsheetId: string } | SheetSyncResult {
  if (!project.sync_enabled) {
    return { state: 'skipped', text: '⚪ Sheet sync is disabled for this project (saved here only).' };
  }
  const tab = tabOverride?.trim() || project.guest_post_tab_name?.trim();
  if (!tab) {
    return { state: 'skipped', text: '⚪ This client has no tab in the team sheet (saved here only).' };
  }
  const spreadsheetId = getTeamSheetId();
  if (!spreadsheetId) {
    return {
      state: 'failed',
      text: '❌ Team sheet sync failed: TEAM_SHEET_ID is not configured. Request is still saved.',
      error: 'TEAM_SHEET_ID is not configured',
    };
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return {
      state: 'failed',
      text: '❌ Team sheet sync failed: Google service-account credentials are not configured. Request is still saved.',
      error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured',
    };
  }
  return { state: 'ok', tab, spreadsheetId };
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

    await acquireAppendLock(lockKey, ownerToken);
    try {
      let allRows = await withGoogleRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:G` })
      ) as { data: { values?: unknown[][] } };
      let targetRow = Math.max(2, lastNonEmptyRow((allRows.data.values ?? []) as unknown[][]) + 2);

      // The lock prevents app/app races. Re-check the exact target as a
      // second guard against a person writing to the sheet at the same time.
      let freeTargetConfirmed = false;
      for (let check = 0; check < 10; check += 1) {
        const target = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${targetRow}:G${targetRow}` })
        ) as { data: { values?: unknown[][] } };
        const occupied = rowHasContent((target.data.values ?? [])[0]);
        if (!occupied) {
          freeTargetConfirmed = true;
          break;
        }
        allRows = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:G` })
        ) as { data: { values?: unknown[][] } };
        targetRow = Math.max(targetRow + 1, lastNonEmptyRow((allRows.data.values ?? []) as unknown[][]) + 2);
      }
      if (!freeTargetConfirmed) throw new Error('Could not find a safe empty row for the team-sheet append.');

      await withGoogleRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quoteTab(tab)}!A${targetRow}:G${targetRow}`,
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
  const ownerToken = randomUUID();
  const lockKey = `team-sheet:${spreadsheetId}:${tab}`;
  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) {
      await logSync({ projectSiteId: site.id, direction: 'to_sheet', sheetName: tab, status: 'skipped', detail: 'Mapped team tab does not exist' });
      return { state: 'skipped', text: '⚪ This client has no tab in the team sheet (saved here only).', tab };
    }

    await acquireAppendLock(lockKey, ownerToken);
    try {
      const allRows = await withGoogleRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:G` })
      ) as { data: { values?: unknown[][] } };
      let targetRow = Math.max(2, lastNonEmptyRow((allRows.data.values ?? []) as unknown[][]) + 2);
      let freeTargetConfirmed = false;
      for (let check = 0; check < 10; check += 1) {
        const target = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${targetRow}:G${targetRow}` })
        ) as { data: { values?: unknown[][] } };
        if (!rowHasContent((target.data.values ?? [])[0])) {
          freeTargetConfirmed = true;
          break;
        }
        const reread = await withGoogleRetry(() =>
          sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:G` })
        ) as { data: { values?: unknown[][] } };
        targetRow = Math.max(targetRow + 1, lastNonEmptyRow((reread.data.values ?? []) as unknown[][]) + 2);
      }
      if (!freeTargetConfirmed) throw new Error('Could not find a safe empty row for the team-sheet append.');

      await withGoogleRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quoteTab(tab)}!A${targetRow}:G${targetRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[
            site.website,
            site.opportunity ?? '',
            site.anchor ?? '',
            site.dr ?? '',
            site.traffic ?? '',
            site.status,
            site.note ?? '',
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
}, persistRepair = false): Promise<VerifiedTeamRowResult> {
  const tab = request.team_tab?.trim();
  if (!tab) return { state: 'failed', reason: 'Request has no stored team_tab.' };
  const spreadsheetId = getTeamSheetId();
  if (!spreadsheetId) return { state: 'failed', tab, reason: 'TEAM_SHEET_ID is not configured.' };
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { state: 'failed', tab, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.' };

  try {
    const sheets = getSheetsClient();
    const titles = await getTabTitles(sheets, spreadsheetId);
    if (!titles.has(tab)) return { state: 'failed', tab, reason: `Team-sheet tab "${tab}" does not exist.` };

    const verified = await findVerifiedRow(sheets, spreadsheetId, tab, request.team_row, request.approved_site, request.anchor);
    if (!verified) {
      return { state: 'failed', tab, reason: `No row in "${tab}" matches both website "${request.approved_site}" and anchor "${request.anchor}".` };
    }

    const response = await withGoogleRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A${verified.row}:F${verified.row}` })
    ) as { data: { values?: unknown[][] } };
    const row = (response.data.values ?? [])[0] ?? [];
    if (!rowMatches(row as unknown[], request.approved_site, request.anchor)) {
      return { state: 'failed', tab, reason: `Verified row ${verified.row} changed before it could be read again.` };
    }

    if (persistRepair && verified.repaired) {
      await adminClient.from('requests').update({ team_row: verified.row, sync_state: 'synced', sync_error: null }).eq('id', request.id);
      if (request.project_site_id) await adminClient.from('project_sites').update({ team_row: verified.row }).eq('id', request.project_site_id);
      await logSync({ requestId: request.id, projectSiteId: request.project_site_id, direction: 'from_sheet', sheetName: tab, sheetRow: verified.row, status: 'success', detail: 'Stored row repaired by verify-and-search' });
    }

    return { state: 'ok', tab, row: verified.row, repaired: verified.repaired, sheetStatus: String(row[5] ?? '').trim() };
  } catch (error) {
    return { state: 'failed', tab, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function applyStatusFromSheet(payload: {
  tab: string;
  row: number;
  website: string;
  anchor: string;
  status: 'Request shared' | 'Live';
}) {
  const { data, error } = await adminClient.rpc('find_request_from_sheet', {
    p_tab: payload.tab,
    p_website: payload.website,
    p_anchor: payload.anchor,
    p_row: payload.row,
  });
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
  const { setRequestStatus } = await import('@/services/requests');
  const result = await setRequestStatus(requestId, payload.status, 'team sheet', {
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

      if (sheetStatus !== 'Request shared' && sheetStatus !== 'Live') {
        report.invalidStatuses += 1;
        report.errors.push(`${tab} row ${verifiedRow}: invalid status "${sheetStatus || '(blank)'}".`);
        await adminClient.from('requests').update({ team_row: verifiedRow, sync_state: 'failed', sync_error: `Invalid team-sheet status: ${sheetStatus || '(blank)'}` }).eq('id', request.id);
        if (projectSiteId) await adminClient.from('project_sites').update({ team_row: verifiedRow }).eq('id', projectSiteId);
        await logSync({ requestId: request.id, projectSiteId, direction: 'from_sheet', sheetName: tab, sheetRow: verifiedRow, status: 'error', detail: `Invalid status: ${sheetStatus || '(blank)'}` });
        continue;
      }

      const { setRequestStatus } = await import('@/services/requests');
      const statusResult = await setRequestStatus(request.id, sheetStatus, 'team sheet refresh', { pushToSheet: false, sheetRow: verifiedRow });
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

export type TeamSheetProjectRow = {
  teamRow: number;
  website: string;
  opportunity: string;
  anchor: string;
  dr: string | number | null;
  traffic: string | number | null;
  status: string;
  note: string;
};

export type TeamSheetReadResult =
  | { state: 'ok'; tab: string; rows: TeamSheetProjectRow[] }
  | { state: 'skipped'; tab?: string; rows: TeamSheetProjectRow[]; reason: string }
  | { state: 'failed'; tab?: string; rows: TeamSheetProjectRow[]; reason: string };

// Phase 2 team-sheet import reader. This intentionally does not auto-create
// missing tabs and does not write anything back to Google Sheets.
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
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A2:G` })
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
      });
    }
    return { state: 'ok', tab, rows };
  } catch (error) {
    return { state: 'failed', tab, rows: [], reason: error instanceof Error ? error.message : String(error) };
  }
}
