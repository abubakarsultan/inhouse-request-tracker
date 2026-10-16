'use server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { adminClient } from '@/lib/supabase-admin';
import { autoCreateCollaborationSheet, connectCollaborationSheet, refreshCollaborationSummary, syncCollaborationLink } from '@/lib/collaboration-sheets';
import {updateRequestFromCollaboration} from '@/lib/collaboration-status-bridge';
import { COLLAB_STATUSES, dealProgress, partnerMetrics, normalizeCollabStatus, type CollabStatus, type CollabDirection } from '@/lib/collaboration-core';

const uuid = z.string().uuid();
const partnerInput = z.object({
  name: z.string().trim().min(2).max(120), email: z.string().trim().max(200).optional(),
  website: z.string().trim().max(400).optional(), notes: z.string().max(1000).optional(),
  give: z.number().int().min(1).max(100), receive: z.number().int().min(1).max(100),
  setup: z.enum(['automatic','manual','later']), sheetUrl: z.string().optional(),
});
const linkInput = z.object({
  partnerId: uuid, dealId: uuid.nullable().optional(), direction:z.enum(['given','received']),
  website:z.string().trim().min(2).max(500), placementPage:z.string().trim().min(3).max(2000),
  anchor:z.string().trim().min(1).max(500),targetUrl:z.string().trim().min(3).max(2000),
  status:z.enum(COLLAB_STATUSES),
});
const dealInput=z.object({partnerId:uuid,give:z.number().int().min(0).max(100),receive:z.number().int().min(0).max(100),notes:z.string().max(1000).optional()})
.refine(x=>x.give+x.receive>0,'At least one link is required');
function check<T>(data: T | null, error: {message:string}|null, message:string):T {
  if(error||!data)throw new Error(error?.message||message);
  return data;
}
function refresh(id?:string){revalidatePath('/collaborations');if(id)revalidatePath(`/collaborations/${id}`);}

