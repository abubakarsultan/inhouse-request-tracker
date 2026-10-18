import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'google_drive_oauth_state';
function secret() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || Buffer.from(value, 'base64').length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be configured as base64 for 32 random bytes.');
  return value;
}
export function validateReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n\u0000-\u001f]/.test(value)) return '/profile';
  try { const parsed = new URL(value, 'https://local.invalid'); if (parsed.origin !== 'https://local.invalid') return '/profile'; } catch { return '/profile'; }
  return value;
}
export function createOAuthStateCookie(userId: string, returnPath: string) {
  const state = randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ state, userId, returnPath: validateReturnPath(returnPath), issuedAt: Date.now() })).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return { state, cookieValue: `${payload}.${signature}`, cookieName: COOKIE };
}
export function verifyOAuthStateCookie(cookieValue: string | undefined, queryState: string, userId: string) {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', secret()).update(parts[0]).digest();
  let actual: Buffer;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { state: string; userId: string; returnPath: string; issuedAt: number };
    if (payload.userId !== userId || payload.state !== queryState || !Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 30_000) return null;
    return { returnPath: validateReturnPath(payload.returnPath) };
  } catch { return null; }
}
export const GOOGLE_OAUTH_STATE_COOKIE = COOKIE;
