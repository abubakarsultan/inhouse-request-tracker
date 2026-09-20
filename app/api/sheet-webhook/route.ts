import { NextResponse } from 'next/server';
import { applyStatusFromSheet } from '@/services/google-sheet-sync';
import { parseSheetWebhookPayload } from '@/lib/sheet-webhook';

export async function POST(req: Request) {
  const configuredSecret = process.env.SHEET_WEBHOOK_SECRET;
  const secret = req.headers.get('x-sheet-webhook-secret');
  if (!configuredSecret || !secret || secret !== configuredSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseSheetWebhookPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await applyStatusFromSheet(parsed.value);
    if (!result.ok) return NextResponse.json(result, { status: result.notFound ? 404 : 500 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook failed' }, { status: 500 });
  }
}