export async function listCollaborationPartners() {
  await requireActiveUserForAction();
  const {data,error}=await adminClient.from('collaboration_partners').select('id,name,email,website,active,default_give_qty,default_receive_qty,sheet_setup_state,sync_enabled,spreadsheet_id').order('name').limit(200);
  return check(data,error,'Unable to load partners');
}
export async function getCollaborationPartner(id:string){
  await requireActiveUserForAction();uuid.parse(id);
  const [{data:partner,error:pError},{data:deals,error:dError},{data:links,error:lError},{data:logs}]=await Promise.all([
    adminClient.from('collaboration_partners').select('*').eq('id',id).single(),
    adminClient.from('collaboration_deals').select('*').eq('partner_id',id).order('created_at',{ascending:false}).limit(250),
    adminClient.from('collaboration_links').select('*').eq('partner_id',id).order('created_at',{ascending:false}).limit(500),
    adminClient.from('collaboration_sync_log').select('id,action,state,details,created_at').eq('partner_id',id).order('created_at',{ascending:false}).limit(15),
  ]);
  const validPartner = check(partner,pError,'Partner not found');
  if(dError||lError)throw new Error(dError?.message||lError?.message);
  const {data:fullMetrics,error:metricsError}=await adminClient.rpc('collaboration_partner_stats',{p_partner_id:id});
  if(metricsError)console.warn('[collaboration] Aggregate RPC unavailable; check migration 010:',metricsError.message);
  const metrics=fullMetrics && !metricsError ? fullMetrics as ReturnType<typeof partnerMetrics> : partnerMetrics(deals||[],links||[]);
  return {partner:validPartner, deals:deals||[],links:links||[],logs:logs||[],metrics,truncated:(deals||[]).length>=250||(links||[]).length>=500,statsUnavailable:Boolean(metricsError)};
}
export async function createCollaborationPartner(raw:z.input<typeof partnerInput>){
  const profile=await requireAdminForAction();const input=partnerInput.parse(raw);
  const {data:partner,error}=await adminClient.from('collaboration_partners').insert({
    name:input.name,email:input.email||null,website:input.website||null,notes:input.notes||null,
    default_give_qty:input.give,default_receive_qty:input.receive,created_by:profile.id,
  }).select('*').single();
  const savedPartner = check(partner,error,'Could not save partner');
  let setupMessage='Partner saved. Connect a Google Sheet when ready.';
  if(input.setup!=='later'){
    try{
      if(input.setup==='manual'&&!input.sheetUrl?.trim())throw new Error('Paste the Sheet URL after importing the CSV templates, or choose Set up later.');
      const details=input.setup==='automatic'
        ?await autoCreateCollaborationSheet(input.name,profile.email)
        :await connectCollaborationSheet(input.sheetUrl||'',input.name);
      const {error:connError}=await adminClient.from('collaboration_partners').update({...details,sheet_setup_state:'connected',sheet_setup_error:null,sync_enabled:true}).eq('id',savedPartner.id);
      if(connError)throw new Error(connError.message);
      setupMessage='Partner created and Google Sheet connected. Install the Apps Script for Sheet-to-app updates.';
      try{await refreshCollaborationSummary(savedPartner.id);}catch(e){console.warn('[collab] initial summary failed:',e);}
    }catch(e){
      setupMessage=`Partner saved, but Sheet setup needs attention: ${e instanceof Error?e.message:String(e)}`;
      await adminClient.from('collaboration_partners').update({sheet_setup_state:'error',sheet_setup_error:setupMessage,sync_enabled:false}).eq('id',savedPartner.id);
    }
  }
  refresh(savedPartner.id);
  return {id:String(savedPartner.id),setupMessage};
}
export async function connectPartnerSheet(partnerId:string,url:string){
  await requireAdminForAction();uuid.parse(partnerId);
  const {data:partner,error}=await adminClient.from('collaboration_partners').select('*').eq('id',partnerId).single();
  const validPartner = check(partner,error,'Partner not found');
  const connection=await connectCollaborationSheet(url,String(validPartner.name));
  const {data:duplicate}=await adminClient.from('collaboration_partners').select('name').eq('spreadsheet_id',connection.spreadsheet_id).neq('id',partnerId).maybeSingle();
  if(duplicate)throw new Error(`That spreadsheet is already connected to ${duplicate.name}. Each partner needs a separate Sheet.`);
  const {error:saveError}=await adminClient.from('collaboration_partners').update({...connection,sheet_setup_state:'connected',sheet_setup_error:null,sync_enabled:true}).eq('id',partnerId);
  if(saveError)throw new Error(saveError.message);
  // Resync all pending rows without duplicating by stable record ID.
  const {data:links}=await adminClient.from('collaboration_links').select('id').eq('partner_id',partnerId).limit(200);
  let failures=0;for(const link of links||[]){const result=await syncCollaborationLink(link.id);if(result.state==='failed')failures++;}
  refresh(partnerId);
  return `Sheet connected. ${links?.length||0} existing links checked; ${failures} sync errors${(links?.length||0)===200?' (only first 200 processed; retry remaining links manually)':''}.`;
}
export async function createCollaborationDeal(raw:z.input<typeof dealInput>){
  const profile=await requireActiveUserForAction();const input=dealInput.parse(raw);
  const {data:p,error:pError}=await adminClient.from('collaboration_partners').select('id').eq('id',input.partnerId).eq('active',true).single();check(p,pError,'Partner not found');
  const dealRef=`EX-${randomUUID().replace(/-/g,'').slice(0,10).toUpperCase()}`;
  const {data,error}=await adminClient.from('collaboration_deals').insert({partner_id:input.partnerId,deal_ref:dealRef,give_required:input.give,receive_required:input.receive,notes:input.notes||null,created_by:profile.id}).select('id').single();
  const savedDeal = check(data,error,'Could not create deal');
  refresh(input.partnerId);
  return String(savedDeal.id);
}
export async function addCollaborationLink(raw:z.input<typeof linkInput>){
  const profile=await requireActiveUserForAction();const input=linkInput.parse(raw);
  const {data:p,error:pError}=await adminClient.from('collaboration_partners').select('id').eq('id',input.partnerId).eq('active',true).single();check(p,pError,'Partner not found');
  const {data,error}=await adminClient.from('collaboration_links').insert({
    partner_id:input.partnerId,deal_id:input.dealId||null,direction:input.direction,
    website:input.website,placement_page:input.placementPage,anchor:input.anchor,target_url:input.targetUrl,
    status:input.status,created_by:profile.id,
  }).select('id').single();
  const savedLink = check(data,error,'Could not add link');
  let message='Link saved.';
  const sync=await syncCollaborationLink(savedLink.id);
  if(sync.state==='failed')message+=` Sheet sync failed (retry available): ${sync.text}`;
  else if(sync.state==='disabled')message+=` ${sync.text}`;
  else message+=' Google Sheet synced.';
  refresh(input.partnerId);return {id:savedLink.id,message};
}
export async function updateCollaborationLinkStatus(linkId:string,newStatus:CollabStatus){
  await requireActiveUserForAction();uuid.parse(linkId);if(!COLLAB_STATUSES.includes(newStatus))throw new Error('Invalid status');
  const {data,error}=await adminClient.from('collaboration_links').update({status:newStatus,sync_state:'pending'}).eq('id',linkId).select('partner_id').single();
  const updatedLink = check(data,error,'Link not found');
  const sync=await syncCollaborationLink(linkId);
  try{await updateRequestFromCollaboration(linkId,newStatus);}catch(e){console.warn('[collaboration] linked request update failed:',e);}
  refresh(updatedLink.partner_id);return sync;
}
export async function retryCollaborationLinkSync(linkId:string){
  await requireActiveUserForAction();uuid.parse(linkId);
  const {data,error}=await adminClient.from('collaboration_links').select('partner_id,status').eq('id',linkId).single();
  const link = check(data,error,'Link not found');
  const sync=await syncCollaborationLink(linkId);
  try{await updateRequestFromCollaboration(linkId,String(link.status));}catch(e){console.warn('[collaboration] linked request update failed:',e);}
  refresh(link.partner_id);return sync;
}
export async function allocatePreviouslyGivenLink(partnerId:string,dealId:string,linkId:string){
  await requireActiveUserForAction();uuid.parse(partnerId);uuid.parse(dealId);uuid.parse(linkId);
  const {data,error}=await adminClient.from('collaboration_links').update({deal_id:dealId}).eq('id',linkId).eq('partner_id',partnerId).eq('direction','given').eq('status','Live').is('deal_id',null).select('id').maybeSingle();
  if(error||!data)throw new Error(error?.message||'Link was already allocated, not live, or belongs to another partner.');
  await syncCollaborationLink(linkId);refresh(partnerId);return true;
}

