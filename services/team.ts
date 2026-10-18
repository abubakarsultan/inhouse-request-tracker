'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase-admin';
import { requireAdminForAction, type UserProfile } from '@/lib/auth';
import { syncRequestFullRowToTeamSheet, type RequestSheetRecord } from '@/services/google-sheet-sync';


export async function createUserInvitation(emailInput: string, displayNameInput: string, role: 'admin' | 'member') {
  const admin = await requireAdminForAction();
  const email = String(emailInput ?? '').trim().toLowerCase();
  const displayName = String(displayNameInput ?? '').trim() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const { data: existing } = await adminClient.from('users').select('id,account_status').eq('email', email).maybeSingle();
  if (existing?.account_status === 'active') throw new Error('This email already has an active account.');
  const { error: revokeError } = await adminClient.from('user_invitations').update({ status: 'revoked' }).eq('email', email).eq('status', 'pending');
  if (revokeError) throw new Error(revokeError.message);
  const { error } = await adminClient.from('user_invitations').insert({ email, display_name: displayName, role, status: 'pending', invited_by: admin.id });
  if (error) throw new Error(error.message);
  revalidatePath('/team');
}

export async function getRecentUserAudits() {
  await requireAdminForAction();
  const { data, error } = await adminClient.from('user_role_name_audit').select('id,email,field_name,old_value,new_value,created_at').order('created_at',{ascending:false}).limit(50);
  if (error) throw new Error(error.message);
  return data || [];
}
export async function getTeamDirectory() {
  await requireAdminForAction();
  const { data, error } = await adminClient.from('team_directory').select('email,sheet_name,role,active,created_at,updated_at').order('email');
  if (error) throw new Error(error.message);
  return data || [];
}
export async function saveTeamDirectoryEntry(raw: { email: string; sheetName: string; role: 'member'|'admin'; active: boolean }) {
  const admin = await requireAdminForAction();
  const email = String(raw.email || '').trim().toLowerCase(); const sheetName = String(raw.sheetName || '').trim();
  if (!/^[^\s@]+@rankviz\.com$/.test(email)) throw new Error('Directory email must be a valid @rankviz.com address.');
  if (sheetName.length < 2 || sheetName.length > 100) throw new Error('Sheet name must contain 2–100 characters.');
  if (raw.role !== 'member' && raw.role !== 'admin') throw new Error('Invalid directory role.');
  const { data: previous } = await adminClient.from('team_directory').select('sheet_name,role,active').eq('email', email).maybeSingle();
  const { data: claimed } = await adminClient.from('team_directory').select('email').ilike('sheet_name', sheetName).neq('email', email).eq('active', true).maybeSingle();
  if (claimed && raw.active) throw new Error('That sheet name is already assigned to another active directory entry.');
  const { data: existingUser } = await adminClient.from('users').select('id,role,account_status').eq('email',email).maybeSingle();
  if (!raw.active && existingUser?.account_status === 'active' && existingUser.role === 'admin') {
    const { count, error: countError } = await adminClient.from('users').select('id',{count:'exact',head:true}).eq('role','admin').eq('account_status','active');
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) throw new Error('Cannot deactivate the last active admin directory entry.');
  }
  const { error } = await adminClient.from('team_directory').upsert({ email, sheet_name: sheetName, role: raw.role, active: Boolean(raw.active), updated_at: new Date().toISOString() }, { onConflict: 'email' });
  if (error) throw new Error(error.message);
  if (!raw.active && existingUser?.account_status === 'active') {
    await adminClient.from('users').update({account_status:'disabled',active:false}).eq('id',existingUser.id);
    await adminClient.from('user_role_name_audit').insert({user_id:existingUser.id,changed_by:admin.id,email,field_name:'account_status',old_value:'active',new_value:'disabled'});
  }
  for (const [field, oldValue, newValue] of [['sheet_name',previous?.sheet_name,sheetName],['role',previous?.role,raw.role],['active',String(previous?.active ?? ''),String(raw.active)]] as const) {
    if (String(oldValue ?? '') !== String(newValue ?? '')) await adminClient.from('user_role_name_audit').insert({ user_id: null, changed_by: admin.id, email, field_name: `directory_${field}`, old_value: String(oldValue ?? ''), new_value: String(newValue ?? '') });
  }
  revalidateTeamPaths();
}

