import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptToken, decryptToken } from '../lib/token-crypto.ts';
import { validateReturnPath, createOAuthStateCookie, verifyOAuthStateCookie } from '../lib/google-oauth-state.ts';

const originalKey = process.env.TOKEN_ENCRYPTION_KEY;
const key = Buffer.alloc(32, 7).toString('base64');
test('Google token encryption round-trips and rejects tampering or wrong key', () => {
  process.env.TOKEN_ENCRYPTION_KEY = key;
  const encrypted = encryptToken('refresh-token-example');
  assert.equal(decryptToken(encrypted), 'refresh-token-example');
  const [iv, tag, ciphertext] = encrypted.split('.');
  const changed = `${iv}.${tag}.${ciphertext.slice(0, -2)}AA`;
  assert.throws(() => decryptToken(changed));
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
  assert.throws(() => decryptToken(encrypted), /decryption failed/);
  if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY; else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
});
test('Google OAuth return paths are same-site relative paths only', () => {
  assert.equal(validateReturnPath('/projects?tab=client'), '/projects?tab=client');
  for (const value of ['https://evil.example', '//evil.example', '/\\evil', '/x\r\nLocation:evil']) assert.equal(validateReturnPath(value), '/profile');
});
test('Google OAuth state cookie is signed, user-bound, and expires', () => {
  process.env.TOKEN_ENCRYPTION_KEY = key;
  const state = createOAuthStateCookie('user-123', '/projects');
  assert.deepEqual(verifyOAuthStateCookie(state.cookieValue, state.state, 'user-123'), { returnPath: '/projects' });
  assert.equal(verifyOAuthStateCookie(state.cookieValue, state.state, 'other-user'), null);
  assert.equal(verifyOAuthStateCookie(state.cookieValue + 'x', state.state, 'user-123'), null);
  if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY; else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
});
