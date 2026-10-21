import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { verifyCollaborationPlacement,verifyRequestPlacement } from '@/lib/link-monitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Cron: requires CRON_SECRET. Manual run may use the same Bearer header. */
export async function GET(req: NextRequest) {
  const key = process.env.CRON_SECRET;
  if (!key || req.headers.get('authorization') !== `Bearer ${key}`) return NextResponse.json({ error:'Not authorized' },{status:401});
  const now = new Date().toISOString();
  const { data: candidates, error } = await adminClient.rpc('operations_monitor_candidates',{p_limit:8});
  if (error) return NextResponse.json({error:'Run database/migrations/014_v9_operations.sql before enabling Cron',detail:error.message},{status:503});
  const checks = await Promise.all((candidates || []).map(async (row: {id:string}) => {
    try { const result = await verifyCollaborationPlacement(row.id); return {id:row.id,result:result.result}; }
    catch(e) { console.warn('[v9 cron] link check failed',row.id,e); return {id:row.id,result:'error'}; }
  }));
  const {data:requestCandidates,error:monitorError}=await adminClient.rpc('operations_monitor_request_candidates',{p_limit:8});
  if(monitorError)console.warn('[v9 cron] request monitor candidates',monitorError.message);
  const requestChecks=await Promise.all((requestCandidates||[]).map(async(row:{id:string})=>{try{const r=await verifyRequestPlacement(row.id);return {id:row.id,result:r.result};}catch(e){console.warn('[v9 cron] request check',row.id,e);return {id:row.id,result:'error'};}}));
  // Daily request reminders, idempotent upsert (never inserts duplicate open cards).
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{data:overdue,error:overdueError},{data:stale,error:staleError}] = await Promise.all([
    adminClient.from('requests').select('id,approved_site,assigned_user_id').is('deleted_at',null)
      .not('status','in','("Live","Rejected")').lt('deadline',now.slice(0,10)).order('deadline').limit(100),
    adminClient.from('requests').select('id,approved_site,assigned_user_id').is('deleted_at',null)
      .not('status','in','("Live","Rejected")').lt('updated_at',cutoff).order('updated_at').limit(100),
  ]);
  if(overdueError||staleError)console.warn('[v9 cron] reminder query',overdueError?.message||staleError?.message);
  const overdueIds=new Set((overdue||[]).map(row=>row.id));
  const alertRecords=[...(overdue||[]).map(row=>({row,kind:'overdue_request'})),...(stale||[]).filter(row=>!overdueIds.has(row.id)).map(row=>({row,kind:'stale_request'}))];
  const inserts=alertRecords.map(({row,kind})=>({kind,entity_type:'request',entity_id:row.id,owner_id:row.assigned_user_id || null,
    title:kind==='overdue_request'?'Overdue request needs follow-up':'No recent progress on request',
    detail:`Site: ${row.approved_site}. Review status before outreach.`,updated_at:now}));
  let generated=0;
  if(inserts.length){const {error:saveError}=await adminClient.from('operations_alerts').upsert(inserts,{onConflict:'kind,entity_type,entity_id',ignoreDuplicates:true});if(saveError)console.warn('[v9 cron] alert save',saveError.message);else generated=inserts.length;}
  return NextResponse.json({ checked:checks.length,results:checks,requestChecks:requestChecks.length,reminderCandidates:generated,at:now });
}
