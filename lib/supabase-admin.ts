import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client. Bypasses Row Level Security entirely — only ever
// import this into server-only files (route handlers, 'use server' files),
// never into a Client Component or anything shipped to the browser.
export const adminClient = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const isRankvizEmail = (email: string) => email.toLowerCase().endsWith('@rankviz.com');
