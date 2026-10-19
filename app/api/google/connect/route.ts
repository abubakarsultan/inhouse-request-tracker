import { NextRequest, NextResponse } from 'next/server';
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
    const code = error instanceof Error && /NEXT_PUBLIC_SITE_URL|Google OAuth is not configured/i.test(error.message) ? 'configuration_error' : 'error';
    return NextResponse.redirect(new URL(profile ? `/profile?google=${code}` : '/login', request.url));
  }
}
