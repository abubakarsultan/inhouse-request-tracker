import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../database/migrations/012_per_user_google_drive_and_access.sql', import.meta.url), 'utf8');
const guide = await readFile(new URL('../UPGRADE_GUIDE.md', import.meta.url), 'utf8');

test('migration includes per-user connection and access-request tables', () => {
  assert.match(migration, /create table if not exists user_google_connections/i);
  assert.match(migration, /create table if not exists access_requests/i);
  assert.match(migration, /create table if not exists user_role_name_audit/i);
});
test('invitation is accepted after first profile creation', () => {
  assert.match(auth, /accepted_user_id: user\.id/);
  assert.match(auth, /if \(invitation\?\.id\)/);
  assert.match(auth, /Existing profiles are authoritative/);
});
test('guide warns about secrets and describes rollback', () => {
  assert.match(guide, /TOKEN_ENCRYPTION_KEY/);
  assert.match(guide, /Rollback plan/);
});
