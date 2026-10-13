'use server';

import { createClient } from '@/lib/supabase-server';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { karachiDateOffsetString, karachiDateString } from '@/lib/date';

function normalizeProject(value: any) {
  const project = Array.isArray(value) ? value[0] : value;
  return project ? { name: String(project.name), slug: String(project.slug) } : null;
}

export type MemberRequestRow = {
  id: string;
  project_id?: string;
  approved_site: string;
  anchor: string;
  target_url: string;
  placement_page?: string | null;
  source: string;
  priority: string;
  deadline: string | null;
  status: 'Request shared' | 'Live' | 'Rejected';
  sync_state: string | null;
  sync_error?: string | null;
  created_at: string;
  project: { name: string; slug: string } | null;
};

export type MemberWorkspace = {
  name: string;
  email: string;
  today: string;
  kpis: { assigned: number; live: number; pending: number; rejected: number; overdue: number };
  upcoming: MemberRequestRow[];
  requests: MemberRequestRow[];
  breakdown: Array<{ project: string; total: number; live: number; pending: number; rejected: number }>;
};

export type MyRequestsFilters = {
  q?: string;
  project?: string;
  status?: string;
  priority?: string;
  deadline?: string;
  source?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type MyRequestsPage = {
  rows: MemberRequestRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function normalizeStatus(value: unknown): MemberRequestRow['status'] {
  return value === 'Live' ? 'Live' : value === 'Rejected' ? 'Rejected' : 'Request shared';
}

function mapFlatRow(row: any): MemberRequestRow {
  return {
    id: String(row.id),
    project_id: row.project_id ? String(row.project_id) : undefined,
    approved_site: String(row.approved_site ?? ''),
    anchor: String(row.anchor ?? ''),
    target_url: String(row.target_url ?? ''),
    placement_page: row.placement_page == null ? null : String(row.placement_page),
    source: String(row.source ?? 'app'),
    priority: String(row.priority ?? 'Medium'),
    deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
    status: normalizeStatus(row.status),
    sync_state: row.sync_state ? String(row.sync_state) : null,
    sync_error: row.sync_error ? String(row.sync_error) : null,
    created_at: String(row.created_at),
    project: row.project_name
      ? { name: String(row.project_name), slug: String(row.project_slug ?? '') }
      : normalizeProject(row.projects),
  };
}

/** Lightweight member dashboard: one RPC, no full-history load. */
export async function getMemberDashboardWorkspace(): Promise<MemberWorkspace> {
  const profile = await requireActiveUserForAction();
  const supabase = await createClient();
  const today = karachiDateString();
  const upcomingEnd = karachiDateOffsetString(6);
  const { data, error } = await supabase.rpc('get_member_dashboard', {
    p_user_id: profile.id,
    p_sheet_name: profile.sheet_name ?? '',
    p_today: today,
    p_upcoming_end: upcomingEnd,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as any;
  const kpis = payload.kpis ?? {};
  return {
    name: profile.sheet_name || profile.google_name || profile.email,
    email: profile.email,
    today,
    kpis: {
      assigned: Number(kpis.assigned ?? 0),
      live: Number(kpis.live ?? 0),
      pending: Number(kpis.pending ?? 0),
      rejected: Number(kpis.rejected ?? 0),
      overdue: Number(kpis.overdue ?? 0),
    },
    upcoming: Array.isArray(payload.upcoming) ? payload.upcoming.map(mapFlatRow) : [],
    requests: Array.isArray(payload.recent) ? payload.recent.map(mapFlatRow) : [],
    breakdown: Array.isArray(payload.breakdown)
      ? payload.breakdown.map((row: any) => ({
          project: String(row.project ?? 'Unknown'),
          total: Number(row.total ?? 0),
          live: Number(row.live ?? 0),
          pending: Number(row.pending ?? 0),
          rejected: Number(row.rejected ?? 0),
        }))
      : [],
  };
}

/** Server-side filtered + paginated My Requests list. */
export async function getMyRequestsPage(filters: MyRequestsFilters): Promise<MyRequestsPage> {
  const profile = await requireActiveUserForAction();
  const supabase = await createClient();
  const pageSize = Math.max(1, Math.min(Number(filters.pageSize ?? 25) || 25, 100));
  const requestedPage = Math.max(1, Number(filters.page ?? 1) || 1);
  const offset = (requestedPage - 1) * pageSize;
  const projectId = filters.project && /^[0-9a-f-]{36}$/i.test(filters.project) ? filters.project : null;
  const status = ['Request shared', 'Live', 'Rejected'].includes(String(filters.status ?? '')) ? String(filters.status) : null;
  const priority = ['High', 'Medium', 'Low'].includes(String(filters.priority ?? '')) ? String(filters.priority) : null;
  const deadline = ['overdue', 'today', 'next7', 'none'].includes(String(filters.deadline ?? '')) ? String(filters.deadline) : null;
  const source = ['app', 'imported'].includes(String(filters.source ?? '')) ? String(filters.source) : null;
  const sort = ['newest', 'oldest', 'deadline', 'website', 'project'].includes(String(filters.sort ?? '')) ? String(filters.sort) : 'newest';

  const { data, error } = await supabase.rpc('get_member_requests_page', {
    p_user_id: profile.id,
    p_sheet_name: profile.sheet_name ?? '',
    p_query: String(filters.q ?? '').trim() || null,
    p_project_id: projectId,
    p_status: status,
    p_priority: priority,
    p_deadline_filter: deadline,
    p_source: source,
    p_sort: sort,
    p_limit: pageSize,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map(mapFlatRow);
  const total = Number((data?.[0] as any)?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, page: Math.min(requestedPage, totalPages), pageSize, totalPages };
}

async function buildWorkspaceForProfile(profile: { id: string; email: string; sheet_name: string | null; google_name: string | null }): Promise<MemberWorkspace> {
  const supabase = await createClient();
  const sheetName = profile.sheet_name || '';

  const [byId, byName] = await Promise.all([
    supabase.from('requests').select('id,approved_site,anchor,target_url,source,priority,deadline,status,sync_state,created_at,projects(name,slug)').eq('assigned_user_id', profile.id).is('deleted_at', null).order('created_at', { ascending: false }),
    sheetName ? supabase.from('requests').select('id,approved_site,anchor,target_url,source,priority,deadline,status,sync_state,created_at,projects(name,slug)').ilike('assign_to', sheetName).is('deleted_at', null).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
  ]);
  for (const result of [byId, byName]) if (result.error) throw new Error(result.error.message);

  const reqMap = new Map<string, any>();
  for (const row of [...(byId.data ?? []), ...(byName.data ?? [])]) reqMap.set(String(row.id), row);
  const requests: MemberRequestRow[] = [...reqMap.values()].map((row: any) => ({
    id: String(row.id),
    approved_site: String(row.approved_site ?? ''),
    anchor: String(row.anchor ?? ''),
    target_url: String(row.target_url ?? ''),
    source: String(row.source ?? 'app'),
    priority: String(row.priority ?? 'Medium'),
    deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
    status: normalizeStatus(row.status),
    sync_state: row.sync_state ? String(row.sync_state) : null,
    created_at: String(row.created_at),
    project: normalizeProject(row.projects),
  })).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const today = karachiDateString();
  const upcomingEnd = karachiDateOffsetString(6);
  const upcoming = requests.filter((row) => row.status === 'Request shared' && row.deadline && row.deadline >= today && row.deadline <= upcomingEnd).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  const overdue = requests.filter((row) => row.status === 'Request shared' && row.deadline && row.deadline < today).length;

  const breakdownMap = new Map<string, { project: string; total: number; live: number; pending: number; rejected: number }>();
  for (const row of requests) {
    const project = row.project?.name || 'Unknown';
    const item = breakdownMap.get(project) ?? { project, total: 0, live: 0, pending: 0, rejected: 0 };
    item.total += 1;
    if (row.status === 'Live') item.live += 1;
    if (row.status === 'Request shared') item.pending += 1;
    if (row.status === 'Rejected') item.rejected += 1;
    breakdownMap.set(project, item);
  }

  return {
    name: profile.sheet_name || profile.google_name || profile.email,
    email: profile.email,
    today,
    kpis: {
      assigned: requests.length,
      live: requests.filter((row) => row.status === 'Live').length,
      pending: requests.filter((row) => row.status === 'Request shared').length,
      rejected: requests.filter((row) => row.status === 'Rejected').length,
      overdue,
    },
    upcoming,
    requests,
    breakdown: [...breakdownMap.values()].sort((a, b) => b.total - a.total || a.project.localeCompare(b.project)),
  };
}

/** Full history remains available for the admin View-as-user diagnostic page. */
export async function getMemberWorkspace(): Promise<MemberWorkspace> {
  const profile = await requireActiveUserForAction();
  return buildWorkspaceForProfile(profile);
}

export async function getAdminUserWorkspace(userId: string): Promise<MemberWorkspace> {
  await requireAdminForAction();
  const supabase = await createClient();
  const { data: user, error } = await supabase.from('users').select('id,email,sheet_name,google_name').eq('id', userId).single();
  if (error || !user) throw new Error(error?.message ?? 'User not found');
  return buildWorkspaceForProfile({ id: String(user.id), email: String(user.email), sheet_name: user.sheet_name ? String(user.sheet_name) : null, google_name: user.google_name ? String(user.google_name) : null });
}
