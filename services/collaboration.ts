'use server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireActiveUserForAction } from '@/lib/auth';
import { adminClient } from '@/lib/supabase-admin';
import { autoCreateCollaborationSheet, connectCollaborationSheet, prepareCollaborationSheet, refreshCollaborationSummary, syncCollaborationLink } from '@/lib/collaboration-sheets';
import { repairServiceAccountAccess } from '@/lib/google-sheet-factory';
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
async function requirePartnerAccess(partnerId:string){
  const profile=await requireActiveUserForAction();
  uuid.parse(partnerId);
  const {data:partner,error}=await adminClient.from('collaboration_partners').select('id,created_by').eq('id',partnerId).maybeSingle();
  if(error)throw new Error(error.message);
  if(!partner)throw new Error('Partner not found');
  if(profile.role!=='admin' && partner.created_by!==profile.id)throw new Error('You do not have access to this collaboration.');
  return {profile,partner};
}
async function requireLinkAccess(linkId:string){
  uuid.parse(linkId);
  const {data:link,error}=await adminClient.from('collaboration_links').select('id,partner_id').eq('id',linkId).maybeSingle();
  if(error)throw new Error(error.message);
  if(!link)throw new Error('Collaboration link not found');
  await requirePartnerAccess(String(link.partner_id));
  return link;
}

