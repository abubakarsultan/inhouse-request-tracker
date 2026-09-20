import { adminClient } from '@/lib/supabase-admin';

// Business data remains server-only and uses the service-role client. User
// identity is verified separately through Supabase Auth before protected
// server actions/pages reach this data client.
export async function createClient() {
  return adminClient;
}
