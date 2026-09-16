'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Browser client, built lazily on first use rather than at module load
// time — same reasoning as lib/supabase-admin.ts: constructing it at the
// top level makes *importing* this file throw if the env vars aren't
// resolved yet in whatever build/collection pass touches it, which can
// fail the whole Vercel build even for a route that never runs.
let _client: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  _client = createBrowserClient(url, key);
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getBrowserClient(), prop, receiver);
  },
});
