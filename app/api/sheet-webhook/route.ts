import { NextResponse } from 'next/server';
import { applyStatusFromSheet } from '@/services/google-sheet-sync';

// Paste the Apps Script snippet from the README into the Guest Post
// Anchor sheet (Extensions > Apps Script) to call this on every edit to
// the Status column. This is what makes the sheet -> app half of the
// two-way sync real-time instead of a manual "pull" button.
export async function POST(req: Request) {
  const secret = req.headers.get('x-sheet-webhook-secret');
  if (!secret || secret !== process.env.SHEET_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { projectId, website, status, sheetName, sheetRow } = body ?? {};
  if (!projectId || !website || !status) {
    return NextResponse.json({ error: 'projectId, website and status are required' }, { status: 400 });
  }

  const result = await applyStatusFromSheet(projectId, website, status, sheetName ?? '', Number(sheetRow) || 0);
  return NextResponse.json(result);
}
