import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { adminClient, isRankvizEmail } from '@/lib/supabase-admin';

// Comma-separated list of emails that should always land as admin on
// their very first login, e.g. "you@rankviz.com,cofounder@rankviz.com".
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login', url));

  const response = NextResponse.redirect(new URL('/dashboard', url));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get('cookie')?.split(';').map((x) => {
            const [name, ...v] = x.trim().split('=');
            return { name, value: v.join('=') };
          }) ?? [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return NextResponse.redirect(new URL('/login?error=auth', url));

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;

  if (!data.user || !email || !isRankvizEmail(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=domain', url));
  }

  // Create/refresh the public.users profile row. Uses the service-role
  // client so it works regardless of RLS, and so a brand-new user (who
  // has no row yet, and therefore couldn't pass any RLS check) can still
  // get one created for them.
  const meta = data.user.user_metadata ?? {};
  const { data: existing } = await adminClient
    .from('users')
    .select('id, active, role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!existing) {
    await adminClient.from('users').insert({
      id: data.user.id,
      email,
      name: meta.full_name ?? meta.name ?? email.split('@')[0],
      avatar: meta.avatar_url ?? meta.picture ?? null,
      role: ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'member',
    });
  } else {
    if (!existing.active) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL('/login?error=disabled', url));
    }
    await adminClient
      .from('users')
      .update({
        name: meta.full_name ?? meta.name ?? email.split('@')[0],
        avatar: meta.avatar_url ?? meta.picture ?? null,
      })
      .eq('id', data.user.id);
  }

  return response;
}
