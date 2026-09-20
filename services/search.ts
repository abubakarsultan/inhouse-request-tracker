'use server';

import { createClient } from '@/lib/supabase-server';
import { normalizeSearchText } from '@/lib/domain';

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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_requests', { p_query: clean, p_limit: 101 });
  if (error) throw new Error(`Search failed: ${error.message}`);

  const rows = (data ?? []) as SearchRequestRow[];
  const capped = rows.length > 100;
  return { ok: true, count: Math.min(rows.length, 100), capped, rows: rows.slice(0, 100) };
}
