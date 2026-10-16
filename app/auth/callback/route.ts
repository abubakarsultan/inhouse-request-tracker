import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase-auth';
import { ensureUserProfile, isRankvizEmail } from '@/lib/auth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = url.origin;
  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth`);

  if (!isRankvizEmail(data.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=domain`);
  }

  try {
    const profile = await ensureUserProfile(data.user);
    if (!profile.onboarding_completed || !profile.sheet_name) return NextResponse.redirect(`${origin}/onboarding`);
    if (profile.account_status === 'pending') return NextResponse.redirect(`${origin}/pending`);
    if (profile.account_status === 'disabled') {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=disabled`);
    }
    return NextResponse.redirect(`${origin}/dashboard`);
  } catch {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }
}
