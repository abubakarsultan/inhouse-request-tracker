import { NextRequest, NextResponse } from 'next/server';
import { requireActiveUserForAction } from '@/lib/auth';
import { collaborationWorkbookTemplate } from '@/lib/collaboration-csv';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  try { await requireActiveUserForAction(); }
  catch { return NextResponse.json({error:'Sign in with an active team account to download templates.'},{status:403}); }
  try {
    const partner=new URL(request.url).searchParams.get('partner')||'Partner';
    const workbook=collaborationWorkbookTemplate(partner.slice(0,90));
    return new NextResponse(new Uint8Array(workbook),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="collaboration-template.xlsx"','Cache-Control':'no-store'}});
  } catch (error) {
    console.error('[collaboration:template] Workbook generation failed', error);
    return NextResponse.json({error:'Unable to generate collaboration workbook. Please retry or contact an administrator.'},{status:500});
  }
}
