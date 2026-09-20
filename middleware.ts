import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED = ['/dashboard', '/projects', '/requests', '/import', '/settings'];

// TEMPORARY: the login screen is disabled for now. Instead of redirecting
// to /login, this middleware silently signs in as the single admin account
// (still a real Supabase session under the hood, so RLS and everything
// else keeps working exactly the same) so the tool just opens directly.
// To bring the login screen back later: restore the redirect-to-/login
// block that used to be here instead of the auto sign-in call below.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  let { data } = await supabase.auth.getUser();

  if (!data.user) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await supabase.auth.signInWithPassword({ email, password });
      ({ data } = await supabase.auth.getUser());
    }
  }

  if (request.nextUrl.pathname === '/login' && data.user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/projects/:path*', '/requests/:path*', '/import/:path*', '/settings/:path*', '/login'],
};