export async function listCollaborationPartners() {
  const profile=await requireActiveUserForAction();
  let query=adminClient.from('collaboration_partners').select('id,name,email,website,active,default_give_qty,default_receive_qty,sheet_setup_state,sync_enabled,spreadsheet_id,created_by').order('name').limit(500);
  if(profile.role!=='admin')query=query.eq('created_by',profile.id);
  const {data,error}=await query;
  const partners = check(data,error,'Unable to load partners');
  const {data:overview, error:overviewError}=await adminClient.rpc('collaboration_partner_overview');
  if(overviewError)console.warn('[v9] Partner overview unavailable until migration 014:',overviewError.message);
  const lookup=new Map<string,{given_live:number;received_live:number;pending:number;rejected:number;received_rejected:number;open_deals:number;owed_by_us:number;owed_by_partner:number;failed_sync:number}>((overview||[]).map((row:any)=>[String(row.partner_id),row]));
  return partners.map(p=>({...p,overview:lookup.get(p.id)||null}));
}
export async function getCollaborationPartner(id:string,linkPage=1,dealPage=1){
  await requirePartnerAccess(id);
  const safeLinkPage = Math.min(Math.max(1,Math.floor(linkPage)||1),10000);
  const safeDealPage = Math.min(Math.max(1,Math.floor(dealPage)||1),10000);
  const [{data:partner,error:pError},{data:deals,error:dError,count:dealCount},{data:links,error:lError,count:linkCount},{data:logs}]=await Promise.all([
    adminClient.from('collaboration_partners').select('*').eq('id',id).single(),
    adminClient.from('collaboration_deals').select('*',{count:'exact'}).eq('partner_id',id).order('created_at',{ascending:false}).range((safeDealPage-1)*50,safeDealPage*50-1),
    adminClient.from('collaboration_links').select('*',{count:'exact'}).eq('partner_id',id).order('created_at',{ascending:false}).range((safeLinkPage-1)*50,safeLinkPage*50-1),
    adminClient.from('collaboration_sync_log').select('id,action,state,details,created_at').eq('partner_id',id).order('created_at',{ascending:false}).limit(15),
  ]);
  const validPartner = check(partner,pError,'Partner not found');
  if(dError||lError)throw new Error(dError?.message||lError?.message);
  const {data:fullMetrics,error:metricsError}=await adminClient.rpc('collaboration_partner_stats',{p_partner_id:id});
  if(metricsError)console.warn('[collaboration] Aggregate RPC unavailable; check migration 010:',metricsError.message);
  const metrics=fullMetrics && !metricsError ? fullMetrics as ReturnType<typeof partnerMetrics> : partnerMetrics(deals||[],links||[]);
  const [{data:allDealProgress,error:progressError},{data:checks,error:checksError},{data:availableGivenLinks}]=await Promise.all([
    adminClient.rpc('collaboration_deal_progress',{p_partner_id:id}),
    adminClient.from('collaboration_link_checks').select('link_id,result,detail,checked_at').eq('partner_id',id).in('link_id',(links||[]).map(x=>x.id).length?(links||[]).map(x=>x.id):['00000000-0000-0000-0000-000000000000']),
    adminClient.from('collaboration_links').select('id,website,anchor,direction,status,deal_id').eq('partner_id',id).eq('direction','given').eq('status','Live').is('deal_id',null).order('created_at',{ascending:false}).limit(60),
  ]);
  if(progressError||checksError) console.warn('[v9] Run migration 014 for link checks and deal progress');
  return {partner:validPartner, deals:deals||[],links:links||[],logs:logs||[],metrics,
    linkCount:linkCount||0,dealCount:dealCount||0,linkPage:safeLinkPage,dealPage:safeDealPage,
    dealProgressRows:allDealProgress||[],checks:checks||[],availableGivenLinks:availableGivenLinks||[],
    truncated:false,statsUnavailable:Boolean(metricsError)};
}
export async function createCollaborationPartner(raw:z.input<typeof partnerInput>){
  const profile=await requireActiveUserForAction();const input=partnerInput.parse(raw);
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
        ?await autoCreateCollaborationSheet(input.name,profile.id,async (sheetId,_url)=>{ const {error:saveSheetIdError}=await adminClient.from('collaboration_partners').update({spreadsheet_id:sheetId,sheet_setup_state:'pending',sheet_setup_error:null}).eq('id',savedPartner.id); if(saveSheetIdError)throw new Error(`Sheet was created but its ID could not be saved for retry: ${saveSheetIdError.message}`); })
        :await connectCollaborationSheet(input.sheetUrl||'',input.name);
      const {error:connError}=await adminClient.from('collaboration_partners').update({...details,sheet_setup_state:details.sheet_setup_state || 'connected',sheet_setup_error:details.sheet_setup_error || null,sync_enabled:details.sheet_setup_state !== 'error'}).eq('id',savedPartner.id);
      if(connError)throw new Error(connError.message);
      setupMessage=details.sheet_setup_state === 'error' ? `Partner saved and sheet created, but setup needs repair: ${details.sheet_setup_error || 'Google access verification failed.'}` : 'Partner created and Google Sheet connected. Install the Apps Script for Sheet-to-app updates.';
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
  await requirePartnerAccess(partnerId);
  const {data:partner,error}=await adminClient.from('collaboration_partners').select('*').eq('id',partnerId).single();
  const validPartner = check(partner,error,'Partner not found');
  const connection=await connectCollaborationSheet(url,String(validPartner.name));
  const {data:duplicate}=await adminClient.from('collaboration_partners').select('name').eq('spreadsheet_id',connection.spreadsheet_id).neq('id',partnerId).maybeSingle();
  if(duplicate)throw new Error(`That spreadsheet is already connected to ${duplicate.name}. Each partner needs a separate Sheet.`);
  const {error:saveError}=await adminClient.from('collaboration_partners').update({...connection,sheet_setup_state:'connected',sheet_setup_error:null,sync_enabled:true}).eq('id',partnerId);
  if(saveError)throw new Error(saveError.message);
  // Large history backfills run in explicit small batches to avoid serverless timeouts.
  refresh(partnerId);
  return 'Sheet connected. Use Sync Next 25 Rows below to backfill existing links safely.';
}
export async function assignCollaborationOwner(partnerId: string, ownerId: string) {
  const admin = await (await import('@/lib/auth')).requireAdminForAction();
  const partnerKey = uuid.parse(partnerId); const ownerKey = uuid.parse(ownerId);
  const [{ data: partner, error: partnerError }, { data: owner, error: ownerError }] = await Promise.all([
    adminClient.from('collaboration_partners').select('id,name,created_by').eq('id', partnerKey).single(),
    adminClient.from('users').select('id,email,account_status').eq('id', ownerKey).single(),
  ]);
  if (partnerError || !partner) throw new Error(partnerError?.message || 'Partner not found.');
  if (ownerError || !owner || owner.account_status !== 'active') throw new Error(ownerError?.message || 'Choose an active user.');
  const { error } = await adminClient.from('collaboration_partners').update({ created_by: ownerKey }).eq('id', partnerKey);
  if (error) throw new Error(error.message);
  await adminClient.from('user_role_name_audit').insert({ user_id: ownerKey, changed_by: admin.id, email: owner.email, field_name: 'collaboration_owner', old_value: String(partner.created_by || ''), new_value: ownerKey });
  refresh(partnerKey);
  return `Owner assigned to ${owner.email}.`;
}

