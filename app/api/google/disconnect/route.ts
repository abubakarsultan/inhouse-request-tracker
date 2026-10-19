import { NextRequest, NextResponse } from 'next/server';
import { requireActiveUserForAction } from '@/lib/auth';
import { disconnectGoogleDrive } from '@/lib/google-user-auth';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  if (!origin || new URL(origin).host.toLowerCase() !== host.toLowerCase()) return NextResponse.json({ ok: false, message: 'Invalid request origin.' }, { status: 403 });
  try { const profile = await requireActiveUserForAction(); await disconnectGoogleDrive(profile.id); return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ ok: false, message: 'Could not disconnect Google Drive. Refresh and sign in again.' }, { status: 400 }); }
}