export async function revokeUserInvitation(invitationId: string) {
  await requireAdminForAction();
  const id = String(invitationId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid invitation ID.');
  const { error } = await adminClient.from('user_invitations').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
  if (error) throw new Error(error.message);
  revalidateTeamPaths();
}
export async function getAccessRequests() {
  await requireAdminForAction();
  const { data, error } = await adminClient.from('access_requests').select('id,email,display_name,note,status,created_at').eq('status','open').order('created_at',{ascending:false}).limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}
export async function inviteAccessRequest(requestId: string, role: 'member'|'admin') {
  await requireAdminForAction();
  const id = String(requestId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid request ID.');
  const { data: request, error } = await adminClient.from('access_requests').select('id,email,display_name,status').eq('id',id).eq('status','open').single();
  if (error || !request) throw new Error(error?.message || 'Request is no longer open.');
  await createUserInvitation(String(request.email), String(request.display_name || String(request.email).split('@')[0]), role);
  const { error: updateError } = await adminClient.from('access_requests').update({ status:'invited',updated_at:new Date().toISOString() }).eq('id',id);
  if (updateError) throw new Error(updateError.message);
  revalidateTeamPaths();
}
export async function dismissAccessRequest(requestId: string) {
  await requireAdminForAction();
  const id = String(requestId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid request ID.');
  const { error } = await adminClient.from('access_requests').update({status:'dismissed',updated_at:new Date().toISOString()}).eq('id',id).eq('status','open');
  if (error) throw new Error(error.message);
  revalidateTeamPaths();
}
export async function getPendingInvitations() {
  await requireAdminForAction();
  const { data, error } = await adminClient.from('user_invitations').select('id,email,display_name,role,created_at').eq('status','pending').order('created_at',{ascending:false}).limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

export type TeamNameOption = { id: string; name: string; badge_bg: string; badge_text: string; active: boolean; claimedBy: string | null };

export async function getAvailableTeamNames(): Promise<TeamNameOption[]> {
  const { getCurrentProfile } = await import('@/lib/auth');
  const profile = await getCurrentProfile();
  if (!profile) throw new Error('Please sign in again.');
  const [{ data: names, error: namesError }, { data: users, error: usersError }] = await Promise.all([
    adminClient.from('team_names').select('id,name,badge_bg,badge_text,active').eq('active', true).order('name'),
    adminClient.from('users').select('id,sheet_name').not('sheet_name', 'is', null),
  ]);
  if (namesError) throw new Error(namesError.message);
  if (usersError) throw new Error(usersError.message);
  const claims = new Map<string, string>();
  for (const user of users ?? []) { const key = String(user.sheet_name ?? '').trim().toLowerCase(); if (key) claims.set(key, String(user.id)); }
  return (names ?? []).map((name: any) => {
    const claimId = claims.get(String(name.name).trim().toLowerCase());
    return { id: String(name.id), name: String(name.name), badge_bg: String(name.badge_bg), badge_text: String(name.badge_text), active: Boolean(name.active), claimedBy: claimId && claimId !== profile.id ? 'claimed' : null };
  });
}

export async function completeOnboarding(teamNameId: string) {
  const profile = await requireAuthenticatedForOnboarding();
  const { data: teamName, error: nameError } = await adminClient.from('team_names').select('id,name,active').eq('id', teamNameId).single();
  if (nameError || !teamName || !teamName.active) throw new Error('Choose one of the approved Guest Post Anchor names.');
  const { data: claimed, error: claimError } = await adminClient.from('users').select('id').ilike('sheet_name', String(teamName.name)).neq('id', profile.id).maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (claimed) throw new Error('That Guest Post Anchor name is already linked to another account. Ask an admin to fix the mapping.');
  const isAdmin = profile.role === 'admin';
  const { error } = await adminClient.from('users').update({ sheet_name: String(teamName.name), onboarding_completed: true, account_status: isAdmin ? 'active' : 'pending', active: isAdmin, approved_at: isAdmin ? new Date().toISOString() : null, approved_by: isAdmin ? profile.id : null }).eq('id', profile.id);
  if (error) throw new Error(error.message);
  if (isAdmin) await linkUserHistory(profile.id);
  revalidateTeamPaths();
  return { ok: true, pending: !isAdmin };
}

async function requireAuthenticatedForOnboarding(): Promise<UserProfile> {
  const { getCurrentProfile } = await import('@/lib/auth');
  const profile = await getCurrentProfile();
  if (!profile) throw new Error('Please sign in again.');
  return profile;
}

export async function linkUserHistory(userId: string) {
  const { data, error } = await adminClient.rpc('link_user_sheet_history', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return data as { requests?: number; project_sites?: number } | null;
}

export type TeamAdminUser = {
  id: string; email: string; googleName: string | null; avatarUrl: string | null; sheetName: string | null;
  role: 'admin' | 'member'; status: 'pending' | 'active' | 'disabled'; onboardingCompleted: boolean;
  approvedAt: string | null; lastLoginAt: string | null; requestedAt: string | null;
  counts: { assigned: number; live: number; pending: number; rejected: number; overdue: number };
};
export type TeamAdminData = { users: TeamAdminUser[]; names: TeamNameOption[]; unmatched: Array<{ name: string; rows: number; invalid: boolean }> };

function todayKarachi() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

export async function getTeamAdminData(): Promise<TeamAdminData> {
  await requireAdminForAction();
  const [{ data: users, error: usersError }, { data: names, error: namesError }] = await Promise.all([
    adminClient.from('users').select('id,email,google_name,avatar_url,sheet_name,role,account_status,onboarding_completed,approved_at,last_login_at,created_at').order('created_at'),
    adminClient.from('team_names').select('id,name,badge_bg,badge_text,active').order('name'),
  ]);
  if (usersError) throw new Error(usersError.message);
  if (namesError) throw new Error(namesError.message);

  const requestRows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await adminClient.from('requests').select('assigned_user_id,assign_to,status,deadline').is('deleted_at', null).range(from, from + 999);
    if (error) throw new Error(error.message);
    requestRows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const today = todayKarachi();
  const normalizedUsers: TeamAdminUser[] = (users ?? []).map((user: any) => {
    const sheetKey = String(user.sheet_name ?? '').trim().toLowerCase();
    const assigned = requestRows.filter((row) => String(row.assigned_user_id ?? '') === String(user.id) || (sheetKey && String(row.assign_to ?? '').trim().toLowerCase() === sheetKey));
    return {
      id: String(user.id), email: String(user.email), googleName: user.google_name ? String(user.google_name) : null, avatarUrl: user.avatar_url ? String(user.avatar_url) : null,
      sheetName: user.sheet_name ? String(user.sheet_name) : null, role: user.role === 'admin' ? 'admin' : 'member',
      status: user.account_status === 'active' ? 'active' : user.account_status === 'disabled' ? 'disabled' : 'pending',
      onboardingCompleted: Boolean(user.onboarding_completed), approvedAt: user.approved_at ? String(user.approved_at) : null,
      lastLoginAt: user.last_login_at ? String(user.last_login_at) : null, requestedAt: user.created_at ? String(user.created_at) : null,
      counts: {
        assigned: assigned.length,
        live: assigned.filter((row) => row.status === 'Live').length,
        pending: assigned.filter((row) => row.status === 'Request shared').length,
        rejected: assigned.filter((row) => row.status === 'Rejected').length,
        overdue: assigned.filter((row) => row.status === 'Request shared' && row.deadline && String(row.deadline).slice(0, 10) < today).length,
      },
    };
  });

  const claimByName = new Map(normalizedUsers.filter((u) => u.sheetName).map((u) => [u.sheetName!.toLowerCase(), u.email]));
  const teamNames: TeamNameOption[] = (names ?? []).map((name: any) => ({ id: String(name.id), name: String(name.name), badge_bg: String(name.badge_bg), badge_text: String(name.badge_text), active: Boolean(name.active), claimedBy: claimByName.get(String(name.name).toLowerCase()) ?? null }));
  const activeRoster = new Set(teamNames.filter((n) => n.active).map((n) => n.name.trim().toLowerCase()));
  const claimedKeys = new Set(normalizedUsers.filter((u) => u.sheetName).map((u) => u.sheetName!.trim().toLowerCase()));
  const historical = new Map<string, { name: string; rows: number }>();
  for (const row of requestRows) {
    const name = String(row.assign_to ?? '').trim(); if (!name) continue;
    const key = name.toLowerCase(); const item = historical.get(key) ?? { name, rows: 0 }; item.rows += 1; historical.set(key, item);
  }
  const unmatched = [...historical.entries()].filter(([key]) => !claimedKeys.has(key) || !activeRoster.has(key)).map(([key, value]) => ({ ...value, invalid: !activeRoster.has(key) })).sort((a, b) => Number(b.invalid) - Number(a.invalid) || b.rows - a.rows || a.name.localeCompare(b.name));
  return { users: normalizedUsers, names: teamNames, unmatched };
}

export async function approveTeamUser(userId: string) {
  const admin = await requireAdminForAction();
  const { data: user, error } = await adminClient.from('users').select('id,sheet_name').eq('id', userId).single();
  if (error || !user) throw new Error(error?.message ?? 'User not found.');
  if (!user.sheet_name) throw new Error('User must select a Guest Post Anchor name first.');
  const { data: roster } = await adminClient.from('team_names').select('id').eq('active', true).ilike('name', String(user.sheet_name)).maybeSingle();
  if (!roster) throw new Error('Selected name is not in the approved seven-person roster.');
  const { error: updateError } = await adminClient.from('users').update({ account_status: 'active', active: true, approved_by: admin.id, approved_at: new Date().toISOString() }).eq('id', userId);
  if (updateError) throw new Error(updateError.message);
  const linked = await linkUserHistory(userId); revalidateTeamPaths(); return { ok: true, linked };
}

export async function setTeamUserStatus(userId: string, status: 'active' | 'disabled') {
  const admin = await requireAdminForAction();
  if (admin.id === userId && status === 'disabled') throw new Error('You cannot disable your own admin account.');
  const { data: target, error: targetError } = await adminClient.from('users').select('id,email,role,account_status,sheet_name').eq('id', userId).single();
  if (targetError || !target) throw new Error(targetError?.message || 'User not found.');
  if (status === 'disabled' && target.role === 'admin' && target.account_status === 'active') {
    const { count, error: countError } = await adminClient.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('account_status', 'active');
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) throw new Error('The last active admin cannot be disabled. Promote another active user first.');
  }
  const update: Record<string, unknown> = { account_status: status, active: status === 'active' };
  if (status === 'active') { update.approved_by = admin.id; update.approved_at = new Date().toISOString(); }
  const { error } = await adminClient.from('users').update(update).eq('id', userId); if (error) throw new Error(error.message);
  await adminClient.from('user_role_name_audit').insert({ user_id: userId, changed_by: admin.id, email: target.email, field_name: 'account_status', old_value: target.account_status, new_value: status });
  if (status === 'active') await linkUserHistory(userId); revalidateTeamPaths();
}

export async function setTeamUserRole(userId: string, role: 'admin' | 'member') {
  const admin = await requireAdminForAction();
  if (admin.id === userId && role === 'member') throw new Error('You cannot remove your own admin role.');
  const { data: target, error: targetError } = await adminClient.from('users').select('id,email,role,account_status').eq('id', userId).single();
  if (targetError || !target) throw new Error(targetError?.message || 'User not found.');
  if (role === 'member' && target.role === 'admin' && target.account_status === 'active') {
    const { count, error: countError } = await adminClient.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('account_status', 'active');
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) throw new Error('The last active admin cannot be demoted. Promote another active user first.');
  }
  const { error } = await adminClient.from('users').update({ role }).eq('id', userId); if (error) throw new Error(error.message);
  await adminClient.from('user_role_name_audit').insert({ user_id: userId, changed_by: admin.id, email: target.email, field_name: 'role', old_value: target.role, new_value: role });
  revalidateTeamPaths();
}

export async function setTeamUserSheetName(userId: string, requestedName: string | null) {
  const admin = await requireAdminForAction();
  const id = String(userId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid user ID.');
  const { data: target, error: targetError } = await adminClient.from('users').select('id,email,sheet_name').eq('id',id).single();
  if (targetError || !target) throw new Error(targetError?.message || 'User not found.');
  let canonical: string | null = null;
  if (requestedName) {
    const { data: roster, error: rosterError } = await adminClient.from('team_names').select('name').eq('active',true).ilike('name',requestedName.trim()).maybeSingle();
    if (rosterError || !roster) throw new Error(rosterError?.message || 'Choose a name from the approved team_names roster.');
    canonical = String(roster.name);
    const { data: claim, error: claimError } = await adminClient.from('users').select('id').ilike('sheet_name',canonical).neq('id',id).maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (claim) throw new Error('That sheet name is already claimed by another user.');
  }
  const { error } = await adminClient.from('users').update({ sheet_name: canonical, onboarding_completed: true }).eq('id',id);
  if (error) throw new Error(error.message);
  await adminClient.from('user_role_name_audit').insert({user_id:id,changed_by:admin.id,email:target.email,field_name:'sheet_name',old_value:String(target.sheet_name||''),new_value:String(canonical||'')});
  if (canonical) await linkUserHistory(id);
  revalidateTeamPaths();
}

export async function resetTeamUserMapping(userId: string) {
  const admin = await requireAdminForAction();
  if (admin.id === userId) throw new Error('Use another admin account to reset your own mapping.');
  const { error } = await adminClient.from('users').update({ sheet_name: null, onboarding_completed: false, account_status: 'pending', active: false, approved_by: null, approved_at: null }).eq('id', userId);
  if (error) throw new Error(error.message);
  await adminClient.from('requests').update({ assigned_user_id: null }).eq('assigned_user_id', userId);
  await adminClient.from('project_sites').update({ owner_user_id: null }).eq('owner_user_id', userId);
  revalidateTeamPaths();
}

export async function reassignHistoricalName(fromName: string, toName: string) {
  const admin = await requireAdminForAction();
  const from = fromName.trim(); const to = toName.trim();
  if (!from || !to) throw new Error('Choose both names.');
  const { data: roster, error: rosterError } = await adminClient.from('team_names').select('name').eq('active', true).ilike('name', to).maybeSingle();
  if (rosterError) throw new Error(rosterError.message);
  if (!roster) throw new Error('Destination must be one of the approved seven team names.');
  const canonical = String(roster.name);
  const { data: owner } = await adminClient.from('users').select('id').ilike('sheet_name', canonical).eq('account_status', 'active').maybeSingle();
  const ownerId = owner?.id ? String(owner.id) : null;
  const { data: rows, error } = await adminClient.from('requests').select('*,projects(id,name,slug,guest_post_tab_name,sync_enabled,google_sheet_id,column_mapping,sheet_source),project_sites(id)').ilike('assign_to', from).is('deleted_at', null);
  if (error) throw new Error(error.message);

  let synced = 0; let failed = 0;
  for (const request of rows ?? []) {
    const project = Array.isArray(request.projects) ? request.projects[0] : request.projects;
    const site = Array.isArray(request.project_sites) ? request.project_sites[0] : request.project_sites;
    await adminClient.from('requests').update({ assign_to: canonical, assigned_user_id: ownerId }).eq('id', request.id);
    if (site?.id) await adminClient.from('project_sites').update({ note: canonical, owner_user_id: ownerId }).eq('id', site.id);
    if (request.team_row && project) {
      const original: RequestSheetRecord = { id: request.id, project_id: request.project_id, approved_site: request.approved_site, placement_page: request.placement_page, anchor: request.anchor, assign_to: request.assign_to, status: request.status, team_tab: request.team_tab, team_row: request.team_row, created_by_email: request.created_by_email ?? null };
      const updated: RequestSheetRecord = { ...original, assign_to: canonical };
      const sync = await syncRequestFullRowToTeamSheet(project as any, original, updated, site?.id ?? null);
      await adminClient.from('requests').update({ sync_state: sync.state, sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null, ...(sync.row ? { team_row: sync.row } : {}) }).eq('id', request.id);
      if (sync.state === 'failed') failed += 1; else synced += 1;
    }
  }
  await adminClient.from('project_sites').update({ note: canonical, owner_user_id: ownerId }).ilike('note', from).is('request_id', null);
  revalidateTeamPaths(); revalidatePath('/requests'); revalidatePath('/projects');
  return { changed: (rows ?? []).length, synced, failed, changedBy: admin.email };
}

function revalidateTeamPaths() {
  for (const path of ['/team','/dashboard','/my-requests','/requests','/requests/new']) revalidatePath(path);
}

export type AdminTeamAttention = {
  pendingApprovals: number;
  activeMembers: number;
  invalidAssignments: number;
  invalidLabels: string[];
};

export async function getAdminTeamAttention(): Promise<AdminTeamAttention> {
  await requireAdminForAction();
  const { data, error } = await adminClient.rpc('get_admin_team_attention');
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as any;
  return {
    pendingApprovals: Number(payload.pendingApprovals ?? 0),
    activeMembers: Number(payload.activeMembers ?? 0),
    invalidAssignments: Number(payload.invalidAssignments ?? 0),
    invalidLabels: Array.isArray(payload.invalidLabels) ? payload.invalidLabels.map((value: unknown) => String(value)) : [],
  };
}
