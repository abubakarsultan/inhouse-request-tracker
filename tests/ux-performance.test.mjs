import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('sidebar exposes My Requests for members and admins and labels company list All Requests', () => {
  const sidebar = read('components/sidebar.tsx');
  assert.match(sidebar, /\['My Requests', '\/my-requests'/);
  assert.match(sidebar, /\['All Requests', '\/requests'/);
});

test('My Requests has server filters, pagination and loading feedback', () => {
  const view = read('components/app/my-requests-view.tsx');
  assert.match(view, /Search website, anchor, target URL, project/);
  assert.match(view, /All projects/);
  assert.match(view, /All priorities/);
  assert.match(view, /Imported from Sheet/);
  assert.match(view, /Previous/);
  assert.match(view, /Next →/);
  const loading = read('app/(protected)/my-requests/loading.tsx');
  assert.match(loading, /skeleton/);
});

test('performance migration adds dashboard and paginated member RPCs plus active indexes', () => {
  const sql = read('database/migrations/006_my_requests_performance.sql');
  assert.match(sql, /create or replace function get_member_dashboard/i);
  assert.match(sql, /create or replace function get_member_requests_page/i);
  assert.match(sql, /create or replace function get_admin_dashboard/i);
  assert.match(sql, /create or replace function get_admin_team_attention/i);
  assert.match(sql, /requests_assigned_user_created_active_idx/i);
});

test('normal profile reads no longer upsert on every protected navigation', () => {
  const auth = read('lib/auth.ts');
  const currentStart = auth.indexOf('export const getCurrentProfile');
  const currentBlock = auth.slice(currentStart, auth.indexOf('export async function requireAuthenticatedProfile', currentStart));
  assert.doesNotMatch(currentBlock, /\.upsert\(/);
  assert.match(auth, /cache\(async/);
});
