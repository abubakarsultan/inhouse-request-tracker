import { NextRequest, NextResponse } from 'next/server';
import { requireActiveUserForAction } from '@/lib/auth';
import { adminClient } from '@/lib/supabase-admin';
import { linksCsv } from '@/lib/collaboration-csv';
export async function GET(req:NextRequest){
  try{
    const profile=await requireActiveUserForAction();
    const params=new URL(req.url).searchParams,partner=params.get('partner')||'',direction=params.get('direction')||'all';
    if(!/^[0-9a-f-]{36}$/i.test(partner)||!['all','given','received'].includes(direction))return NextResponse.json({error:'Invalid export filters'},{status:400});
    const {data:owner,error:ownerError}=await adminClient.from('collaboration_partners').select('id,created_by').eq('id',partner).maybeSingle();
    if(ownerError)throw ownerError;
    if(!owner)return NextResponse.json({error:'Partner not found'},{status:404});
    if(profile.role!=='admin'&&owner.created_by!==profile.id)return NextResponse.json({error:'You do not have access to this collaboration.'},{status:403});
    let query=adminClient.from('collaboration_links').select('created_at,website,placement_page,anchor,target_url,status,deal_id').eq('partner_id',partner).order('created_at',{ascending:false}).limit(5000);
    if(direction!=='all')query=query.eq('direction',direction);
    const {data,error}=await query;if(error)throw error;
    const {data:deals}=await adminClient.from('collaboration_deals').select('id,deal_ref').eq('partner_id',partner);
    const lookup=new Map((deals||[]).map(x=>[x.id,x.deal_ref]));
    const csv=linksCsv((data||[]).map(x=>({...x,deal_ref:lookup.get(x.deal_id)||''})));
    return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="collaboration-${direction}.csv"`,'Cache-Control':'no-store'}});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Export unavailable'},{status:500});}
}
