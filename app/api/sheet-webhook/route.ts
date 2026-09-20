import { NextResponse } from 'next/server';
import { applyStatusFromSheetWebhook } from '@/services/google-sheet-sync';

// The installable-trigger Apps Script (section 8) POSTs here on every edit
// to column F (Status) of a project tab in the team sheet. Body shape per
// the master prompt, section 8.1: { tab, row, website, anchor, status }.
export async function POST(req: Request) {
  const secret = req.headers.get('x-sheet-webhook-secret');
  if (!secret || secret !== process.env.SHEET_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { tab, row, website, anchor, status } = body ?? {};
  if (!tab || !row || !website || !anchor || !status) {
    return NextResponse.json({ error: 'tab, row, website, anchor and status are required' }, { status: 400 });
  }

  const result = await applyStatusFromSheetWebhook(String(tab), Number(row), String(website), String(anchor), String(status));
  return NextResponse.json(result);
}
