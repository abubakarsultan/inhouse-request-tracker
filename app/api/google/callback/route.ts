import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
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
  let step: 'google_token_exchange' | 'supabase_connection_save' = 'google_token_exchange';
  try {
    const connection = await exchangeGoogleCode(code);
    step = 'supabase_connection_save';
    await storeGoogleConnection(profile.id, connection);
    const target = new URL(state.returnPath, request.url);
    target.searchParams.set('google', 'connected');
    return clearCookie(NextResponse.redirect(target));
  } catch (error) {
    // Keep OAuth codes, tokens and provider response objects out of logs.
    // The reference ID lets an administrator correlate the user-visible failure
    // with a safe, non-sensitive stage and error category in Vercel logs.
    const ref = randomUUID().slice(0, 8);
    const message = error instanceof Error ? error.message : '';
    const category = /TOKEN_ENCRYPTION_KEY/i.test(message) ? 'token_encryption_configuration'
      : /Could not save Google Drive connection/i.test(message) ? 'database_save'
      : /invalid_client/i.test(message) ? 'invalid_client'
      : /invalid_grant/i.test(message) ? 'invalid_grant'
      : /refresh token/i.test(message) ? 'missing_refresh_token'
      : 'unknown';
    console.error(`[google-drive-oauth][${ref}]`, { step, category });
    const target = new URL(state.returnPath, request.url);
    target.searchParams.set('google', category === 'missing_refresh_token' ? 'reconnect_required'
      : step === 'supabase_connection_save' ? 'storage_error' : 'token_error');
    target.searchParams.set('google_ref', ref);
    return clearCookie(NextResponse.redirect(target));
  }
}
