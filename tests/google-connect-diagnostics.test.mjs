import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyGoogleConnectError } from '../lib/google-connect-error.ts';

const connect = await readFile(new URL('../app/api/google/connect/route.ts', import.meta.url), 'utf8');
const profile = await readFile(new URL('../app/(protected)/profile/page.tsx', import.meta.url), 'utf8');

test('missing site URL has its own error code', () => {
  assert.equal(classifyGoogleConnectError(new Error('NEXT_PUBLIC_SITE_URL must be a valid URL')), 'site_url_error');
});
test('missing Google client settings have their own error code', () => {
  assert.equal(classifyGoogleConnectError(new Error('Google OAuth is not configured')), 'oauth_credentials_error');
});
test('missing or invalid encryption key has its own error code', () => {
  assert.equal(classifyGoogleConnectError(new Error('TOKEN_ENCRYPTION_KEY must be configured')), 'encryption_key_error');
});
test('unknown provider error is safely redacted to generic code', () => {
  assert.equal(classifyGoogleConnectError(new Error('secret info and access token')), 'error');
});
test('OAuth connect uses classified errors, safe log reference and profile renders separate explanations', () => {
  assert.match(connect, /classifyGoogleConnectError\(error\)/);
  assert.match(connect, /\[google-drive-connect\]/);
  assert.doesNotMatch(connect, /console\.error\([^\n]*\berror\b/);
  assert.match(profile, /site_url_error:/);
  assert.match(profile, /oauth_credentials_error:/);
  assert.match(profile, /encryption_key_error:/);
  assert.match(profile, /href="\/profile"/);
});
