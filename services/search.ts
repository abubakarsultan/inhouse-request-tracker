'use server';

import { createClient } from '@/lib/supabase-server';
import { normalizeSearchText } from '@/lib/domain';
import { requireActiveUserForAction } from '@/lib/auth';

export type SearchRequestRow = {
  id: string;
  project_id: string;
  client: string;
  project_slug: string;
  sub_project: string | null;
  approved_site: string;
  anchor: string;
  assign_to: string | null;
  status: 'Request shared' | 'Live';
  target_url: string;
  created_at: string;
  sync_state: string | null;
};

export type SearchDatabaseResult = {
  ok: true;
  count: number;
  capped: boolean;
  rows: SearchRequestRow[];
};

export async function searchDatabase(query: string): Promise<SearchDatabaseResult> {
  const clean = String(query ?? '').trim();
  if (normalizeSearchText(clean).length < 2) return { ok: true, count: 0, capped: false, rows: [] };

  const profile = await requireActiveUserForAction();
  const supabase = await createClient();
  const rpc = profile.role === 'admin' ? 'search_requests' : 'search_requests_for_user';
  const args = profile.role === 'admin'
    ? { p_query: clean, p_limit: 101 }
    : { p_query: clean, p_user_id: profile.id, p_sheet_name: profile.sheet_name || '', p_limit: 101 };
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw new Error(`Search failed: ${error.message}`);

  const rows = (data ?? []) as SearchRequestRow[];
  const capped = rows.length > 100;
  return { ok: true, count: Math.min(rows.length, 100), capped, rows: rows.slice(0, 100) };
}
