import { NextRequest,NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminClient } from '@/lib/supabase-admin';
import { normalizeCollabStatus } from '@/lib/collaboration-core';
import { refreshCollaborationSummary } from '@/lib/collaboration-sheets';
import { updateRequestFromCollaboration } from '@/lib/collaboration-status-bridge';
export const runtime='nodejs';
function constantEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export async function POST(request:NextRequest){
  const actual=request.headers.get('x-collaboration-token')||'';
  if(!actual||actual.length!==64)return NextResponse.json({error:'Forbidden'},{status:403});
  try{
    const body=await request.json();
    if(!body||typeof body!=='object'||!Array.isArray(body.row)||body.row.length<8)return NextResponse.json({error:'Invalid payload'},{status:400});
    const sheetId=String(body.spreadsheetId||'');const tabGid=Number(body.tabGid);
    const recordId=String(body.recordId||'');
    if(!/^[0-9a-f-]{36}$/i.test(recordId))return NextResponse.json({error:'Invalid record ID'},{status:400});
    const {data:partner,error:pError}=await adminClient.from('collaboration_partners').select('*').eq('spreadsheet_id',sheetId).eq('sheet_setup_state','connected').single();
    if(pError||!partner||!partner.webhook_token||!constantEqual(actual,String(partner.webhook_token)))return NextResponse.json({error:'Forbidden'},{status:403});
    const direction=tabGid===partner.our_tab_gid?'given':tabGid===partner.partner_tab_gid?'received':null;
    if(!direction)return NextResponse.json({error:'Unexpected tab'},{status:400});
    const {data:link,error:linkError}=await adminClient.from('collaboration_links').select('*').eq('id',recordId).eq('partner_id',partner.id).eq('direction',direction).single();
    if(linkError||!link)return NextResponse.json({error:'Record does not belong to this sheet'},{status:404});
    const status=normalizeCollabStatus(String(body.row[5]));
    if(!status)return NextResponse.json({error:'Invalid status'},{status:400});
    const [date,website,page,anchor,target]=body.row.map((v:unknown)=>String(v??'').trim());
    if(!website||!page||!anchor||!target)return NextResponse.json({error:'Website, Placement Page, Anchor, Target Link required'},{status:400});
    const {error}=await adminClient.from('collaboration_links').update({website,placement_page:page,anchor,target_url:target,status,sync_state:'synced',sync_error:null}).eq('id',recordId);
    if(error)throw error;
    await refreshCollaborationSummary(partner.id);
    await updateRequestFromCollaboration(recordId,status);
    return NextResponse.json({ok:true});
  }catch(e){console.error('[collab:webhook]',e);return NextResponse.json({error:'Sync failed'},{status:500});}
}
