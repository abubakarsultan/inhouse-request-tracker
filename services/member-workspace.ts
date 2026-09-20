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
  approved_site: string;
  anchor: string;
  priority: string;
  deadline: string | null;
  status: 'Request shared' | 'Live';
  sync_state: string | null;
  created_at: string;
  project: { name: string; slug: string } | null;
};

export type LegacySiteRow = {
  id: string;
  website: string;
  anchor: string;
  status: 'Request shared' | 'Live';
  created_at: string;
  project: { name: string; slug: string } | null;
};

export type MemberWorkspace = {
  name: string;
  email: string;
  today: string;
  kpis: { assigned: number; live: number; pending: number; overdue: number; legacy: number };
  upcoming: MemberRequestRow[];
  requests: MemberRequestRow[];
  legacy: LegacySiteRow[];
  breakdown: Array<{ project: string; total: number; live: number; pending: number }>;
};

async function buildWorkspaceForProfile(profile: { id: string; email: string; sheet_name: string | null; google_name: string | null }): Promise<MemberWorkspace> {
  const supabase = await createClient();
  const sheetName = profile.sheet_name || '';

  const [byId, byName, legacyById, legacyByName] = await Promise.all([
    supabase.from('requests').select('id,approved_site,anchor,priority,deadline,status,sync_state,created_at,projects(name,slug)').eq('assigned_user_id', profile.id).order('created_at', { ascending: false }),
    sheetName ? supabase.from('requests').select('id,approved_site,anchor,priority,deadline,status,sync_state,created_at,projects(name,slug)').ilike('assign_to', sheetName).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
    supabase.from('project_sites').select('id,website,anchor,status,created_at,projects(name,slug)').eq('owner_user_id', profile.id).is('request_id', null).order('created_at', { ascending: false }),
    sheetName ? supabase.from('project_sites').select('id,website,anchor,status,created_at,projects(name,slug)').ilike('note', sheetName).is('request_id', null).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
  ]);
  for (const result of [byId, byName, legacyById, legacyByName]) if (result.error) throw new Error(result.error.message);

  const reqMap = new Map<string, any>();
  for (const row of [...(byId.data ?? []), ...(byName.data ?? [])]) reqMap.set(String(row.id), row);
  const requests: MemberRequestRow[] = [...reqMap.values()].map((row: any) => ({
    id: String(row.id), approved_site: String(row.approved_site ?? ''), anchor: String(row.anchor ?? ''), priority: String(row.priority ?? 'Medium'), deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
    status: (row.status === 'Live' ? 'Live' : 'Request shared') as MemberRequestRow['status'], sync_state: row.sync_state ? String(row.sync_state) : null, created_at: String(row.created_at), project: normalizeProject(row.projects),
  })).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const legacyMap = new Map<string, any>();
  for (const row of [...(legacyById.data ?? []), ...(legacyByName.data ?? [])]) legacyMap.set(String(row.id), row);
  const legacy: LegacySiteRow[] = [...legacyMap.values()].map((row: any) => ({
    id: String(row.id), website: String(row.website ?? ''), anchor: String(row.anchor ?? ''), status: (row.status === 'Live' ? 'Live' : 'Request shared') as LegacySiteRow['status'], created_at: String(row.created_at), project: normalizeProject(row.projects),
  })).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const today = karachiDateString();
  const upcomingEnd = karachiDateOffsetString(6);
  const upcoming = requests.filter((row) => row.status !== 'Live' && row.deadline && row.deadline >= today && row.deadline <= upcomingEnd).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  const overdue = requests.filter((row) => row.status !== 'Live' && row.deadline && row.deadline < today).length;
  const allStatuses = [...requests.map((r) => r.status), ...legacy.map((r) => r.status)];

  const breakdownMap = new Map<string, { project: string; total: number; live: number; pending: number }>();
  for (const row of [...requests.map((r) => ({ project: r.project?.name || 'Unknown', status: r.status })), ...legacy.map((r) => ({ project: r.project?.name || 'Unknown', status: r.status }))]) {
    const item = breakdownMap.get(row.project) ?? { project: row.project, total: 0, live: 0, pending: 0 };
    item.total += 1;
    row.status === 'Live' ? item.live += 1 : item.pending += 1;
    breakdownMap.set(row.project, item);
  }

  return {
    name: profile.sheet_name || profile.google_name || profile.email,
    email: profile.email,
    today,
    kpis: { assigned: requests.length + legacy.length, live: allStatuses.filter((s) => s === 'Live').length, pending: allStatuses.filter((s) => s !== 'Live').length, overdue, legacy: legacy.length },
    upcoming,
    requests,
    legacy,
    breakdown: [...breakdownMap.values()].sort((a, b) => b.total - a.total || a.project.localeCompare(b.project)),
  };
}


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
