'use server';

import { createClient } from '@/lib/supabase-server';
import { requestSchema, isRequestStatus, looksLikeHttpUrl, type RequestInput } from '@/lib/validators';
import { karachiDateString, karachiDateOffsetString, karachiMonthBounds } from '@/lib/date';
import { appendRequestToTeamSheet, syncRequestStatusToTeamSheet, syncRequestFullRowToTeamSheet, clearRequestFromTeamSheet, type RequestSheetRecord } from '@/services/google-sheet-sync';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { setRequestStatusCore, type SetStatusResult } from '@/services/request-status-core';

export type ProjectDomainUsage = { requestId: string | null; projectSiteId: string | null; approvedSite: string; anchor: string; status: string; assignTo: string | null; createdAt: string; source: string };
type CreateSyncState = 'synced' | 'skipped' | 'failed';

export type CreateRequestResult =
  | {
      saved: true;
      sync: { state: CreateSyncState; text: string };
      summary: {
        requestId: string;
        client: string;
        site: string;
        anchor: string;
        requestStatus: 'Request shared' | 'Live' | 'Rejected';
        targetUrlWarning: string | null;
      };
    };

function cleanOptional(value: string | null | undefined) {
  const clean = String(value ?? '').trim();
  return clean || null;
}

export async function getProjectDomainUsage(projectId: string, approvedSite: string, excludeRequestId?: string | null): Promise<ProjectDomainUsage[]> {
  await requireActiveUserForAction();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('find_project_domain_usage', {
    p_project_id: projectId,
    p_approved_site: approvedSite,
    p_exclude_request_id: excludeRequestId ?? null,
  });
  if (error) throw new Error(`Project domain check failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    requestId: row.request_id ? String(row.request_id) : null,
    projectSiteId: row.project_site_id ? String(row.project_site_id) : null,
    approvedSite: String(row.approved_site ?? ''),
    anchor: String(row.anchor ?? ''),
    status: String(row.status ?? 'Request shared'),
    assignTo: row.assign_to ? String(row.assign_to) : null,
    createdAt: String(row.created_at ?? ''),
    source: String(row.source ?? ''),
  }));
}

async function assertProjectDomainAvailable(projectId: string, approvedSite: string, excludeRequestId?: string | null) {
  const usage = await getProjectDomainUsage(projectId, approvedSite, excludeRequestId);
  if (usage.length) {
    const first = usage[0];
    throw new Error(`This website is already used in this project${first.assignTo ? ` by ${first.assignTo}` : ''} (${first.status}). Each project can use a website only once.`);
  }
}

export async function getRequests(filters?: { status?: string; project_id?: string }) {
  await requireAdminForAction();
  const supabase = await createClient();
  let query = supabase
    .from('requests')
    .select('*, projects(id,name,slug,sync_enabled,guest_post_tab_name,outreach_project_name)')
    .is('deleted_at', null)
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
  const [{ data: rows, error }, { data: teamNames, error: teamNamesError }] = await Promise.all([
    supabase.from('requests').select('shared_with').is('deleted_at', null).limit(5000),
    supabase.from('team_names').select('name').eq('active', true).order('name'),
  ]);
  if (error) throw error;
  if (teamNamesError) throw teamNamesError;
  const shared = new Map<string, string>();
  for (const row of rows ?? []) {
    const value = String(row.shared_with ?? '').trim();
    if (value && !shared.has(value.toLowerCase())) shared.set(value.toLowerCase(), value);
  }
  return {
    assignTo: (teamNames ?? []).map((row: any) => String(row.name)).filter(Boolean),
    sharedWith: [...shared.values()].sort((a, b) => a.localeCompare(b)),
  };
}

async function resolveAssignee(profile: Awaited<ReturnType<typeof requireActiveUserForAction>>, requested: string | null) {
  const supabase = await createClient();
  const assignTo = profile.role === 'member' ? profile.sheet_name : (cleanOptional(requested) || profile.sheet_name);
  if (!assignTo) return { assignTo: null, assignedUserId: null };
  const { data: allowedName, error: nameError } = await supabase.from('team_names').select('name').eq('active', true).ilike('name', assignTo).maybeSingle();
  if (nameError) throw new Error(nameError.message);
  if (!allowedName) throw new Error('Assign To must be one of the seven approved Guest Post Anchor team names.');
  const canonical = String(allowedName.name);
  const { data: assigned, error: userError } = await supabase.from('users').select('id').ilike('sheet_name', canonical).eq('account_status', 'active').maybeSingle();
  if (userError) throw new Error(userError.message);
  return { assignTo: canonical, assignedUserId: assigned?.id ? String(assigned.id) : null };
}

export async function createRequest(input: RequestInput): Promise<CreateRequestResult> {
  const profile = await requireActiveUserForAction();
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();

  if (!parsed.target_url.trim()) throw new Error('Target URL is required.');

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id,name,slug,outreach_project_name,guest_post_tab_name,sync_enabled,active')
    .eq('id', parsed.project_id)
    .single();
  if (projectError || !project) throw new Error(projectError?.message ?? 'Project not found');
  if (project.active === false) throw new Error('This project is disabled.');
  await assertProjectDomainAvailable(parsed.project_id, parsed.approved_site);

  const { assignTo, assignedUserId } = await resolveAssignee(profile, parsed.assign_to ?? null);

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
    source: 'app',
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
      source: 'app',
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
    requestStatus: request.status as 'Request shared' | 'Live' | 'Rejected',
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
    .is('deleted_at', null)
    .single();
  if (error || !request) throw new Error(error?.message ?? 'Request not found');
  if (profile.role !== 'admin') {
    const assignedByText = profile.sheet_name && String(request.assign_to ?? '').trim().toLowerCase() === profile.sheet_name.trim().toLowerCase();
    if (String(request.assigned_user_id ?? '') !== profile.id && !assignedByText) throw new Error('You can only retry sync for requests assigned to you.');
  }

  const { data: site } = await supabase.from('project_sites').select('id').eq('request_id', requestId).is('archived_at', null).maybeSingle();
  const project = Array.isArray(request.projects) ? request.projects[0] : request.projects;
  const currentRecord: RequestSheetRecord = {
    id: String(request.id), project_id: String(request.project_id), approved_site: String(request.approved_site),
    placement_page: request.placement_page ? String(request.placement_page) : null,
    anchor: String(request.anchor ?? ''), assign_to: request.assign_to ? String(request.assign_to) : null,
    status: String(request.status), team_tab: request.team_tab ? String(request.team_tab) : null,
    team_row: request.team_row == null ? null : Number(request.team_row),
    created_by_email: request.created_by_email ? String(request.created_by_email) : null,
  };

  let sync = request.team_row
    ? await syncRequestStatusToTeamSheet(project as any, currentRecord, site?.id ?? null)
    : await appendRequestToTeamSheet(project as any, currentRecord, site?.id ?? null);

  // If an edit changed website/anchor but the full-row Sheet update failed, a
  // status-only retry cannot verify the old Sheet identity. Recover the last
  // pre-edit identity from the audit log and retry the full A:H row update.
  if (request.team_row && sync.state === 'failed') {
    const { data: editLog } = await supabase
      .from('request_change_logs')
      .select('before_data')
      .eq('request_id', requestId)
      .eq('action', 'edit')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const before = editLog?.before_data as Record<string, unknown> | null | undefined;
    if (before?.approved_site && before?.anchor) {
      const originalRecord: RequestSheetRecord = {
        ...currentRecord,
        approved_site: String(before.approved_site),
        anchor: String(before.anchor),
        placement_page: before.placement_page == null ? null : String(before.placement_page),
        assign_to: before.assign_to == null ? null : String(before.assign_to),
        status: before.status == null ? currentRecord.status : String(before.status),
      };
      sync = await syncRequestFullRowToTeamSheet(project as any, originalRecord, currentRecord, site?.id ?? null);
    }
  }

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
      .select('assigned_user_id,assign_to')
      .eq('id', requestId)
      .is('deleted_at', null)
      .single();
    if (error || !request) throw new Error(error?.message ?? 'Request not found');
    const assignedByText = profile.sheet_name && String(request.assign_to ?? '').trim().toLowerCase() === profile.sheet_name.trim().toLowerCase();
    const allowed = String(request.assigned_user_id ?? '') === profile.id || assignedByText;
    if (!allowed) throw new Error('You can only change status for requests assigned to you.');
  }
  const changedBy = `${profile.sheet_name || profile.google_name || 'Rankviz user'} <${profile.email}>`;
  return setRequestStatusCore(requestId, newStatus, changedBy);
}


function requestOwnedByProfile(profile: Awaited<ReturnType<typeof requireActiveUserForAction>>, request: any) {
  if (profile.role === 'admin') return true;
  const byId = String(request.assigned_user_id ?? '') === profile.id;
  const byName = Boolean(profile.sheet_name) && String(request.assign_to ?? '').trim().toLowerCase() === String(profile.sheet_name).trim().toLowerCase();
  return byId || byName;
}

export async function getRequestForEdit(requestId: string) {
  const profile = await requireActiveUserForAction();
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from('requests')
    .select('*, projects(id,name,slug,guest_post_tab_name,sync_enabled,active)')
    .eq('id', requestId)
    .is('deleted_at', null)
    .single();
  if (error || !request) throw new Error(error?.message ?? 'Request not found.');
  if (!requestOwnedByProfile(profile, request)) throw new Error('You can only edit requests assigned to you.');
  return request;
}

export async function updateRequest(requestId: string, input: RequestInput) {
  const profile = await requireActiveUserForAction();
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from('requests')
    .select('*, projects(id,name,slug,guest_post_tab_name,sync_enabled,active)')
    .eq('id', requestId)
    .is('deleted_at', null)
    .single();
  if (error || !current) throw new Error(error?.message ?? 'Request not found.');
  if (!requestOwnedByProfile(profile, current)) throw new Error('You can only edit requests assigned to you.');
  if (String(parsed.project_id) !== String(current.project_id)) throw new Error('Project cannot be changed after a request is created. Archive it and create a new request under the correct project.');

  await assertProjectDomainAvailable(current.project_id, parsed.approved_site, requestId);
  const { assignTo, assignedUserId } = await resolveAssignee(profile, parsed.assign_to ?? null);
  const changedBy = `${profile.sheet_name || profile.google_name || 'Rankviz user'} <${profile.email}>`;
  const project = Array.isArray(current.projects) ? current.projects[0] : current.projects;
  const { data: site, error: siteError } = await supabase.from('project_sites').select('*').eq('request_id', requestId).maybeSingle();
  if (siteError) throw new Error(siteError.message);

  const originalSheetRecord: RequestSheetRecord = {
    id: String(current.id), project_id: String(current.project_id), approved_site: String(current.approved_site),
    placement_page: current.placement_page ? String(current.placement_page) : null, anchor: String(current.anchor),
    assign_to: current.assign_to ? String(current.assign_to) : null, status: String(current.status),
    team_tab: current.team_tab ? String(current.team_tab) : null, team_row: current.team_row ? Number(current.team_row) : null,
    created_by_email: current.created_by_email ? String(current.created_by_email) : null,
  };

  const beforeData = {
    sub_project: current.sub_project, target_url: current.target_url, anchor: current.anchor, approved_site: current.approved_site,
    placement_page: current.placement_page, shared_with: current.shared_with, priority: current.priority, assign_to: current.assign_to,
    deadline: current.deadline, status: current.status,
  };

  const { error: updateError } = await supabase.from('requests').update({
    sub_project: cleanOptional(parsed.sub_project),
    target_url: parsed.target_url.trim(),
    anchor: parsed.anchor.trim(),
    approved_site: parsed.approved_site.trim(),
    placement_page: cleanOptional(parsed.placement_page),
    shared_with: cleanOptional(parsed.shared_with),
    priority: parsed.priority,
    assign_to: assignTo,
    assigned_user_id: assignedUserId,
    deadline: cleanOptional(parsed.deadline),
  }).eq('id', requestId);
  if (updateError) throw new Error(updateError.message);

  if (site?.id) {
    const { error: psError } = await supabase.from('project_sites').update({
      website: parsed.approved_site.trim(),
      opportunity: cleanOptional(parsed.placement_page),
      anchor: parsed.anchor.trim(),
      note: assignTo,
      owner_user_id: assignedUserId,
    }).eq('id', site.id);
    if (psError) throw new Error(`Request saved, but linked project row failed: ${psError.message}`);
  }

  if (String(current.status) !== parsed.status) {
    await setRequestStatusCore(requestId, parsed.status, changedBy, { pushToSheet: false, sheetRow: current.team_row ? Number(current.team_row) : undefined });
  }

  const updatedSheetRecord: RequestSheetRecord = {
    id: String(current.id), project_id: String(current.project_id), approved_site: parsed.approved_site.trim(),
    placement_page: cleanOptional(parsed.placement_page), anchor: parsed.anchor.trim(), assign_to: assignTo,
    status: parsed.status, team_tab: current.team_tab ? String(current.team_tab) : null,
    team_row: current.team_row ? Number(current.team_row) : null,
    created_by_email: current.created_by_email ? String(current.created_by_email) : profile.email,
  };
  const sync = current.team_row
    ? await syncRequestFullRowToTeamSheet(project as any, originalSheetRecord, updatedSheetRecord, site?.id ?? null)
    : await appendRequestToTeamSheet(project as any, updatedSheetRecord, site?.id ?? null);

  const syncUpdate: Record<string, unknown> = { sync_state: sync.state, sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null };
  if (sync.tab) syncUpdate.team_tab = sync.tab;
  if (sync.row) syncUpdate.team_row = sync.row;
  await supabase.from('requests').update(syncUpdate).eq('id', requestId);
  if (site?.id && sync.row) await supabase.from('project_sites').update({ team_row: sync.row }).eq('id', site.id);

  await supabase.from('request_change_logs').insert({
    request_id: requestId,
    action: 'edit',
    changed_by: changedBy,
    before_data: beforeData,
    after_data: { ...beforeData, sub_project: cleanOptional(parsed.sub_project), target_url: parsed.target_url.trim(), anchor: parsed.anchor.trim(), approved_site: parsed.approved_site.trim(), placement_page: cleanOptional(parsed.placement_page), shared_with: cleanOptional(parsed.shared_with), priority: parsed.priority, assign_to: assignTo, deadline: cleanOptional(parsed.deadline), status: parsed.status },
  });

  revalidatePhase1Paths(project?.slug);
  revalidatePath(`/requests/${requestId}/edit`);
  return { ok: sync.state !== 'failed', sync };
}

export async function archiveRequest(requestId: string) {
  const profile = await requireActiveUserForAction();
  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from('requests')
    .select('*, projects(id,name,slug,guest_post_tab_name,sync_enabled)')
    .eq('id', requestId)
    .is('deleted_at', null)
    .single();
  if (error || !current) throw new Error(error?.message ?? 'Request not found.');
  if (!requestOwnedByProfile(profile, current)) throw new Error('You can only delete requests assigned to you.');
  const project = Array.isArray(current.projects) ? current.projects[0] : current.projects;
  const { data: site } = await supabase.from('project_sites').select('id').eq('request_id', requestId).maybeSingle();
  const changedBy = `${profile.sheet_name || profile.google_name || 'Rankviz user'} <${profile.email}>`;
  const deletedAt = new Date().toISOString();

  const { error: archiveError } = await supabase.from('requests').update({ deleted_at: deletedAt, deleted_by: profile.id, deleted_by_email: profile.email }).eq('id', requestId);
  if (archiveError) throw new Error(archiveError.message);
  if (site?.id) await supabase.from('project_sites').update({ archived_at: deletedAt }).eq('id', site.id);
  await supabase.from('request_change_logs').insert({ request_id: requestId, action: 'archive', changed_by: changedBy, before_data: { status: current.status, approved_site: current.approved_site, anchor: current.anchor }, after_data: { deleted_at: deletedAt } });

  const record: RequestSheetRecord = {
    id: String(current.id), project_id: String(current.project_id), approved_site: String(current.approved_site),
    placement_page: current.placement_page ? String(current.placement_page) : null, anchor: String(current.anchor),
    assign_to: current.assign_to ? String(current.assign_to) : null, status: String(current.status),
    team_tab: current.team_tab ? String(current.team_tab) : null, team_row: current.team_row ? Number(current.team_row) : null,
    created_by_email: current.created_by_email ? String(current.created_by_email) : null,
  };
  const sync = current.team_row ? await clearRequestFromTeamSheet(project as any, record, site?.id ?? null) : { state: 'skipped' as const, text: 'Archived in app; no team-sheet row was linked.' };
  await supabase.from('requests').update({ sync_state: sync.state, sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null }).eq('id', requestId);
  revalidatePhase1Paths(project?.slug);
  return { ok: sync.state !== 'failed', sync };
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
  rejected: number;
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
    const { data, error } = await supabase.from('requests').select('project_id,status').is('deleted_at', null).range(from, from + 999);
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
    { count: rejected },
    { count: failedSync },
    { count: thisMonth },
    recentResult,
    becameLiveResult,
    failedResult,
    projectsResult,
    requestStatuses,
    refreshResult,
  ] = await Promise.all([
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'Live'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'Request shared'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'Rejected'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('sync_state', 'failed'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', month.start).lt('created_at', month.end),
    supabase.from('requests').select('id,created_at,approved_site,assign_to,status,live_date,sync_state,sync_error,projects(name,slug)').is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
    supabase.from('requests').select('id,created_at,approved_site,assign_to,status,live_date,sync_state,sync_error,projects(name,slug)').is('deleted_at', null).gte('live_date', liveSince).order('live_date', { ascending: false }).limit(50),
    supabase.from('requests').select('id,approved_site,anchor,sync_error,updated_at,projects(name,slug)').is('deleted_at', null).eq('sync_state', 'failed').order('updated_at', { ascending: false }).limit(50),
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

  const counts = new Map<string, { total: number; live: number; pending: number; rejected: number }>();
  for (const row of requestStatuses) {
    const item = counts.get(row.project_id) ?? { total: 0, live: 0, pending: 0, rejected: 0 };
    item.total += 1;
    if (row.status === 'Live') item.live += 1;
    if (row.status === 'Request shared') item.pending += 1;
    if (row.status === 'Rejected') item.rejected += 1;
    counts.set(row.project_id, item);
  }

  const breakdown: ProjectBreakdownRow[] = (projectsResult.data ?? []).map((project: any) => {
    const item = counts.get(String(project.id)) ?? { total: 0, live: 0, pending: 0, rejected: 0 };
    return { id: String(project.id), name: String(project.name), slug: String(project.slug), ...item };
  });

  return {
    stats: {
      total: total ?? 0,
      live: live ?? 0,
      pending: pending ?? 0,
      rejected: rejected ?? 0,
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
  kpis: { assigned: number; live: number; pending: number; rejected: number; overdue: number };
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
    return { name: '', today, kpis: { assigned: 0, live: 0, pending: 0, rejected: 0, overdue: 0 }, upcoming: [], requests: [] };
  }

  const supabase = await createClient();
  const rows: any[] = [];
  const pattern = escapeLikePattern(clean);
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('requests')
      .select('id,project_id,sub_project,approved_site,anchor,priority,assign_to,deadline,status,sync_state,sync_error,created_at,projects(name,slug)')
      .ilike('assign_to', pattern)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const live = rows.filter((row) => row.status === 'Live').length;
  const pending = rows.filter((row) => row.status === 'Request shared').length;
  const rejected = rows.filter((row) => row.status === 'Rejected').length;
  const overdue = rows.filter((row) => row.status === 'Request shared' && row.deadline && String(row.deadline).slice(0, 10) < today).length;
  const upcomingEnd = karachiDateOffsetString(6);
  const upcoming = rows
    .filter((row) => row.status === 'Request shared' && row.deadline && String(row.deadline).slice(0, 10) >= today && String(row.deadline).slice(0, 10) <= upcomingEnd)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

  return {
    name: clean,
    today,
    kpis: { assigned: rows.length, live, pending, rejected, overdue },
    upcoming,
    requests: rows,
  };
}

export async function getDashboardStats() {
  await requireAdminForAction();
  const supabase = await createClient();
  const month = karachiMonthBounds();
  const [{ count: total }, { count: live }, { count: pending }, { count: rejected }, { count: failedSync }, { count: thisMonth }] = await Promise.all([
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'Live'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'Request shared'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'Rejected'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('sync_state', 'failed'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', month.start).lt('created_at', month.end),
  ]);
  return {
    total: total ?? 0,
    live: live ?? 0,
    pending: pending ?? 0,
    rejected: rejected ?? 0,
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
