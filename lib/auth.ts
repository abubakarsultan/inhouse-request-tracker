import 'server-only';

import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase-admin';
import { createAuthServerClient } from '@/lib/supabase-auth';

import { isRankvizEmail, parseAdminEmails } from '@/lib/auth-rules';
import type { AccountStatus, AppRole, UserProfile } from '@/lib/auth-types';
export { isRankvizEmail };
export type { AccountStatus, AppRole, UserProfile };

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

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const email = String(user.email ?? '').trim().toLowerCase();
  if (!isRankvizEmail(email)) throw new Error('Only @rankviz.com Google accounts can use this app.');

  const adminEmails = configuredAdminEmails();
  const explicitlyAdmin = adminEmails.has(email);
  const { data: existing, error: existingError } = await adminClient
    .from('users')
    .select('id,email,google_name,avatar_url,sheet_name,role,account_status,onboarding_completed,approved_at,last_login_at')
    .eq('id', user.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  // Admin bootstrap is explicit only. This avoids the first person who happens
  // to sign in becoming an admin when ADMIN_EMAILS was forgotten.
  const bootstrapAdmin = explicitlyAdmin;

  const now = new Date().toISOString();
  const role: AppRole = existing?.role === 'admin' || bootstrapAdmin ? 'admin' : 'member';
  const accountStatus: AccountStatus = existing?.account_status
    ? (String(existing.account_status) as AccountStatus)
    : bootstrapAdmin
      ? 'active'
      : 'pending';

  const payload = {
    id: user.id,
    email,
    name: googleName(user),
    google_name: googleName(user),
    avatar: avatarUrl(user),
    avatar_url: avatarUrl(user),
    role,
    active: accountStatus === 'active',
    account_status: bootstrapAdmin && accountStatus !== 'disabled' ? 'active' : accountStatus,
    last_login_at: now,
  };

  const { data, error } = await adminClient
    .from('users')
    .upsert(payload, { onConflict: 'id' })
    .select('id,email,google_name,avatar_url,sheet_name,role,account_status,onboarding_completed,approved_at,last_login_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create user profile.');

  return normalizeProfile(data);
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

export async function getSessionUser() {
  const supabase = await createAuthServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  if (!isRankvizEmail(user.email)) return null;
  return user;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return ensureUserProfile(user);
}

export async function requireAuthenticatedProfile(): Promise<UserProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  return profile;
}

export async function requireActiveProfile(): Promise<UserProfile> {
  const profile = await requireAuthenticatedProfile();
  if (!profile.onboarding_completed || !profile.sheet_name) redirect('/onboarding');
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
  if (!profile.onboarding_completed || !profile.sheet_name) throw new Error('Complete your profile first.');
  if (profile.account_status !== 'active') throw new Error(profile.account_status === 'disabled' ? 'Your account is disabled.' : 'Your account is waiting for admin approval.');
  return profile;
}

export async function requireAdminForAction(): Promise<UserProfile> {
  const profile = await requireActiveUserForAction();
  if (profile.role !== 'admin') throw new Error('Admin access required.');
  return profile;
}
