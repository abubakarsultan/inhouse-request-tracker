'use server';

import { randomUUID } from 'node:crypto';
import { google, type sheets_v4 } from 'googleapis';
import { adminClient } from '@/lib/supabase-admin';
import { normalizeForDuplicate } from '@/lib/validators';

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

// Kept only so the existing Phase-0 webhook route remains safe until Phase 4
// replaces its payload/trigger setup. It updates a linked request when possible
// without pushing back to Sheets, preventing ping-pong loops.
export async function applyStatusFromSheet(projectId: string, website: string, status: string, sheetName: string, sheetRow: number) {
  if (status !== 'Request shared' && status !== 'Live') return { error: 'invalid status' };

  const { data: site } = await adminClient
    .from('project_sites')
    .select('id,request_id,anchor')
    .eq('project_id', projectId)
    .ilike('website', website)
    .limit(1)
    .maybeSingle();

  if (!site) return { error: 'not found' };

  if (site.request_id) {
    const { setRequestStatus } = await import('@/services/requests');
    return setRequestStatus(site.request_id, status, 'team sheet', { pushToSheet: false, sheetRow });
  }

  await adminClient.from('project_sites').update({ status, team_row: sheetRow }).eq('id', site.id);
  await logSync({ projectSiteId: site.id, direction: 'from_sheet', sheetName, sheetRow, status: 'success' });
  return { success: true };
}
