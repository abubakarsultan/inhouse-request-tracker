'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { adminClient } from '@/lib/supabase-admin';
import { verifyCollaborationPlacement } from '@/lib/link-monitor';
import { syncCollaborationLink } from '@/lib/collaboration-sheets';

const uuid = z.string().uuid();
export async function checkLiveCollaborationLink(id: string) {
  const profile = await requireActiveUserForAction();
  const { data, error } = await adminClient.from('collaboration_links').select('partner_id,collaboration_partners(created_by)').eq('id', uuid.parse(id)).single();
  if (error || !data) throw new Error(error?.message || 'Link not found');
  const partner = data.collaboration_partners as unknown as { created_by: string } | null;
  if (profile.role !== 'admin' && partner?.created_by !== profile.id) throw new Error('Not authorized for this partner');
  const result = await verifyCollaborationPlacement(id);
  revalidatePath('/collaborations');
  revalidatePath(`/collaborations/${data.partner_id}`);
  return result;
}
export async function getOperationsAttention() {
  await requireAdminForAction();
  const [{ data: alerts, error, count: alertCount }, { count: failingLinks }] = await Promise.all([
    adminClient.from('operations_alerts').select('id,kind,entity_type,entity_id,title,detail,created_at',{count:'exact'}).eq('state','open').order('created_at', { ascending: false }).limit(25),
    adminClient.from('collaboration_links').select('id', { count:'exact', head:true }).eq('sync_state','failed'),
  ]);
  if (error) throw new Error(error.message);
  return { alerts: alerts || [], alertCount: alertCount || 0, failingLinks: failingLinks || 0 };
}
export async function resolveOperationsAlert(id: string) {
  await requireAdminForAction();
  const { error } = await adminClient.from('operations_alerts').update({ state: 'resolved', updated_at: new Date().toISOString() }).eq('id', uuid.parse(id));
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard'); revalidatePath('/attention');
  return 'Marked as reviewed';
}
export async function bulkUpdateCollaborationLinks(ids: string[], status: 'Pending' | 'In Process' | 'Live' | 'Rejected' | 'Cancelled') {
  const profile = await requireActiveUserForAction();
  const links = z.array(uuid).min(1).max(25).parse(ids);
  if (!['Pending','In Process','Live','Rejected','Cancelled'].includes(status)) throw new Error('Invalid status');
  const { data: rows, error } = await adminClient.from('collaboration_links').select('id,partner_id').in('id',links);
  if (error || !rows || rows.length !== links.length) throw new Error(error?.message || 'Some links were not found');
  if (profile.role !== 'admin') {
    const partnerIds = [...new Set(rows.map(row => row.partner_id))];
    const { data: partners, error: ownerError } = await adminClient.from('collaboration_partners').select('id,created_by').in('id',partnerIds);
    if (ownerError || partners?.length !== partnerIds.length || partners?.some(row => row.created_by !== profile.id)) throw new Error('Not authorized for all selected links');
  }
  const { error: updateError } = await adminClient.from('collaboration_links').update({ status, sync_state:'pending' }).in('id',links);
  if (updateError) throw new Error(updateError.message);
  let failures = 0;
  const {updateRequestFromCollaboration}=await import('@/lib/collaboration-status-bridge');
  for (const id of links) {
    try { const result = await syncCollaborationLink(id); if (result.state === 'failed') failures++; }
    catch { failures++; }
    try { await updateRequestFromCollaboration(id,status); } catch(e) { console.warn('[v9 bulk] linked request update failed:',id,e);failures++; }
  }
  revalidatePath('/collaborations');
  for (const partnerId of new Set(rows.map(row => row.partner_id))) revalidatePath(`/collaborations/${partnerId}`);
  return `${links.length} links updated; ${failures} Sheet sync issue(s).`;
}
export async function resyncPartnerBatch(partnerId: string, cursor = '') {
  const profile = await requireActiveUserForAction(); const validId = uuid.parse(partnerId);
  const { data: partner, error } = await adminClient.from('collaboration_partners').select('created_by,sync_enabled').eq('id',validId).single();
  if (error || !partner) throw new Error(error?.message || 'Partner not found');
  if (profile.role !== 'admin' && partner.created_by !== profile.id) throw new Error('Not authorized');
  if (!partner.sync_enabled) throw new Error('Connect a Sheet and enable sync first');
  let query = adminClient.from('collaboration_links').select('id').eq('partner_id',validId).order('id').limit(26);
  if (cursor) query = query.gt('id',uuid.parse(cursor));
  const { data, error: pageError } = await query;
  if (pageError) throw new Error(pageError.message);
  const batch = (data || []).slice(0,25);
  let failures=0;
  for (const link of batch) {try {const result=await syncCollaborationLink(link.id);if(result.state==='failed')failures++;}catch{failures++;}}
  revalidatePath(`/collaborations/${partnerId}`);
  return { processed: batch.length, failed: failures, nextCursor: (data || []).length > 25 ? batch[batch.length - 1].id as string : null };
}

/** Admin-only bulk request status updates reuse existing validation, logs and Sheet sync. */
export async function bulkUpdateRequestStatuses(ids: string[], status: 'Request shared'|'Live'|'Rejected') {
  await requireAdminForAction();
  const batch=z.array(uuid).min(1).max(10).parse(ids);
  if(!['Request shared','Live','Rejected'].includes(status))throw new Error('Invalid request status');
  const {setRequestStatus}=await import('@/services/requests');
  const issues:string[]=[];let updated=0;
  for(const id of batch){try{const result=await setRequestStatus(id,status);updated++;if(!result.ok||!result.teamSheet.ok||!result.projectSite.ok)issues.push(`${id.slice(0,8)}: ${result.teamSheet.reason||result.projectSite.reason||'Partial sync failure'}`);}catch(e){issues.push(`${id.slice(0,8)}: ${e instanceof Error?e.message:'Unknown error'}`);}}
  revalidatePath('/requests');revalidatePath('/dashboard');
  return `${updated}/${batch.length} requests processed.${issues.length?` Issues: ${issues.join(' | ')}`:''}`;
}

export async function checkLiveRequestLink(id:string) {
  await requireAdminForAction();
  const {verifyRequestPlacement}=await import('@/lib/link-monitor');
  const result=await verifyRequestPlacement(uuid.parse(id));
  revalidatePath('/requests');revalidatePath('/attention');
  return result;
}
export async function getRequestLinkChecks(ids:string[]) {
  await requireAdminForAction();
  if(!ids.length)return [];
  const validIds=z.array(uuid).max(100).parse(ids);
  const {data,error}=await adminClient.from('request_link_checks').select('request_id,result,detail,checked_at').in('request_id',validIds);
  if(error)throw new Error(`V9 link check table unavailable. Run migration 014: ${error.message}`);
  return data||[];
}
