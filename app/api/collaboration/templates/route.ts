import { NextRequest, NextResponse } from 'next/server';
import { requireAdminForAction } from '@/lib/auth';
import { csvTemplateZip } from '@/lib/collaboration-csv';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  try{
    await requireAdminForAction();
    const partner=new URL(request.url).searchParams.get('partner')||'Partner';
    const archive=csvTemplateZip(partner.slice(0,90));
    return new NextResponse(new Uint8Array(archive),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="collaboration-templates.zip"','Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Admin sign-in required'},{status:403});}
}