const requestCollab=z.object({
  requestId:uuid,partnerId:uuid,mode:z.enum(['direct','previous','advance']),
  give:z.number().int().min(0).max(100),receive:z.number().int().min(1).max(100),
  previousLinkId:uuid.optional(),offer:z.object({website:z.string().min(1),placement_page:z.string().min(1),anchor:z.string().min(1),target_url:z.string().min(1)}).optional(),
});
export async function attachRequestToCollaboration(raw:z.input<typeof requestCollab>){
  const profile=await requireActiveUserForAction();const input=requestCollab.parse(raw);
  // Members can only link their own requests; admins may link team requests.
  const {data:request,error:rError}=await adminClient.from('requests').select('id,created_by_user_id,approved_site,anchor,status').eq('id',input.requestId).is('deleted_at',null).single();
  const linkedRequest = check(request,rError,'Request not found');
  if(profile.role!=='admin' && linkedRequest.created_by_user_id!==profile.id)throw new Error('You can only attach your own requests.');
  if(input.mode==='direct'&&!input.offer)throw new Error('The link you are offering is required.');
  if(input.mode==='previous'&&!input.previousLinkId)throw new Error('Select a previously given live link.');
  const {data:rows,error}=await adminClient.rpc('create_collaboration_from_request',{
    p_request_id:input.requestId,p_partner_id:input.partnerId,p_created_by:profile.id,
    p_mode:input.mode,p_give_required:input.give,p_receive_required:input.receive,
    p_previous_link_id:input.previousLinkId||null,p_offer:input.offer||null,
  });
  if(error)throw new Error(`Collaboration linking failed: ${error.message}. The normal request remains saved; do not recreate it.`);
  const saved=(rows||[])[0] as {deal_id:string;received_link_id:string;given_link_id:string|null}|undefined;
  if(!saved)throw new Error('Exchange linking returned no result. Check its status before retrying.');
  const ids=[saved.received_link_id,saved.given_link_id].filter((x):x is string=>Boolean(x));
  const outcomes=await Promise.all(ids.map(id=>syncCollaborationLink(id)));
  refresh(input.partnerId);
  return {dealId:saved.deal_id,warning:outcomes.some(o=>o.state!=='synced')?'Collaboration created; one or more Sheet rows require sync. Check Partner Details.':null};
}
export async function getPreviousGivenLinks(partnerId:string){
  await requireActiveUserForAction();uuid.parse(partnerId);
  const {data,error}=await adminClient.from('collaboration_links').select('id,website,placement_page,anchor').eq('partner_id',partnerId).eq('direction','given').eq('status','Live').is('deal_id',null).order('created_at',{ascending:false}).limit(60);
  return check(data,error,'Cannot load previously given links');
}
