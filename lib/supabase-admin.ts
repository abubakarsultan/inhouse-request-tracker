import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client. Bypasses Row Level Security entirely — only ever
// import this into server-only files (route handlers, 'use server' files),
// never into a Client Component or anything shipped to the browser.
//
// Built lazily (on first real use) instead of at module load time. If this
// were created at the top level, simply *importing* this file — which
// Next.js does while collecting route data at build time, even for routes
// that never execute — would throw as soon as the env vars aren't present
// yet, and fail the whole build. Creating it inside a function means the
// build only needs the env vars to exist once a request actually comes in.
let _adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase admin client is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.'
    );
  }
  _adminClient = createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _adminClient;
}

// Proxy so existing call sites (`adminClient.from(...)`) keep working
// without every file needing to call getAdminClient() itself, while the
// underlying client is still only constructed on first actual use.
export const adminClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getAdminClient(), prop, receiver);
  },
});

export const isRankvizEmail = (email: string) => email.toLowerCase().endsWith('@rankviz.com');
