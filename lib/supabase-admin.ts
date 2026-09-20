import { createClient } from '@supabase/supabase-js';

// Service-role client — bypasses RLS. Server-side only, never import this
// into a client component or expose it to the browser.
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// The single account allowed to use this app.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'abubakarsultan@rankviz.com').toLowerCase().trim();
