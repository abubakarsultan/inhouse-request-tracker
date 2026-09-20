'use server';
import { createClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/session';
import { requestSchema, STATUS_OPTIONS, type RequestInput, type RequestStatus } from '@/lib/validators';
import { norm } from '@/lib/normalize';
import { todayKarachi, startOfKarachiMonth, isOverdueKarachi } from '@/lib/date';
import { revalidatePath } from 'next/cache';

export async function getRequests(filters?: { status?: string; project_id?: string; assign_to?: string }) {
  await requireUser();
  const supabase = await createClient();
  let query = supabase
    .from('requests')
    .select('*, projects(id,name,slug,sync_enabled,guest_post_tab_name)')
    .order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.project_id) query = query.eq('project_id', filters.project_id);
  if (filters?.assign_to) query = query.ilike('assign_to', filters.assign_to);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getDistinctAssignToValues(): Promise<string[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from('requests').select('assign_to').not('assign_to', 'is', null);
  if (error) throw error;
  const seen = new Set<string>();
  for (const r of data as { assign_to: string | null }[]) {
    const v = (r.assign_to ?? '').trim();
    if (v) seen.add(v);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export async function getDistinctSharedWithValues(): Promise<string[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from('requests').select('shared_with').not('shared_with', 'is', null);
  if (error) throw error;
  const seen = new Set<string>();
  for (const r of data as { shared_with: string | null }[]) {
    const v = (r.shared_with ?? '').trim();
    if (v) seen.add(v);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/** Duplicate rule (6.1): approved site + anchor both match an existing request, across all clients. */
export async function findDuplicate(approvedSite: string, anchor: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requests')
    .select('id, approved_site, anchor, created_at, projects(name)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const siteN = norm(approvedSite);
  const anchorN = norm(anchor);
  const hit = (data as any[]).find((r) => norm(r.approved_site) === siteN && norm(r.anchor) === anchorN);
  if (!hit) return null;
  return { id: hit.id, date: hit.created_at, client: hit.projects?.name ?? '—' };
}

type CreateResult = {
  saved: true;
  requestId: string;
  sync: { state: 'synced' | 'skipped' | 'failed'; text: string };
};

/**
 * The full write order from section 6.1, inside one server action:
 *   1. Insert requests row
 *   2. Insert/link project_sites row
 *   3. Push to the team sheet
 *   4. Return { saved, sync, summary } — DB write always happens first,
 *      so a failed sheet push never loses or blocks the request.
 */
export async function createRequest(input: RequestInput): Promise<CreateResult> {
  const user = await requireUser();
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();

  if (!parsed.force) {
    const dup = await findDuplicate(parsed.approved_site, parsed.anchor);
    if (dup) {
      throw Object.assign(new Error(`DUPLICATE:${dup.client}:${dup.date}`), { code: 'DUPLICATE', duplicate: dup });
    }
  }

  const { data: project, error: projErr } = await supabase.from('projects').select('*').eq('id', parsed.project_id).single();
  if (projErr) throw projErr;

  const today = todayKarachi();
  const liveDate = parsed.status === 'Live' ? today : null;

  // 1) requests row
  const { data: inserted, error } = await supabase
    .from('requests')
    .insert({
      project_id: parsed.project_id,
      sub_project: parsed.sub_project || null,
      target_url: parsed.target_url,
      anchor: parsed.anchor,
      approved_site: parsed.approved_site,
      placement_page: parsed.placement_page || null,
      shared_with: parsed.shared_with || null,
      priority: parsed.priority,
      assign_to: parsed.assign_to || null,
      deadline: parsed.deadline || null,
      status: parsed.status,
      initial_status: parsed.status,
      live_date: liveDate,
      sync_state: 'skipped',
      created_by: user.id,
      created_by_name: parsed.created_by_name || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  const requestId = inserted.id as string;

  // 2) project_sites row (website/opportunity/anchor/status/note=assign_to)
  const { data: site, error: siteErr } = await supabase
    .from('project_sites')
    .insert({
      project_id: parsed.project_id,
      request_id: requestId,
      website: parsed.approved_site,
      opportunity: parsed.placement_page || null,
      anchor: parsed.anchor,
      status: parsed.status,
      note: parsed.assign_to || null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (siteErr) throw siteErr;

  // 3) push to the team sheet
  const { pushNewRequestToSheet } = await import('@/services/google-sheet-sync');
  const pushResult = await pushNewRequestToSheet(project, {
    approvedSite: parsed.approved_site,
    placementPage: parsed.placement_page ?? null,
    anchor: parsed.anchor,
    status: parsed.status,
    assignTo: parsed.assign_to ?? null,
  });

  let syncState: 'synced' | 'skipped' | 'failed';
  let summary: string;
  if (pushResult.outcome === 'synced') {
    syncState = 'synced';
    summary = `✅ added to team sheet tab "${pushResult.teamTab}" row ${pushResult.teamRow}`;
    await supabase.from('requests').update({ team_tab: pushResult.teamTab, team_row: pushResult.teamRow, sync_state: 'synced' }).eq('id', requestId);
    await supabase.from('project_sites').update({ team_row: pushResult.teamRow }).eq('id', site.id);
  } else if (pushResult.outcome === 'skipped') {
    syncState = 'skipped';
    summary = `⚪ ${pushResult.reason}`;
    await supabase.from('requests').update({ sync_state: 'skipped' }).eq('id', requestId);
  } else {
    syncState = 'failed';
    summary = `❌ team sheet sync failed: ${pushResult.reason} (request is still saved — you can retry the sync)`;
    await supabase.from('requests').update({ sync_state: 'failed', sync_error: pushResult.reason }).eq('id', requestId);
  }

  await supabase.from('sync_logs').insert({
    request_id: requestId,
    project_site_id: site.id,
    direction: 'to_sheet',
    sheet_name: project.guest_post_tab_name,
    sheet_row: pushResult.outcome === 'synced' ? pushResult.teamRow : null,
    status: pushResult.outcome === 'synced' ? 'success' : pushResult.outcome,
    detail: pushResult.outcome === 'synced' ? null : pushResult.reason,
  });

  revalidatePath('/requests');
  revalidatePath('/dashboard');
  revalidatePath('/projects');

  return { saved: true, requestId, sync: { state: syncState, text: summary } };
}

/** Retries the team-sheet push for a request whose sync_state is 'failed' (section 6.1 step 4 / dashboard Retry button). */
export async function retrySync(requestId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: req, error } = await supabase.from('requests').select('*, projects(*)').eq('id', requestId).single();
  if (error) throw error;
  if (!req.projects) throw new Error('Project not found for this request.');

  const { pushNewRequestToSheet } = await import('@/services/google-sheet-sync');
  const pushResult = await pushNewRequestToSheet(req.projects, {
    approvedSite: req.approved_site,
    placementPage: req.placement_page,
    anchor: req.anchor,
    status: req.status,
    assignTo: req.assign_to,
  });

  if (pushResult.outcome === 'synced') {
    await supabase.from('requests').update({ team_tab: pushResult.teamTab, team_row: pushResult.teamRow, sync_state: 'synced', sync_error: null }).eq('id', requestId);
    await supabase.from('project_sites').update({ team_row: pushResult.teamRow }).eq('request_id', requestId);
  } else if (pushResult.outcome === 'skipped') {
    await supabase.from('requests').update({ sync_state: 'skipped', sync_error: null }).eq('id', requestId);
  } else {
    await supabase.from('requests').update({ sync_state: 'failed', sync_error: pushResult.reason }).eq('id', requestId);
  }

  await supabase.from('sync_logs').insert({
    request_id: requestId,
    direction: 'to_sheet',
    sheet_name: req.projects.guest_post_tab_name,
    sheet_row: pushResult.outcome === 'synced' ? pushResult.teamRow : null,
    status: pushResult.outcome === 'synced' ? 'success' : pushResult.outcome,
    detail: pushResult.outcome === 'synced' ? null : pushResult.reason,
  });

  revalidatePath('/requests');
  revalidatePath('/dashboard');
  return pushResult;
}

/**
 * setRequestStatus (6.2) — the ONLY place status is ever written. Every UI
 * entry point (requests table, search, My Requests, project page) calls
 * this. Idempotent: setting the same status again is a no-op that still
 * returns ok. `skipSheetPush` is used by the from-sheet webhook to avoid
 * a ping-pong loop back to the sheet.
 */
export async function setRequestStatus(
  id: string,
  newStatus: RequestStatus,
  changedBy?: string,
  opts?: { skipSheetPush?: boolean }
) {
  const user = await requireUser();
  if (!STATUS_OPTIONS.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);
  const supabase = await createClient();

  const { data: current, error: fetchErr } = await supabase.from('requests').select('*').eq('id', id).single();
  if (fetchErr) throw fetchErr;

  const who = changedBy || 'unknown';
  const result = { database: { ok: false as boolean }, projectSite: { ok: false as boolean }, teamSheet: { ok: false as boolean, reason: undefined as string | undefined } };

  if (current.status === newStatus) {
    // Idempotent no-op — still return ok, still worth stamping who/when touched it.
    result.database.ok = true;
    result.projectSite.ok = true;
    result.teamSheet.ok = true;
    return { ok: true, details: result };
  }

  const today = todayKarachi();
  const liveDate = newStatus === 'Live' && !current.live_date ? today : current.live_date; // never cleared on revert

  // 1) requests row
  const { error: updErr } = await supabase
    .from('requests')
    .update({ status: newStatus, live_date: liveDate, status_changed_by: who, status_changed_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) throw updErr;
  result.database.ok = true;

  // 2) request_logs
  await supabase.from('request_logs').insert({ request_id: id, old_status: current.status, new_status: newStatus, changed_by: who });

  // 3) linked project_sites row
  const { error: siteErr } = await supabase.from('project_sites').update({ status: newStatus }).eq('request_id', id);
  result.projectSite.ok = !siteErr;

  // 4) team sheet, verified (best-effort — never blocks the DB change)
  if (opts?.skipSheetPush) {
    result.teamSheet = { ok: true, reason: undefined };
  } else {
    const { pushStatusToSheet } = await import('@/services/google-sheet-sync');
    const push = await pushStatusToSheet(current.team_tab, current.team_row, current.approved_site, current.anchor, newStatus);
    result.teamSheet = { ok: push.ok, reason: push.reason };
    await supabase.from('requests').update({ sync_state: push.ok ? (current.team_tab ? 'synced' : 'skipped') : 'failed', sync_error: push.ok ? null : push.reason }).eq('id', id);
    if (push.correctedRow) {
      await supabase.from('requests').update({ team_row: push.correctedRow }).eq('id', id);
    }
    await supabase.from('sync_logs').insert({
      request_id: id,
      direction: 'to_sheet',
      sheet_name: current.team_tab,
      sheet_row: current.team_row,
      status: push.ok ? 'success' : 'error',
      detail: push.reason ?? null,
    });
  }

  revalidatePath('/requests');
  revalidatePath('/dashboard');
  revalidatePath('/projects');
  return { ok: result.database.ok, details: result };
}

export async function getDashboardStats() {
  await requireUser();
  const supabase = await createClient();
  const monthStart = startOfKarachiMonth();
  const [{ count: total }, { count: live }, { count: pending }, { count: failed }, { count: thisMonth }, { count: projects }] = await Promise.all([
    supabase.from('requests').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Live'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Request shared'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('sync_state', 'failed'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('active', true),
  ]);
  return {
    total: total ?? 0,
    live: live ?? 0,
    pending: pending ?? 0,
    failedSync: failed ?? 0,
    thisMonth: thisMonth ?? 0,
    projects: projects ?? 0,
  };
}

export async function getFailedSyncRequests() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requests')
    .select('*, projects(name,slug)')
    .eq('sync_state', 'failed')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyRequests(name: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requests')
    .select('*, projects(name,slug)')
    .ilike('assign_to', name)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data as any[];
  return {
    assigned: rows.length,
    live: rows.filter((r) => r.status === 'Live').length,
    pending: rows.filter((r) => r.status === 'Request shared').length,
    overdue: rows.filter((r) => r.status !== 'Live' && isOverdueKarachi(r.deadline)).length,
    rows,
  };
}
