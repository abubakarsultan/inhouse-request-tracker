import { adminClient } from '@/lib/supabase-admin';

// There is no login in this app, so there is no per-user session to read.
// Every server action / page gets the same service-role client instead.
// (Kept as an async `createClient()` so the service files didn't need to change.)
export async function createClient() {
  return adminClient;
}
