import 'server-only';
import { lookup } from 'node:dns/promises';
import { isBlockedIp, findPlacedLink } from '@/lib/link-monitor-core';
import { adminClient } from '@/lib/supabase-admin';

async function assertPublicUrl(raw: string): Promise<string> {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw new Error('Unsafe placement URL');
  if (!url.hostname.includes('.') || url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Local host blocked');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(address => isBlockedIp(address.address))) throw new Error('Private network address blocked');
  return url.toString();
}
async function readLimitedHtml(response: Response, limit = 1_000_000) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) {
      const result = await reader.read();
      if (result.done) break;
      const remain = limit - size;
      parts.push(result.value.subarray(0, remain));
      size += Math.min(result.value.length, remain);
      if (size >= limit) break;
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder().decode(Buffer.concat(parts.map(part => Buffer.from(part))));
}

type ScanResult = { result:'verified'|'missing'|'unreachable'|'unsafe'|'error';detail:string;httpStatus:number|null;detectedAnchor:string;detectedTarget:string };
async function scanPlacement(placementPage:string,targetUrl:string,anchor:string):Promise<ScanResult> {
  let result:ScanResult['result']='error';
  let detail='';let httpStatus:number|null=null;let detectedAnchor='';let detectedTarget='';
  try {
    const pageUrl=await assertPublicUrl(placementPage);
    const response=await fetch(pageUrl,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html','User-Agent':'RankvizLinkCheck/1.0'},cache:'no-store'});
    httpStatus=response.status;
    const type=response.headers.get('content-type')||'';
    if(response.status>=300&&response.status<400){result='unreachable';detail='Page redirected; review manually';}
    else if(!response.ok){result='unreachable';detail=`Publisher returned HTTP ${response.status}`;}
    else if(!/text\/html|application\/xhtml\+xml/i.test(type)){result='error';detail='Placement page is not HTML';}
    else {
      const html=await readLimitedHtml(response);
      const match=findPlacedLink(html,pageUrl,targetUrl,anchor);
      result=match.matched?'verified':'missing';detail=match.detail;
      detectedAnchor=match.anchor;detectedTarget=match.target;
    }
  }catch(e){
    detail=e instanceof Error?e.message.slice(0,300):'Link verification failed';
    result=/unsafe|blocked|local host|private network/i.test(detail)?'unsafe':'unreachable';
  }
  return {result,detail,httpStatus,detectedAnchor,detectedTarget};
}

/** Verify a collaboration link; no login cookies or credentials are sent to publishers. */
export async function verifyCollaborationPlacement(linkId: string) {
  const { data: link, error } = await adminClient.from('collaboration_links')
    .select('id,partner_id,status,placement_page,target_url,anchor').eq('id', linkId).single();
  if (error || !link) throw new Error(error?.message || 'Link not found');
  if (link.status !== 'Live') return { result: 'skipped' as const, detail: 'Only Live links can be verified' };
  const {result,detail,httpStatus,detectedAnchor,detectedTarget}=await scanPlacement(String(link.placement_page),String(link.target_url),String(link.anchor));
  const { error: saveError } = await adminClient.from('collaboration_link_checks').upsert({
    link_id: link.id, partner_id: link.partner_id, result, detail, http_status: httpStatus,
    detected_anchor: detectedAnchor || null, detected_target: detectedTarget || null, checked_at: new Date().toISOString(),
  }, { onConflict: 'link_id' });
  if (saveError) throw new Error(`Link result could not be saved: ${saveError.message}`);
  // A single failed check is an attention item, NOT proof that a backlink was removed.
  const alert = { kind: 'lost_link', entity_type: 'collaboration_link', entity_id: link.id, title: 'Review link verification',
    detail: `${detail} (one check; confirm before contacting partner)`, owner_id: null, state: result === 'verified' ? 'resolved' : 'open', updated_at: new Date().toISOString() };
  if (result === 'verified' || result === 'missing') {
    const { error: alertError } = await adminClient.from('operations_alerts').upsert(alert, { onConflict: 'kind,entity_type,entity_id' });
    if (alertError) console.warn('[v9 link-monitor] alert update:', alertError.message);
  }
  return { result, detail, httpStatus, checkedAt: new Date().toISOString() };
}

/** Monitor normal request links separately from collaboration records. */
export async function verifyRequestPlacement(requestId:string) {
  const {data:request,error}=await adminClient.from('requests').select('id,status,placement_page,target_url,anchor').eq('id',requestId).is('deleted_at',null).single();
  if(error||!request)throw new Error(error?.message||'Request not found');
  if(request.status!=='Live'||!request.placement_page)return {result:'skipped',detail:'Live placement URL is required'};
  const {result,detail,httpStatus}=await scanPlacement(String(request.placement_page),String(request.target_url),String(request.anchor));
  const {error:saveError}=await adminClient.from('request_link_checks').upsert({request_id:request.id,result,detail,http_status:httpStatus,checked_at:new Date().toISOString()},{onConflict:'request_id'});
  if(saveError)throw new Error(saveError.message);
  if(result==='verified'||result==='missing'){
    const {error:alertError}=await adminClient.from('operations_alerts').upsert({kind:'lost_link',entity_type:'request',entity_id:request.id,
      title:'Review request link verification',detail:`${detail} (one check; confirm before contacting publisher)`,
      state:result==='verified'?'resolved':'open',updated_at:new Date().toISOString()},
      {onConflict:'kind,entity_type,entity_id'});
    if(alertError)console.warn('[v9 monitor] request alert',alertError.message);
  }
  return {result,detail,httpStatus};
}
