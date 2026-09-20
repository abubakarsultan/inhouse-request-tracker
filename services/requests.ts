'use server';

import { createClient } from '@/lib/supabase-server';
import { requestSchema, isRequestStatus, looksLikeHttpUrl, type RequestInput } from '@/lib/validators';
import { karachiDateString, karachiDateOffsetString, karachiMonthBounds } from '@/lib/date';
import { appendRequestToTeamSheet, syncRequestStatusToTeamSheet, type RequestSheetRecord } from '@/services/google-sheet-sync';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { setRequestStatusCore, type SetStatusResult } from '@/services/request-status-core';

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
  await requireAdminForAction();
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
  await requireActiveUserForAction();
  const supabase = await createClient();
  const [{ data, error }, { data: teamNames, error: teamNamesError }] = await Promise.all([
    supabase.from('requests').select('assign_to,shared_with').limit(5000),
    supabase.from('team_names').select('name').eq('active', true).order('name'),
  ]);
  if (error) throw error;
  if (teamNamesError) throw teamNamesError;

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

  const assignTo = new Map<string, string>();
  for (const value of distinct('assign_to')) assignTo.set(value.toLowerCase(), value);
  for (const row of teamNames ?? []) { const value = String(row.name ?? '').trim(); if (value) assignTo.set(value.toLowerCase(), value); }
  return { assignTo: [...assignTo.values()].sort((a, b) => a.localeCompare(b)), sharedWith: distinct('shared_with') };
}

export async function createRequest(input: RequestInput, forceDuplicate = false): Promise<CreateRequestResult> {
  const profile = await requireActiveUserForAction();
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

  const assignTo = profile.role === 'member' ? profile.sheet_name : (cleanOptional(parsed.assign_to) || profile.sheet_name);
  let assignedUserId: string | null = profile.role === 'member' ? profile.id : null;
  if (profile.role === 'admin' && assignTo) {
    const { data: assigned } = await supabase.from('users').select('id').ilike('sheet_name', assignTo).eq('account_status', 'active').maybeSingle();
    assignedUserId = assigned?.id ? String(assigned.id) : null;
  }

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
    assign_to: assignTo,
    deadline: cleanOptional(parsed.deadline),
    status,
    initial_status: status,
    live_date: liveDate,
    sync_state: 'skipped',
    sync_error: null,
    created_by_name: profile.sheet_name || profile.google_name || profile.email,
    assigned_user_id: assignedUserId,
    created_by_user_id: profile.id,
    created_by_email: profile.email,
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
      owner_user_id: assignedUserId,
      created_by_user_id: profile.id,
      created_by_email: profile.email,
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
    created_by_email: profile.email,
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
  const profile = await requireActiveUserForAction();
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from('requests')
    .select('*, projects(id,name,slug,guest_post_tab_name,sync_enabled)')
    .eq('id', requestId)
    .single();
  if (error || !request) throw new Error(error?.message ?? 'Request not found');
  if (profile.role !== 'admin') {
    const assignedByText = profile.sheet_name && String(request.assign_to ?? '').trim().toLowerCase() === profile.sheet_name.trim().toLowerCase();
    if (String(request.assigned_user_id ?? '') !== profile.id && String(request.created_by_user_id ?? '') !== profile.id && !assignedByText) throw new Error('You can only retry sync for your own request.');
  }

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

export async function setRequestStatus(requestId: string, newStatus: string): Promise<SetStatusResult> {
  const profile = await requireActiveUserForAction();
  const supabase = await createClient();
  if (profile.role !== 'admin') {
    const { data: request, error } = await supabase
      .from('requests')
      .select('assigned_user_id,assign_to,created_by_user_id')
      .eq('id', requestId)
      .single();
    if (error || !request) throw new Error(error?.message ?? 'Request not found');
    const assignedByText = profile.sheet_name && String(request.assign_to ?? '').trim().toLowerCase() === profile.sheet_name.trim().toLowerCase();
    const allowed = String(request.assigned_user_id ?? '') === profile.id || String(request.created_by_user_id ?? '') === profile.id || assignedByText;
    if (!allowed) throw new Error('You can only change status for requests assigned to you.');
  }
  const changedBy = `${profile.sheet_name || profile.google_name || 'Rankviz user'} <${profile.email}>`;
  return setRequestStatusCore(requestId, newStatus, changedBy);
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

function normalizeProjectSummary(value: unknown): { name: string; slug: string } | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') return null;

  const record = candidate as Record<string, unknown>;
  if (record.name == null || record.slug == null) return null;

  return {
    name: String(record.name),
    slug: String(record.slug),
  };
}

function normalizeDashboardActivityRows(rows: Array<{
  id: unknown;
  created_at: unknown;
  approved_site: unknown;
  assign_to: unknown;
  status: unknown;
  live_date: unknown;
  sync_state: unknown;
  sync_error: unknown;
  projects: unknown;
}> | null | undefined): DashboardActivityRow[] {
  return (rows ?? []).map((row) => ({
    id: String(row.id),
    created_at: String(row.created_at),
    approved_site: String(row.approved_site),
    assign_to: row.assign_to == null ? null : String(row.assign_to),
    status: String(row.status),
    live_date: row.live_date == null ? null : String(row.live_date),
    sync_state: String(row.sync_state),
    sync_error: row.sync_error == null ? null : String(row.sync_error),
    projects: normalizeProjectSummary(row.projects),
  }));
}

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
  await requireAdminForAction();
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
    recent: normalizeDashboardActivityRows(recentResult.data),
    becameLive: normalizeDashboardActivityRows(becameLiveResult.data),
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

export async function getMyRequests(name: string = ''): Promise<MyRequestsResult> {
  const profile = await requireActiveUserForAction();
  const clean = (profile.role === 'admin' ? (name.trim() || profile.sheet_name || '') : (profile.sheet_name || '')).trim();
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
  await requireAdminForAction();
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
