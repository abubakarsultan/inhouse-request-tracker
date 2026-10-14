import { NextResponse } from 'next/server';
import { getConnectionDiagnostics } from '@/services/diagnostics';
import { requireAdminForAction } from '@/lib/auth';

export async function GET() {
  try {
    await requireAdminForAction();
    const diagnostics = await getConnectionDiagnostics();
    return NextResponse.json({ ok: true, diagnostics }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Diagnostics unavailable.' }, { status: 403 });
  }
}
