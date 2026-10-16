import 'server-only';
import { adminClient } from '@/lib/supabase-admin';
import { syncCollaborationLink } from '@/lib/collaboration-sheets';
import { syncRequestStatusToTeamSheet } from '@/services/google-sheet-sync';

/** Keep the linked Collaboration record aligned when a normal Request status changes. */
export async function updateCollaborationFromRequest(requestId:string,requestStatus:string){
  const status=requestStatus==='Live'?'Live':requestStatus==='Rejected'?'Rejected':'Pending';
  const {data:linked,error}=await adminClient.from('collaboration_links').select('id,status').eq('request_id',requestId).maybeSingle();
  if(error)throw new Error(error.message);
  if(!linked||linked.status===status)return;
  const {error:updateError}=await adminClient.from('collaboration_links').update({status,sync_state:'pending'}).eq('id',linked.id);
  if(updateError)throw new Error(updateError.message);
  const result=await syncCollaborationLink(linked.id);
  if(result.state==='failed')console.warn('[collaboration] Linked status saved but partner Sheet sync failed:',result.text);
}

/** Keep existing requests/project Google Sheets in sync with a Collaboration status update. */
export async function updateRequestFromCollaboration(linkId:string,collabStatus:string){
  const target=collabStatus==='Live'?'Live':collabStatus==='Rejected'?'Rejected':
    collabStatus==='Pending'||collabStatus==='In Process'?'Request shared':null;
  if(!target)return;
  const {data:link,error:linkError}=await adminClient.from('collaboration_links').select('request_id').eq('id',linkId).single();
  if(linkError)throw new Error(linkError.message);
  if(!link?.request_id)return;
  const {data:request,error:reqError}=await adminClient.from('requests').select('*').eq('id',link.request_id).single();
  if(reqError||!request)throw new Error(reqError?.message||'Linked request missing');
  if(request.status===target)return;
  const now=new Date().toISOString();
  const {error:updateError}=await adminClient.from('requests').update({
    status:target,status_changed_by:'Collaboration',status_changed_at:now,
    ...(target==='Live'&&!request.live_date?{live_date:now.slice(0,10)}:{}),
  }).eq('id',link.request_id);
  if(updateError)throw new Error(updateError.message);
  const {data:site}=await adminClient.from('project_sites').select('id').eq('request_id',link.request_id).maybeSingle();
  if(site?.id)await adminClient.from('project_sites').update({status:target}).eq('id',site.id);
  await adminClient.from('request_logs').insert({request_id:link.request_id,old_status:request.status,new_status:target,changed_by:'Collaboration'});
  const {data:project,error:projectError}=await adminClient.from('projects').select('id,guest_post_tab_name,sync_enabled,google_sheet_id,sheet_source,column_mapping').eq('id',request.project_id).single();
  if(projectError||!project)return;
  const result=await syncRequestStatusToTeamSheet(project as any,{
    id:request.id,project_id:request.project_id,approved_site:request.approved_site,
    placement_page:request.placement_page,anchor:request.anchor,assign_to:request.assign_to,
    status:target,team_tab:request.team_tab,team_row:request.team_row,
    created_by_email:request.created_by_email,
  },site?.id||null);
  await adminClient.from('requests').update({sync_state:result.state,sync_error:result.state==='failed'?result.error||result.text:null}).eq('id',request.id);
  if(result.state==='failed')console.warn('[collaboration] Original project Sheet sync failed:',result.text);
}
