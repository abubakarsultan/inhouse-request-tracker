import { NextRequest, NextResponse } from 'next/server';
export async function POST(request: NextRequest) {
  let mode: unknown;
  try { mode = (await request.json()).mode; } catch { return NextResponse.json({ error: 'Invalid sign-in mode.' }, { status: 400 }); }
  if (mode !== 'rankviz' && mode !== 'google') return NextResponse.json({ error: 'Invalid sign-in mode.' }, { status: 400 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set('inhouse_signin_mode', mode, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/auth/callback', maxAge: 600 });
  return response;
}
