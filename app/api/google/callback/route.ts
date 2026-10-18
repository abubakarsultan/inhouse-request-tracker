import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { exchangeGoogleCode, storeGoogleConnection } from '@/lib/google-user-auth';
import { GOOGLE_OAUTH_STATE_COOKIE, verifyOAuthStateCookie } from '@/lib/google-oauth-state';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile().catch(() => null);
  const queryState = request.nextUrl.searchParams.get('state') || '';
  const state = verifyOAuthStateCookie(request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value, queryState, profile?.id || '');
  const clearCookie = (response: NextResponse) => { response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/google/callback', maxAge: 0 }); return response; };
  if (!profile || !state) return clearCookie(NextResponse.redirect(new URL('/profile?google=state_error', request.url)));
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return clearCookie(NextResponse.redirect(new URL(`${state.returnPath}?google=error`, request.url)));
  try {
    const connection = await exchangeGoogleCode(code);
    await storeGoogleConnection(profile.id, connection);
    const target = new URL(state.returnPath, request.url);
    target.searchParams.set('google', 'connected');
    return clearCookie(NextResponse.redirect(target));
  } catch (error) {
    const target = new URL(state.returnPath, request.url);
    target.searchParams.set('google', error instanceof Error && /refresh token/i.test(error.message) ? 'reconnect_required' : 'error');
    return clearCookie(NextResponse.redirect(target));
  }
}
