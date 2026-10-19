import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAuthServerClient } from '@/lib/supabase-auth';
import { adminClient } from '@/lib/supabase-admin';
import { configuredAdminEmails, ensureUserProfile } from '@/lib/auth';

export async function GET(request: Request) {
  const url = new URL(request.url); const origin = url.origin; const code = url.searchParams.get('code');
  const cookieStore = await cookies(); const mode = cookieStore.get('inhouse_signin_mode')?.value;
  const clearMode = (response: NextResponse) => { response.cookies.set('inhouse_signin_mode', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/auth/callback', maxAge: 0 }); return response; };
  if (!code || (mode !== 'rankviz' && mode !== 'google')) return clearMode(NextResponse.redirect(`${origin}/login?error=auth`));
  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return clearMode(NextResponse.redirect(`${origin}/login?error=auth`));
  const email = String(data.user.email || '').trim().toLowerCase();
  const [{ data: directory }, { data: invitation }, { data: existing }, { count: activeAdmins }] = await Promise.all([
    adminClient.from('team_directory').select('email,active').eq('email', email).eq('active', true).maybeSingle(),
    adminClient.from('user_invitations').select('id,status').eq('email', email).in('status', ['pending','accepted']).maybeSingle(),
    adminClient.from('users').select('id').eq('id', data.user.id).maybeSingle(),
    adminClient.from('users').select('id', { count: 'exact', head: true }).eq('role','admin').eq('account_status','active'),
  ]);
  const bootstrapAdmin = configuredAdminEmails().has(email) && (activeAdmins ?? 0) === 0;
  const permitted = mode === 'rankviz' ? (email.endsWith('@rankviz.com') && (Boolean(directory) || Boolean(invitation) || bootstrapAdmin)) : (!email.endsWith('@rankviz.com') && Boolean(invitation));
  if (!permitted) {
    await supabase.auth.signOut();
    if (!existing) { try { await adminClient.auth.admin.deleteUser(data.user.id); } catch { /* cleanup is best effort; never log the auth record */ } }
    const response = clearMode(NextResponse.redirect(`${origin}/login/not-invited`));
    response.cookies.set('inhouse_uninvited_email', email, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/login/not-invited', maxAge: 900 });
    return response;
  }
  try {
    const profile = await ensureUserProfile(data.user);
    if (profile.account_status === 'pending') return clearMode(NextResponse.redirect(`${origin}/pending`));
    if (profile.account_status === 'disabled') { await supabase.auth.signOut(); return clearMode(NextResponse.redirect(`${origin}/login?error=disabled`)); }
    return clearMode(NextResponse.redirect(`${origin}/dashboard`));
  } catch {
    await supabase.auth.signOut();
    if (!existing) { try { await adminClient.auth.admin.deleteUser(data.user.id); } catch { /* best effort */ } }
    const response = clearMode(NextResponse.redirect(`${origin}/login/not-invited`));
    response.cookies.set('inhouse_uninvited_email', email, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/login/not-invited', maxAge: 900 });
    return response;
  }
}
