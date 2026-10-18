import 'server-only';

import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase-admin';
import { createAuthServerClient } from '@/lib/supabase-auth';

import { isRankvizEmail, parseAdminEmails } from '@/lib/auth-rules';

export async function getFixedRankvizName(email: string): Promise<string | null> {
  const { data } = await adminClient.from('team_directory').select('sheet_name').eq('email', email.trim().toLowerCase()).eq('active', true).maybeSingle();
  return data?.sheet_name ? String(data.sheet_name) : null;
}
import type { AccountStatus, AppRole, UserProfile } from '@/lib/auth-types';
export { isRankvizEmail };
export type { AccountStatus, AppRole, UserProfile };

const PROFILE_SELECT = 'id,email,google_name,avatar_url,sheet_name,role,account_status,onboarding_completed,approved_at,last_login_at';

export function configuredAdminEmails() {
  return parseAdminEmails(process.env.ADMIN_EMAILS);
}

function googleName(user: User) {
  const meta = user.user_metadata ?? {};
  return String(meta.full_name ?? meta.name ?? '').trim() || null;
}

function avatarUrl(user: User) {
  const meta = user.user_metadata ?? {};
  return String(meta.avatar_url ?? meta.picture ?? '').trim() || null;
}

function normalizeProfile(row: any): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    google_name: row.google_name ? String(row.google_name) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    sheet_name: row.sheet_name ? String(row.sheet_name) : null,
    role: row.role === 'admin' ? 'admin' : 'member',
    account_status: row.account_status === 'active' ? 'active' : row.account_status === 'disabled' ? 'disabled' : 'pending',
    onboarding_completed: Boolean(row.onboarding_completed),
    approved_at: row.approved_at ? String(row.approved_at) : null,
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
  };
}

/**
 * Called on the OAuth callback (and only as a fallback if a profile row is
 * unexpectedly missing). Normal page navigation reads the existing profile
 * instead of upserting it on every click.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const email = String(user.email ?? '').trim().toLowerCase();
  if (!email) throw new Error('Google did not provide an email address.');
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await adminClient.from('users').select(PROFILE_SELECT).eq('id', user.id).maybeSingle();
  if (existingError) throw new Error(existingError.message);

  // Existing profiles are authoritative. A later login must never restore an old invitation role/name/status.
  if (existing) {
    const { data, error } = await adminClient.from('users').update({ last_login_at: now }).eq('id', user.id).select(PROFILE_SELECT).single();
    if (error || !data) throw new Error(error?.message ?? 'Could not update user login time.');
    return normalizeProfile(data);
  }

  const [{ data: directory, error: directoryError }, { data: invitation, error: invitationError }, { count: activeAdmins, error: adminCountError }] = await Promise.all([
    adminClient.from('team_directory').select('email,sheet_name,role,active').eq('email', email).maybeSingle(),
    adminClient.from('user_invitations').select('id,email,role,status,display_name,sheet_name').eq('email', email).eq('status', 'pending').maybeSingle(),
    adminClient.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('account_status', 'active'),
  ]);
  if (directoryError) throw new Error(directoryError.message);
  if (invitationError) throw new Error(invitationError.message);
  if (adminCountError) throw new Error(adminCountError.message);
  const adminEmails = configuredAdminEmails();
  const bootstrapAdmin = adminEmails.has(email) && (activeAdmins ?? 0) === 0;
  if (!directory?.active && !invitation && !bootstrapAdmin) throw new Error('This email has not been invited.');
  let sheetName = directory?.active ? String(directory.sheet_name || '') : String(invitation?.sheet_name || '');
  let claimed = false;
  if (sheetName) {
    const { data: nameClaim, error: nameError } = await adminClient.from('users').select('id').ilike('sheet_name', sheetName).limit(1).maybeSingle();
    if (nameError) throw new Error(nameError.message);
    if (nameClaim) { claimed = true; sheetName = ''; }
  }
  const role: AppRole = bootstrapAdmin || (directory?.active ? directory.role === 'admin' : invitation?.role === 'admin') ? 'admin' : 'member';
  const profileStatus: AccountStatus = directory?.active || bootstrapAdmin || invitation ? 'active' : 'pending';
  const name = googleName(user);
  const payload = {
    id: user.id, email, name: name || email.split('@')[0], google_name: name,
    avatar: avatarUrl(user), avatar_url: avatarUrl(user), role,
    active: profileStatus === 'active', account_status: profileStatus,
    sheet_name: sheetName || null, onboarding_completed: true,
    approved_at: profileStatus === 'active' ? now : null, last_login_at: now,
  };
  const { data, error } = await adminClient.from('users').insert(payload).select(PROFILE_SELECT).single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create user profile.');
  if (invitation?.id) {
    const { error: acceptedError } = await adminClient.from('user_invitations').update({ status: 'accepted', accepted_user_id: user.id, accepted_at: now, updated_at: now }).eq('id', invitation.id).eq('status', 'pending');
    if (acceptedError) throw new Error(`Profile created, but invitation acceptance could not be recorded: ${acceptedError.message}`);
  }
  if (claimed) {
    await adminClient.from('user_role_name_audit').insert({ user_id: user.id, changed_by: null, email, field_name: 'sheet_name', old_value: String(directory?.sheet_name || invitation?.sheet_name || ''), new_value: null });
  }
  return normalizeProfile(data);
}

/** Request-scoped signed JWT verification without a remote /user call on each page. */
export const getSessionUser = cache(async (): Promise<{ id: string; email: string } | null> => {
  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = String(data.claims.email || '').trim().toLowerCase();
  return { id: String(data.claims.sub), email };
});

/** Request-scoped cached profile lookup; no write on normal navigation. */
export const getCurrentProfile = cache(async (): Promise<UserProfile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const { data, error } = await adminClient
    .from('users')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    // Only the rare missing-profile fallback needs the full Auth user record.
    const supabase = await createAuthServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user || authData.user.id !== user.id) return null;
    try { return await ensureUserProfile(authData.user); } catch { return null; }
  }
  return normalizeProfile(data);
});

export async function requireAuthenticatedProfile(): Promise<UserProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  return profile;
}

export async function requireActiveProfile(): Promise<UserProfile> {
  const profile = await requireAuthenticatedProfile();
  if (!profile.onboarding_completed) redirect('/onboarding');
  if (profile.account_status === 'pending') redirect('/pending');
  if (profile.account_status === 'disabled') redirect('/login?error=disabled');
  return profile;
}

export async function requireAdminProfile(): Promise<UserProfile> {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') redirect('/dashboard');
  return profile;
}

export async function requireActiveUserForAction(): Promise<UserProfile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error('Please sign in again.');
  if (!profile.onboarding_completed) throw new Error('Complete your profile first.');
  if (profile.account_status !== 'active') throw new Error(profile.account_status === 'disabled' ? 'Your account is disabled.' : 'Your account is waiting for admin approval.');
  return profile;
}

export async function requireAdminForAction(): Promise<UserProfile> {
  const profile = await requireActiveUserForAction();
  if (profile.role !== 'admin') throw new Error('Admin access required.');
  return profile;
}
