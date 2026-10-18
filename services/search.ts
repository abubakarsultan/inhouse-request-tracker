'use server';

import { createClient } from '@/lib/supabase-server';
import { normalizeSearchText } from '@/lib/domain';
import { requireActiveUserForAction } from '@/lib/auth';
import { getMissingRequestFields } from '@/lib/request-completeness';

export type SearchRequestRow = {
  id: string;
  project_id: string;
  client: string;
  project_slug: string;
  sub_project: string | null;
  approved_site: string;
  anchor: string;
  assign_to: string | null;
  status: 'Request shared' | 'Live' | 'Rejected';
  target_url: string;
  created_at: string;
  sync_state: string | null;
  sheet_flag?: string | null;
  placement_page?: string | null;
  deadline?: string | null;
  missing_fields?: string[];
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
  const visibleRows = rows.slice(0,100);
  if (!visibleRows.length) return { ok:true,count:0,capped:false,rows:[] };
  const { data: flags, error: flagsError } = await supabase.from('requests').select('id,sheet_flag,placement_page,target_url,anchor,assign_to,deadline,projects(column_mapping),project_sites(dr,traffic)').in('id',visibleRows.map(row=>row.id));
  if (flagsError) throw new Error(`Search status details failed: ${flagsError.message}`);
  const detailById = new Map((flags||[]).map((row:any)=>[String(row.id),row]));
  const enriched = visibleRows.map(row=>{const detail:any=detailById.get(row.id);const project=Array.isArray(detail?.projects)?detail.projects[0]:detail?.projects;return {...row,sheet_flag:detail?.sheet_flag==null?null:String(detail.sheet_flag),placement_page:detail?.placement_page==null?null:String(detail.placement_page),deadline:detail?.deadline==null?null:String(detail.deadline),missing_fields:getMissingRequestFields({...row,...detail,dr:detail?.project_sites?.[0]?.dr,traffic:detail?.project_sites?.[0]?.traffic},{column_mapping:project?.column_mapping})};});
  return { ok: true, count: Math.min(rows.length, 100), capped, rows: enriched };
}
