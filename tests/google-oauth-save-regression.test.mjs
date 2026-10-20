import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../lib/google-user-auth.ts', import.meta.url), 'utf8');
const callback = await readFile(new URL('../app/api/google/callback/route.ts', import.meta.url), 'utf8');
const profile = await readFile(new URL('../app/(protected)/profile/page.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../database/migrations/012_per_user_google_drive_and_access.sql', import.meta.url), 'utf8');

test('OAuth scopes serialized to the text type defined in migration 012', () => {
  assert.match(migration, /scopes text[ ,\n]/i);
  assert.match(auth, /scopes: connection\.scopes\.join\(' '\)/);
});
test('Callback distinguishes token exchange and Supabase storage failures without logging secrets', () => {
  assert.match(callback, /step = 'supabase_connection_save'/);
  assert.match(callback, /\[google-drive-oauth\]/);
  assert.match(callback, /storage_error/);
  assert.match(callback, /token_error/);
  assert.doesNotMatch(callback, /console\.error\([^\n]*\berror\b/);
  assert.match(profile, /google_ref/);
});
