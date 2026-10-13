import 'server-only';

import { createClient } from '@/lib/supabase-server';
import { isRequestStatus } from '@/lib/validators';
import { karachiDateString } from '@/lib/date';
import { syncRequestStatusToTeamSheet, type RequestSheetRecord } from '@/services/google-sheet-sync';
import { revalidatePath } from 'next/cache';

type CreateSyncState = 'synced' | 'skipped' | 'failed';
type StatusStep = { ok: boolean; skipped?: boolean; noOp?: boolean; reason?: string };
export type SetStatusResult = {
  ok: boolean;
  database: StatusStep;
  projectSite: StatusStep;
  teamSheet: StatusStep & { state?: CreateSyncState; text?: string };
};

export async function setRequestStatusCore(
  requestId: string,
  newStatus: string,
  changedBy: string,
  options?: { pushToSheet?: boolean; sheetRow?: number }
): Promise<SetStatusResult> {
  if (!isRequestStatus(newStatus)) throw new Error(`Invalid status: ${newStatus}`);
  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from('requests')
    .select('*, projects(id,name,slug,guest_post_tab_name,sync_enabled)')
    .eq('id', requestId)
    .is('deleted_at', null)
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? 'Request not found');

  const project = Array.isArray(current.projects) ? current.projects[0] : current.projects;
  const { data: linkedSite } = await supabase.from('project_sites').select('id,team_row').eq('request_id', requestId).maybeSingle();

  if (current.status === newStatus) {
    const requestNoOpUpdate: Record<string, unknown> = {};
    if (options?.sheetRow && options.sheetRow !== current.team_row) requestNoOpUpdate.team_row = options.sheetRow;
    if (options?.pushToSheet === false) {
      requestNoOpUpdate.sync_state = 'synced';
      requestNoOpUpdate.sync_error = null;
    }
    if (Object.keys(requestNoOpUpdate).length) await supabase.from('requests').update(requestNoOpUpdate).eq('id', requestId);
    if (linkedSite?.id) {
      const siteNoOpUpdate: Record<string, unknown> = { status: newStatus };
      if (options?.sheetRow) siteNoOpUpdate.team_row = options.sheetRow;
      await supabase.from('project_sites').update(siteNoOpUpdate).eq('id', linkedSite.id);
    }
    return {
      ok: true,
      database: { ok: true, noOp: true },
      projectSite: { ok: true, noOp: true, skipped: !linkedSite },
      teamSheet: { ok: true, noOp: true, skipped: options?.pushToSheet === false, state: options?.pushToSheet === false ? 'synced' : undefined },
    };
  }

  const changedByClean = changedBy.trim() || 'unknown';
  const requestUpdate: Record<string, unknown> = {
    status: newStatus,
    status_changed_by: changedByClean,
    status_changed_at: new Date().toISOString(),
  };
  if (newStatus === 'Live' && !current.live_date) requestUpdate.live_date = karachiDateString();
  if (options?.sheetRow) requestUpdate.team_row = options.sheetRow;

  const { error: dbError } = await supabase.from('requests').update(requestUpdate).eq('id', requestId);
  if (dbError) throw new Error(dbError.message);
  const database: StatusStep = { ok: true };

  let projectSite: StatusStep = { ok: true, skipped: true, reason: 'No linked project_sites row' };
  if (linkedSite?.id) {
    const siteUpdate: Record<string, unknown> = { status: newStatus };
    if (options?.sheetRow) siteUpdate.team_row = options.sheetRow;
    const { error: siteError } = await supabase.from('project_sites').update(siteUpdate).eq('id', linkedSite.id);
    projectSite = siteError ? { ok: false, reason: siteError.message } : { ok: true };
  }

  const { error: logError } = await supabase.from('request_logs').insert({ request_id: requestId, old_status: current.status, new_status: newStatus, changed_by: changedByClean });
  if (logError && projectSite.ok) projectSite = { ok: false, reason: `Status changed, but audit log failed: ${logError.message}` };

  let teamSheet: SetStatusResult['teamSheet'];
  if (options?.pushToSheet === false) {
    await supabase.from('requests').update({ sync_state: 'synced', sync_error: null }).eq('id', requestId);
    teamSheet = { ok: true, skipped: true, state: 'synced', text: 'Sheet-originated change; push-back intentionally skipped.' };
  } else {
    const record: RequestSheetRecord = {
      id: current.id,
      project_id: current.project_id,
      approved_site: current.approved_site,
      placement_page: current.placement_page,
      anchor: current.anchor,
      assign_to: current.assign_to,
      status: newStatus,
      team_tab: current.team_tab,
      team_row: current.team_row,
      created_by_email: current.created_by_email ?? null,
    };
    const sync = await syncRequestStatusToTeamSheet(project as any, record, linkedSite?.id ?? null);
    teamSheet = { ok: sync.state !== 'failed', skipped: sync.state === 'skipped', state: sync.state, text: sync.text, reason: sync.error };

    const syncStateUpdate: Record<string, unknown> = { sync_state: sync.state, sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null };
    if (sync.tab) syncStateUpdate.team_tab = sync.tab;
    if (sync.row) syncStateUpdate.team_row = sync.row;
    await supabase.from('requests').update(syncStateUpdate).eq('id', requestId);
    if (sync.row && linkedSite?.id) await supabase.from('project_sites').update({ team_row: sync.row }).eq('id', linkedSite.id);
  }

  revalidateRequestPaths(project?.slug);
  return { ok: database.ok && projectSite.ok && teamSheet.ok, database, projectSite, teamSheet };
}

function revalidateRequestPaths(projectSlug?: string | null) {
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  revalidatePath('/my-requests');
  revalidatePath('/team');
  if (projectSlug) revalidatePath(`/projects/${projectSlug}`);
}