export async function fixCollaborationSheetAccess(partnerId: string) {
  const { profile } = await requirePartnerAccess(partnerId);
  const { data: partner, error } = await adminClient.from('collaboration_partners').select('id,created_by,spreadsheet_id').eq('id', partnerId).single();
  const row = check(partner, error, 'Partner not found');
  if (!row.spreadsheet_id) throw new Error('No saved spreadsheet ID exists. Connect or create a Sheet first.');
  if (!row.created_by) throw new Error('This legacy partner has no owner. An admin must assign an owner before access can be repaired.');
  if (profile.role !== 'admin' && row.created_by !== profile.id) throw new Error('You do not have access to this collaboration.');
  await repairServiceAccountAccess(String(row.created_by), String(row.spreadsheet_id));
  const { error: updateError } = await adminClient.from('collaboration_partners').update({ sheet_setup_state: 'connected', sheet_setup_error: null, sync_enabled: true }).eq('id', partnerId);
  if (updateError) throw new Error(updateError.message);
  refresh(partnerId);
  return 'Service-account access repaired on the existing Sheet.';
}
export async function fixAccessForPastedCollaborationSheet(partnerId: string, url: string) {
  const { profile } = await requirePartnerAccess(partnerId);
  const parsedUrl = z.string().url().max(1000).parse(url);
  const { parseGoogleSheetUrl } = await import('@/lib/google-sheet-url');
  const { spreadsheetId } = parseGoogleSheetUrl(parsedUrl);
  await repairServiceAccountAccess(profile.id, spreadsheetId);
  const { data: partner, error } = await adminClient.from('collaboration_partners').select('name').eq('id',partnerId).single();
  if (error || !partner) throw new Error(error?.message || 'Partner not found.');
  const details = await connectCollaborationSheet(parsedUrl,String(partner.name));
  const { error: updateError } = await adminClient.from('collaboration_partners').update({ ...details, sheet_setup_state:'connected',sheet_setup_error:null,sync_enabled:true }).eq('id',partnerId);
  if (updateError) throw new Error(updateError.message);
  refresh(partnerId);
  return 'Access fixed and the existing Sheet connected. No new spreadsheet was created.';
}

export async function prepareExistingCollaborationSheet(partnerId: string, url: string) {
  await requirePartnerAccess(partnerId);
  const parsedUrl = z.string().url().max(1000).parse(url);
  const { data: partner, error } = await adminClient.from('collaboration_partners').select('id,name,spreadsheet_id').eq('id', partnerId).single();
  const row = check(partner, error, 'Partner not found');
  const connection = await prepareCollaborationSheet(parsedUrl, String(row.name));
  if (row.spreadsheet_id && row.spreadsheet_id !== connection.spreadsheet_id) throw new Error('A different Sheet is already connected to this partner.');
  const { error: updateError } = await adminClient.from('collaboration_partners').update({ ...connection, sheet_setup_state: 'connected', sheet_setup_error: null, sync_enabled: true }).eq('id', partnerId);
  if (updateError) throw new Error(updateError.message);
  refresh(partnerId);
  return 'Sheet prepared. Existing A:G rows were preserved.';
}

export async function createCollaborationDeal(raw:z.input<typeof dealInput>){
  const profile=await requireActiveUserForAction();const input=dealInput.parse(raw);
  await requirePartnerAccess(input.partnerId);
  const {data:p,error:pError}=await adminClient.from('collaboration_partners').select('id').eq('id',input.partnerId).eq('active',true).single();check(p,pError,'Partner not found');
  const dealRef=`EX-${randomUUID().replace(/-/g,'').slice(0,10).toUpperCase()}`;
  const {data,error}=await adminClient.from('collaboration_deals').insert({partner_id:input.partnerId,deal_ref:dealRef,give_required:input.give,receive_required:input.receive,notes:input.notes||null,created_by:profile.id}).select('id').single();
  const savedDeal = check(data,error,'Could not create deal');
  refresh(input.partnerId);
  return String(savedDeal.id);
}
export async function addCollaborationLink(raw:z.input<typeof linkInput>){
  const profile=await requireActiveUserForAction();const input=linkInput.parse(raw);
  await requirePartnerAccess(input.partnerId);
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
  await requireLinkAccess(linkId);if(!COLLAB_STATUSES.includes(newStatus))throw new Error('Invalid status');
  const {data,error}=await adminClient.from('collaboration_links').update({status:newStatus,sync_state:'pending'}).eq('id',linkId).select('partner_id').single();
  const updatedLink = check(data,error,'Link not found');
  const sync=await syncCollaborationLink(linkId);
  try{await updateRequestFromCollaboration(linkId,newStatus);}catch(e){console.warn('[collaboration] linked request update failed:',e);}
  refresh(updatedLink.partner_id);return sync;
}
export async function retryCollaborationLinkSync(linkId:string){
  await requireLinkAccess(linkId);
  const {data,error}=await adminClient.from('collaboration_links').select('partner_id,status').eq('id',linkId).single();
  const link = check(data,error,'Link not found');
  const sync=await syncCollaborationLink(linkId);
  try{await updateRequestFromCollaboration(linkId,String(link.status));}catch(e){console.warn('[collaboration] linked request update failed:',e);}
  refresh(link.partner_id);return sync;
}
export async function allocatePreviouslyGivenLink(partnerId:string,dealId:string,linkId:string){
  await requirePartnerAccess(partnerId);uuid.parse(dealId);uuid.parse(linkId);
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
  await requirePartnerAccess(input.partnerId);
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
  await requirePartnerAccess(partnerId);
  const {data,error}=await adminClient.from('collaboration_links').select('id,website,placement_page,anchor').eq('partner_id',partnerId).eq('direction','given').eq('status','Live').is('deal_id',null).order('created_at',{ascending:false}).limit(60);
  return check(data,error,'Cannot load previously given links');
}
