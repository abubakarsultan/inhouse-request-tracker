import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Server Component / Server Action client — reads the session from the
// incoming request's cookies. Safe to import into server components,
// route handlers, and files marked 'use server'.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component with no response to attach to — safe to ignore,
            // middleware refreshes the session cookie on every navigation anyway.
          }
        },
      },
    }
  );
}
