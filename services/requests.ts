'use server';

import { createClient } from '@/lib/supabase-server';
import { requestSchema, isRequestStatus, looksLikeHttpUrl, type RequestInput } from '@/lib/validators';
import { karachiDateString, karachiDateOffsetString, karachiMonthBounds } from '@/lib/date';
import { appendRequestToTeamSheet, syncRequestStatusToTeamSheet, type RequestSheetRecord } from '@/services/google-sheet-sync';
import { revalidatePath } from 'next/cache';

type DuplicateInfo = { date: string; client: string };
type CreateSyncState = 'synced' | 'skipped' | 'failed';

export type CreateRequestResult =
  | { saved: false; duplicate: DuplicateInfo }
  | {
      saved: true;
      sync: { state: CreateSyncState; text: string };
      summary: {
        requestId: string;
        client: string;
        site: string;
        anchor: string;
        requestStatus: 'Request shared' | 'Live';
        targetUrlWarning: string | null;
      };
    };

function cleanOptional(value: string | null | undefined) {
  const clean = String(value ?? '').trim();
  return clean || null;
}

async function findDuplicate(approvedSite: string, anchor: string): Promise<DuplicateInfo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('find_request_duplicate', {
    p_approved_site: approvedSite,
    p_anchor: anchor,
  });
  if (error) throw new Error(`Duplicate check failed: ${error.message}`);
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return null;
  return {
    date: first.created_at ? karachiDateString(new Date(String(first.created_at))) : '',
    client: String(first.project_name ?? ''),
  };
}

