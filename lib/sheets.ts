// Google Sheets integration — section 5 of the master prompt.
// Server-only. Never import this into a client component.
// (Not marked 'use server' — this is a plain helper module with some
// synchronous exports, not a set of directly-callable server actions.
// It is only ever imported from services/*.ts, which are themselves
// 'use server' and already run exclusively on the server.)

import { google, sheets_v4 } from 'googleapis';
import { adminClient } from '@/lib/supabase-admin';
import { norm } from '@/lib/normalize';

const TEAM_SHEET_ID = process.env.TEAM_SHEET_ID || '';

export function credentialsConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) && Boolean(TEAM_SHEET_ID);
}

let _sheets: sheets_v4.Sheets | null = null;
function client(): sheets_v4.Sheets {
  if (_sheets) return _sheets;
  const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!, 'base64').toString('utf8');
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/** Retry with backoff on 429/5xx, per section 5's "retry with backoff" rule. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.code || err?.response?.status;
      const retriable = status === 429 || (typeof status === 'number' && status >= 500);
      if (!retriable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// ── Sheet tab metadata cache (briefly, per section 5) ──────────────────
let tabListCache: { at: number; names: Set<string> } | null = null;
const TAB_CACHE_MS = 30_000;

async function listTabNames(): Promise<Set<string>> {
  if (tabListCache && Date.now() - tabListCache.at < TAB_CACHE_MS) return tabListCache.names;
  const res = await withRetry(() => client().spreadsheets.get({ spreadsheetId: TEAM_SHEET_ID, fields: 'sheets.properties.title' }));
  const names = new Set((res.data.sheets ?? []).map((s) => s.properties?.title ?? ''));
  tabListCache = { at: Date.now(), names };
  return names;
}

export async function tabExists(tabName: string): Promise<boolean> {
  if (!tabName) return false;
  const names = await listTabNames();
  return names.has(tabName);
}

// ── DB-backed mutex so two simultaneous saves never pick the same
//    lastRow+2 in the same tab (section 5). ────────────────────────────
async function acquireLock(tabName: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  // Best-effort cleanup of stale locks (>30s old — a crashed request).
  await adminClient.from('sheet_write_locks').delete().eq('tab_name', tabName).lt('locked_at', new Date(Date.now() - 30_000).toISOString());
  while (Date.now() - start < timeoutMs) {
    const { error } = await adminClient.from('sheet_write_locks').insert({ tab_name: tabName });
    if (!error) return; // got the lock
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 150));
  }
  throw new Error(`Timed out waiting for the sheet write lock on tab "${tabName}"`);
}

async function releaseLock(tabName: string): Promise<void> {
  await adminClient.from('sheet_write_locks').delete().eq('tab_name', tabName);
}

/**
 * Appends a new row at lastRow + 2 (one blank row gap — intentional, per
 * section 5), using values.update on that exact range (never values.append).
 * Serialized per tab so two concurrent saves can't race the same row.
 */
export async function appendRowWithGap(tabName: string, values: (string | number)[]): Promise<{ row: number }> {
  await acquireLock(tabName);
  try {
    let attempt = 0;
    // Re-read lastRow inside the lock; if the target row is already
    // non-empty (shouldn't happen under the lock, but defensive), advance.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const range = `${tabName}!A:A`;
      const res = await withRetry(() => client().spreadsheets.values.get({ spreadsheetId: TEAM_SHEET_ID, range }));
      const lastRow = res.data.values ? res.data.values.length : 0;
      const targetRow = lastRow + 2;

      const check = await withRetry(() =>
        client().spreadsheets.values.get({ spreadsheetId: TEAM_SHEET_ID, range: `${tabName}!A${targetRow}` })
      );
      const isEmpty = !check.data.values || !check.data.values[0] || !String(check.data.values[0][0] ?? '').trim();
      if (!isEmpty) {
        attempt++;
        if (attempt > 5) throw new Error(`Could not find a free row in "${tabName}" after 5 attempts`);
        continue;
      }

      await withRetry(() =>
        client().spreadsheets.values.update({
          spreadsheetId: TEAM_SHEET_ID,
          range: `${tabName}!A${targetRow}:G${targetRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [values] },
        })
      );
      return { row: targetRow };
    }
  } finally {
    await releaseLock(tabName);
  }
}

/**
 * Verifies that `teamTab!A{teamRow}` (Website) and `!C{teamRow}` (Anchor)
 * still match what's expected before writing to that row. If they don't,
 * searches the tab for a row matching both; returns the corrected row, or
 * null if no matching row was found (caller should mark sync_state=failed).
 */
export async function verifyRow(tabName: string, row: number, expectedWebsite: string, expectedAnchor: string): Promise<number | null> {
  const res = await withRetry(() => client().spreadsheets.values.get({ spreadsheetId: TEAM_SHEET_ID, range: `${tabName}!A${row}:C${row}` }));
  const vals = res.data.values?.[0] ?? [];
  if (norm(vals[0]) === norm(expectedWebsite) && norm(vals[2]) === norm(expectedAnchor)) return row;

  // Not a match — search the whole tab.
  const all = await withRetry(() => client().spreadsheets.values.get({ spreadsheetId: TEAM_SHEET_ID, range: `${tabName}!A2:C` }));
  const rows = all.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    if (norm(rows[i][0]) === norm(expectedWebsite) && norm(rows[i][2]) === norm(expectedAnchor)) {
      return i + 2;
    }
  }
  return null;
}

/** Writes column F (Status) of a verified row. Caller must verifyRow() first if a stored row number is being reused. */
export async function updateStatusCell(tabName: string, row: number, status: string): Promise<void> {
  await withRetry(() =>
    client().spreadsheets.values.update({
      spreadsheetId: TEAM_SHEET_ID,
      range: `${tabName}!F${row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[status]] },
    })
  );
}

/** Reads A2:G of a tab (used by the importer and Site Check DB-backed scan in later phases). */
export async function readTabRows(tabName: string): Promise<string[][]> {
  const res = await withRetry(() => client().spreadsheets.values.get({ spreadsheetId: TEAM_SHEET_ID, range: `${tabName}!A2:G` }));
  return (res.data.values as string[][]) ?? [];
}
