'use server';
import { adminClient } from '@/lib/supabase-admin';
import { credentialsConfigured, tabExists, appendRowWithGap, verifyRow, updateStatusCell } from '@/lib/sheets';

type SyncableProject = {
  id: string;
  guest_post_tab_name: string | null;
  sync_enabled: boolean;
};

type PushResult =
  | { outcome: 'synced'; teamTab: string; teamRow: number }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; reason: string };

/**
 * Pushes a brand-new request row to the team sheet at lastRow+2
 * (section 5 / 6.1, step 3). Columns match the project tab layout:
 * Website, Opportunity, Anchor, DR, Traffic, Status, Note(=assign_to).
 */
export async function pushNewRequestToSheet(
  project: SyncableProject,
  row: { approvedSite: string; placementPage: string | null; anchor: string; status: string; assignTo: string | null }
): Promise<PushResult> {
  if (!project.sync_enabled || !project.guest_post_tab_name) {
    return { outcome: 'skipped', reason: 'This client has no tab in the team sheet — saved here only.' };
  }
  if (!credentialsConfigured()) {
    return { outcome: 'failed', reason: 'Google Sheets is not configured (GOOGLE_SERVICE_ACCOUNT_JSON / TEAM_SHEET_ID missing).' };
  }

  const tab = project.guest_post_tab_name;
  try {
    const exists = await tabExists(tab);
    if (!exists) {
      // A project whose tab does not exist in the team sheet -> skipped, never auto-created (section 5).
      return { outcome: 'skipped', reason: `The team sheet has no "${tab}" tab yet — saved here only.` };
    }

    const { row: teamRow } = await appendRowWithGap(tab, [
      row.approvedSite,
      row.placementPage ?? '',
      row.anchor,
      '',
      '',
      row.status,
      row.assignTo ?? '',
    ]);
    return { outcome: 'synced', teamTab: tab, teamRow };
  } catch (err: any) {
    return { outcome: 'failed', reason: String(err?.message ?? err) };
  }
}

type StatusPushResult = { ok: boolean; reason?: string; correctedRow?: number };

/**
 * Pushes column F (Status) of a request's team-sheet row, verifying the
 * stored row still matches (website + anchor) before writing, and
 * searching the tab to self-heal if it doesn't (section 5 / 6.2 step 5).
 * Best-effort: failures here never block the DB status change.
 */
export async function pushStatusToSheet(
  teamTab: string | null,
  teamRow: number | null,
  approvedSite: string,
  anchor: string,
  newStatus: string
): Promise<StatusPushResult> {
  if (!teamTab || !teamRow) {
    return { ok: true }; // skipped — same as the save-time skip rule, not a failure
  }
  if (!credentialsConfigured()) {
    return { ok: false, reason: 'Google Sheets is not configured.' };
  }
  try {
    const verified = await verifyRow(teamTab, teamRow, approvedSite, anchor);
    if (verified === null) {
      return { ok: false, reason: `Could not find a row in "${teamTab}" matching this site + anchor (it may have been moved or deleted).` };
    }
    await updateStatusCell(teamTab, verified, newStatus);
    return { ok: true, correctedRow: verified !== teamRow ? verified : undefined };
  } catch (err: any) {
    return { ok: false, reason: String(err?.message ?? err) };
  }
}

// ── Sheet -> app (webhook receiver, section 8) ──────────────────────────
// Someone edits column F directly in the team sheet; the installable
// trigger POSTs here. We update via the same status logic, WITHOUT
// pushing back to the sheet (avoids a ping-pong loop).
export async function applyStatusFromSheetWebhook(tab: string, row: number, website: string, anchor: string, status: string) {
  const { setRequestStatus } = await import('@/services/requests');

  const { data: match } = await adminClient
    .from('requests')
    .select('id')
    .eq('team_tab', tab)
    .ilike('approved_site', website)
    .ilike('anchor', anchor)
    .maybeSingle();

  let requestId = match?.id as string | undefined;

  if (!requestId) {
    // fallback: team_tab + team_row
    const { data: byRow } = await adminClient.from('requests').select('id').eq('team_tab', tab).eq('team_row', row).maybeSingle();
    requestId = byRow?.id;
  }

  if (!requestId) {
    await adminClient.from('sync_logs').insert({
      direction: 'from_sheet',
      sheet_name: tab,
      sheet_row: row,
      status: 'error',
      detail: `No request found for tab "${tab}" website "${website}" anchor "${anchor}"`,
    });
    return { error: 'not found' };
  }

  await setRequestStatus(requestId, status as any, 'team sheet', { skipSheetPush: true });
  await adminClient.from('sync_logs').insert({
    request_id: requestId,
    direction: 'from_sheet',
    sheet_name: tab,
    sheet_row: row,
    status: 'success',
  });
  return { success: true };
}