export async function getRequests(filters?: { status?: string; project_id?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from('requests')
    .select('*, projects(id,name,slug,sync_enabled,guest_post_tab_name,outreach_project_name)')
    .order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.project_id) query = query.eq('project_id', filters.project_id);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getAutocompleteOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('requests').select('assign_to,shared_with').limit(5000);
  if (error) throw error;

  const distinct = (key: 'assign_to' | 'shared_with') => {
    const seen = new Map<string, string>();
    for (const row of data ?? []) {
      const value = String(row[key] ?? '').trim();
      if (!value) continue;
      const normalized = value.toLowerCase();
      if (!seen.has(normalized)) seen.set(normalized, value);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  };

  return { assignTo: distinct('assign_to'), sharedWith: distinct('shared_with') };
}

export async function createRequest(input: RequestInput, forceDuplicate = false): Promise<CreateRequestResult> {
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();

  if (!forceDuplicate) {
    const duplicate = await findDuplicate(parsed.approved_site, parsed.anchor);
    if (duplicate) return { saved: false, duplicate };
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id,name,slug,outreach_project_name,guest_post_tab_name,sync_enabled,active')
    .eq('id', parsed.project_id)
    .single();
  if (projectError || !project) throw new Error(projectError?.message ?? 'Project not found');
  if (project.active === false) throw new Error('This project is disabled.');

  const status = parsed.status;
  const liveDate = status === 'Live' ? karachiDateString() : null;
  const requestPayload = {
    project_id: parsed.project_id,
    sub_project: cleanOptional(parsed.sub_project),
    target_url: parsed.target_url.trim(),
    anchor: parsed.anchor.trim(),
    approved_site: parsed.approved_site.trim(),
    placement_page: cleanOptional(parsed.placement_page),
    shared_with: cleanOptional(parsed.shared_with),
    priority: parsed.priority,
    assign_to: cleanOptional(parsed.assign_to),
    deadline: cleanOptional(parsed.deadline),
    status,
    initial_status: status,
    live_date: liveDate,
    sync_state: 'skipped',
    sync_error: null,
    created_by_name: cleanOptional(parsed.created_by_name),
  };

  // DB is the source of truth: this insert always happens before any sheet call.
  const { data: request, error: requestError } = await supabase
    .from('requests')
    .insert(requestPayload)
    .select('*')
    .single();
  if (requestError || !request) throw new Error(requestError?.message ?? 'Could not save request');

  const { data: projectSite, error: siteError } = await supabase
    .from('project_sites')
    .insert({
      project_id: parsed.project_id,
      request_id: request.id,
      website: request.approved_site,
      opportunity: request.placement_page,
      anchor: request.anchor,
      status: request.status,
      note: request.assign_to,
      team_row: null,
    })
    .select('id')
    .single();

  if (siteError || !projectSite) {
    const reason = `Linked project-site row failed: ${siteError?.message ?? 'unknown error'}`;
    await supabase.from('requests').update({ sync_state: 'failed', sync_error: reason }).eq('id', request.id);
    revalidatePhase1Paths(project.slug);
    return {
      saved: true,
      sync: { state: 'failed', text: `❌ ${reason}. The request itself is safely saved in the database.` },
      summary: makeCreateSummary(project.name, request, parsed.target_url),
    };
  }

  const sheetRecord: RequestSheetRecord = {
    id: request.id,
    project_id: request.project_id,
    approved_site: request.approved_site,
    placement_page: request.placement_page,
    anchor: request.anchor,
    assign_to: request.assign_to,
    status: request.status,
    team_tab: request.team_tab,
    team_row: request.team_row,
  };
  const sync = await appendRequestToTeamSheet(project, sheetRecord, projectSite.id);

  const syncUpdate: Record<string, unknown> = {
    sync_state: sync.state,
    sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null,
  };
  if (sync.tab) syncUpdate.team_tab = sync.tab;
  if (sync.row) syncUpdate.team_row = sync.row;
  await supabase.from('requests').update(syncUpdate).eq('id', request.id);
  if (sync.row) await supabase.from('project_sites').update({ team_row: sync.row }).eq('id', projectSite.id);

  revalidatePhase1Paths(project.slug);
  return {
    saved: true,
    sync: { state: sync.state, text: sync.text },
    summary: makeCreateSummary(project.name, request, parsed.target_url),
  };
}

function makeCreateSummary(projectName: string, request: any, targetUrl: string) {
  return {
    requestId: String(request.id),
    client: projectName,
    site: String(request.approved_site),
    anchor: String(request.anchor),
    requestStatus: request.status as 'Request shared' | 'Live',
    targetUrlWarning: looksLikeHttpUrl(targetUrl)
      ? null
      : 'Target URL does not look like a complete http/https URL, but it was saved as entered.',
  };
}

export async function retryRequestSync(requestId: string) {
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from('requests')
    .select('*, projects(id,name,slug,guest_post_tab_name,sync_enabled)')
    .eq('id', requestId)
    .single();
  if (error || !request) throw new Error(error?.message ?? 'Request not found');

  const { data: site } = await supabase.from('project_sites').select('id').eq('request_id', requestId).maybeSingle();
  const project = request.projects as any;
  const sync = request.team_row
    ? await syncRequestStatusToTeamSheet(project, request as RequestSheetRecord, site?.id ?? null)
    : await appendRequestToTeamSheet(project, request as RequestSheetRecord, site?.id ?? null);

  const update: Record<string, unknown> = {
    sync_state: sync.state,
    sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null,
  };
  if (sync.tab) update.team_tab = sync.tab;
  if (sync.row) update.team_row = sync.row;
  await supabase.from('requests').update(update).eq('id', requestId);
  if (sync.row && site?.id) await supabase.from('project_sites').update({ team_row: sync.row }).eq('id', site.id);

  revalidatePhase1Paths(project?.slug);
  return { state: sync.state, text: sync.text };
}

type StatusStep = { ok: boolean; skipped?: boolean; noOp?: boolean; reason?: string };
export type SetStatusResult = {
  ok: boolean;
  database: StatusStep;
  projectSite: StatusStep;
  teamSheet: StatusStep & { state?: CreateSyncState; text?: string };
};

export async function setRequestStatus(
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
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? 'Request not found');

  const project = current.projects as any;
  const { data: linkedSite } = await supabase
    .from('project_sites')
    .select('id,team_row')
    .eq('request_id', requestId)
    .maybeSingle();

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
  const changedAt = new Date().toISOString();
  const requestUpdate: Record<string, unknown> = {
    status: newStatus,
    status_changed_by: changedByClean,
    status_changed_at: changedAt,
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

  const { error: logError } = await supabase.from('request_logs').insert({
    request_id: requestId,
    old_status: current.status,
    new_status: newStatus,
    changed_by: changedByClean,
  });
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
    };
    const sync = await syncRequestStatusToTeamSheet(project, record, linkedSite?.id ?? null);
    teamSheet = {
      ok: sync.state !== 'failed',
      skipped: sync.state === 'skipped',
      state: sync.state,
      text: sync.text,
      reason: sync.error,
    };

    const syncStateUpdate: Record<string, unknown> = {
      sync_state: sync.state,
      sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null,
    };
    if (sync.tab) syncStateUpdate.team_tab = sync.tab;
    if (sync.row) syncStateUpdate.team_row = sync.row;
    await supabase.from('requests').update(syncStateUpdate).eq('id', requestId);
    if (sync.row && linkedSite?.id) await supabase.from('project_sites').update({ team_row: sync.row }).eq('id', linkedSite.id);
  }

  revalidatePhase1Paths(project?.slug);
  return { ok: database.ok && projectSite.ok && teamSheet.ok, database, projectSite, teamSheet };
}


