import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { classifyGoogleConnectError } from '@/lib/google-connect-error';
import { getCurrentProfile } from '@/lib/auth';
import { requireActiveUserForAction } from '@/lib/auth';
import { createGoogleConsentUrl } from '@/lib/google-user-auth';
import { createOAuthStateCookie, GOOGLE_OAUTH_STATE_COOKIE, validateReturnPath } from '@/lib/google-oauth-state';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const profile = await requireActiveUserForAction();
    const returnPath = validateReturnPath(request.nextUrl.searchParams.get('return') || '/profile');
    const { state, cookieValue } = createOAuthStateCookie(profile.id, returnPath);
    const response = NextResponse.redirect(createGoogleConsentUrl(state));
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, cookieValue, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/google/callback', maxAge: 600 });
    return response;
  } catch (error) {
    const profile = await getCurrentProfile().catch(() => null);
    const code = classifyGoogleConnectError(error);
    const reference = randomUUID().slice(0, 8);
    // Only log a safe category; never log Google tokens, credentials, or full provider errors.
    console.error(`[google-drive-connect][${reference}]`, { code });
    const destination = profile ? new URL('/profile', request.url) : new URL('/login', request.url);
    if (profile) {
      destination.searchParams.set('google', code);
      destination.searchParams.set('google_ref', reference);
    }
    return NextResponse.redirect(destination);
  }
}
