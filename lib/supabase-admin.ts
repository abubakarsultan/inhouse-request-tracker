import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client. Server-side only — never import this into a client
// component. It bypasses Row Level Security for trusted server-side business
// data operations. Supabase Auth sessions are handled separately with the
// browser-safe publishable key; protected actions verify the signed-in user
// before they use this client.
//
// Built lazily on first use so that merely importing this file can never
// fail a build when env vars aren't resolved yet.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment (Vercel → Settings → Environment Variables).'
    );
  }
  _client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _client;
}

export const adminClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