export type DashboardActivityRow = {
  id: string;
  created_at: string;
  approved_site: string;
  assign_to: string | null;
  status: string;
  live_date: string | null;
  sync_state: string;
  sync_error: string | null;
  projects: { name: string; slug: string } | null;
};

export type ProjectBreakdownRow = {
  id: string;
  name: string;
  slug: string;
  total: number;
  live: number;
  pending: number;
};

async function loadAllRequestStatuses(supabase: Awaited<ReturnType<typeof createClient>>) {
  const rows: Array<{ project_id: string; status: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('requests').select('project_id,status').range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ project_id: string; status: string }>));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

export async function getDashboardOverview() {
  const supabase = await createClient();
  const month = karachiMonthBounds();
  const liveSince = karachiDateOffsetString(-6);

  const [
    { count: total },
    { count: live },
    { count: pending },
    { count: failedSync },
    { count: thisMonth },
    recentResult,
    becameLiveResult,
    failedResult,
    projectsResult,
    requestStatuses,
    refreshResult,
  ] = await Promise.all([
    supabase.from('requests').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Live'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Request shared'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('sync_state', 'failed'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', month.start).lt('created_at', month.end),
    supabase.from('requests').select('id,created_at,approved_site,assign_to,status,live_date,sync_state,sync_error,projects(name,slug)').order('created_at', { ascending: false }).limit(8),
    supabase.from('requests').select('id,created_at,approved_site,assign_to,status,live_date,sync_state,sync_error,projects(name,slug)').gte('live_date', liveSince).order('live_date', { ascending: false }).limit(50),
    supabase.from('requests').select('id,approved_site,anchor,sync_error,updated_at,projects(name,slug)').eq('sync_state', 'failed').order('updated_at', { ascending: false }).limit(50),
    supabase.from('projects').select('id,name,slug').order('name'),
    loadAllRequestStatuses(supabase),
    supabase.from('sync_logs').select('created_at,detail').eq('direction', 'from_sheet').eq('sheet_name', '__refresh__').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (recentResult.error) throw recentResult.error;
  if (becameLiveResult.error) throw becameLiveResult.error;
  if (failedResult.error) throw failedResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (refreshResult.error) throw refreshResult.error;

  let lastRefresh: { createdAt: string; updated: number; checked: number } | null = null;
  if (refreshResult.data?.created_at) {
    let parsed: any = {};
    try { parsed = refreshResult.data.detail ? JSON.parse(String(refreshResult.data.detail)) : {}; } catch { parsed = {}; }
    lastRefresh = {
      createdAt: String(refreshResult.data.created_at),
      updated: Number(parsed.updated ?? 0),
      checked: Number(parsed.checked ?? 0),
    };
  }

  const counts = new Map<string, { total: number; live: number; pending: number }>();
  for (const row of requestStatuses) {
    const item = counts.get(row.project_id) ?? { total: 0, live: 0, pending: 0 };
    item.total += 1;
    if (row.status === 'Live') item.live += 1;
    if (row.status === 'Request shared') item.pending += 1;
    counts.set(row.project_id, item);
  }

  const breakdown: ProjectBreakdownRow[] = (projectsResult.data ?? []).map((project: any) => {
    const item = counts.get(String(project.id)) ?? { total: 0, live: 0, pending: 0 };
    return { id: String(project.id), name: String(project.name), slug: String(project.slug), ...item };
  });

  return {
    stats: {
      total: total ?? 0,
      live: live ?? 0,
      pending: pending ?? 0,
      failedSync: failedSync ?? 0,
      thisMonth: thisMonth ?? 0,
    },
    recent: (recentResult.data ?? []) as DashboardActivityRow[],
    becameLive: (becameLiveResult.data ?? []) as DashboardActivityRow[],
    failed: failedResult.data ?? [],
    breakdown,
    liveSince,
    lastRefresh,
  };
}

export type MyRequestsResult = {
  name: string;
  today: string;
  kpis: { assigned: number; live: number; pending: number; overdue: number };
  upcoming: any[];
  requests: any[];
};

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function getMyRequests(name: string): Promise<MyRequestsResult> {
  const clean = name.trim();
  const today = karachiDateString();
  if (!clean) {
    return { name: '', today, kpis: { assigned: 0, live: 0, pending: 0, overdue: 0 }, upcoming: [], requests: [] };
  }

  const supabase = await createClient();
  const rows: any[] = [];
  const pattern = escapeLikePattern(clean);
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('requests')
      .select('id,project_id,sub_project,approved_site,anchor,priority,assign_to,deadline,status,sync_state,sync_error,created_at,projects(name,slug)')
      .ilike('assign_to', pattern)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const live = rows.filter((row) => row.status === 'Live').length;
  const pending = rows.filter((row) => row.status === 'Request shared').length;
  const overdue = rows.filter((row) => row.status !== 'Live' && row.deadline && String(row.deadline).slice(0, 10) < today).length;
  const upcomingEnd = karachiDateOffsetString(6);
  const upcoming = rows
    .filter((row) => row.status !== 'Live' && row.deadline && String(row.deadline).slice(0, 10) >= today && String(row.deadline).slice(0, 10) <= upcomingEnd)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

  return {
    name: clean,
    today,
    kpis: { assigned: rows.length, live, pending, overdue },
    upcoming,
    requests: rows,
  };
}

export async function getDashboardStats() {
  const supabase = await createClient();
  const month = karachiMonthBounds();
  const [{ count: total }, { count: live }, { count: pending }, { count: failedSync }, { count: thisMonth }] = await Promise.all([
    supabase.from('requests').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Live'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Request shared'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('sync_state', 'failed'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', month.start).lt('created_at', month.end),
  ]);
  return {
    total: total ?? 0,
    live: live ?? 0,
    pending: pending ?? 0,
    failedSync: failedSync ?? 0,
    thisMonth: thisMonth ?? 0,
  };
}

function revalidatePhase1Paths(projectSlug?: string | null) {
  revalidatePath('/requests');
  revalidatePath('/requests/new');
  revalidatePath('/dashboard');
  revalidatePath('/projects');
  revalidatePath('/my-requests');
  if (projectSlug) revalidatePath(`/projects/${projectSlug}`);
}
