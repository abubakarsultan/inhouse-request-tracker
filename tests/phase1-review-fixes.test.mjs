import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('project sheet dropdown uses exact application statuses', async () => {
  const source = await read('services/projects.ts');
  assert.match(source, /statusValues:\s*\['Request shared',\s*'Live',\s*'Rejected'\]/);
  assert.doesNotMatch(source, /statusValues:\s*\['Pending',\s*'Approved',\s*'Live',\s*'Rejected'\]/);
});

test('collaboration dropdown is driven by COLLAB_STATUSES', async () => {
  const source = await read('lib/collaboration-sheets.ts');
  assert.match(source, /statusValues:\s*\[\.\.\.COLLAB_STATUSES\]/);
  assert.doesNotMatch(source, /statusValues:\s*\['Pending',\s*'Live',\s*'Removed',\s*'Rejected'\]/);
});

test('project sheet creation checks Drive connection before inserting a draft and deletes failed drafts without IDs', async () => {
  const source = await read('services/projects.ts');
  const create = source.slice(source.indexOf('export async function createProject('), source.indexOf('export async function updateProject('));
  assert.ok(create.indexOf('getConnectionStatus(profile.id)') < create.indexOf(".from('projects').insert({"));
  assert.match(create, /if \(!persisted\?\.google_sheet_id\)\s*\{\s*await adminClient\.from\('projects'\)\.delete\(\)/);
});

test('OAuth callback URL requires explicit NEXT_PUBLIC_SITE_URL', async () => {
  const source = await read('lib/google-user-auth.ts');
  assert.match(source, /const base = process\.env\.NEXT_PUBLIC_SITE_URL\?\.trim\(\)/);
  assert.doesNotMatch(source, /process\.env\.SITE_URL\s*\|\|\s*process\.env\.VERCEL_PROJECT_PRODUCTION_URL/);
});

test('project retry repairs the stored spreadsheet ID instead of creating another', async () => {
  const source = await read('services/projects.ts');
  const retry = source.slice(source.indexOf('export async function retryProjectSheetSetup'), source.indexOf('export async function createSheetForExistingProject'));
  assert.match(retry, /repairServiceAccountAccess\(String\(project\.sheet_owner_user_id \|\| profile\.id\), String\(project\.google_sheet_id\)\)/);
  assert.doesNotMatch(retry, /createSpreadsheetForUser/);
});

test('directory-based team auth and last-active-admin protection exist', async () => {
  const auth = await read('lib/auth.ts');
  const team = await read('services/team.ts');
  assert.match(auth, /from\('team_directory'\)/);
  assert.doesNotMatch(auth, /const RANKVIZ_TEAM/);
  assert.match(team, /The last active admin cannot be demoted/);
  assert.match(team, /The last active admin cannot be disabled/);
});

test('Client Live Link preset maps placement page, anchor, target page and status', async () => {
  const source = await read('lib/project-sheet.ts');
  assert.match(source, /heading: 'Live Link', field: 'placement_page'/);
  assert.match(source, /heading: 'Anchor', field: 'anchor'/);
  assert.match(source, /heading: 'Target Page', field: 'target_url'/);
  assert.match(source, /heading: 'Status', field: 'status'/);
  assert.match(source, /record\.placement_page \|\| record\.approved_site/);
});

test('sheet Removed is a flag and does not become an application request status', async () => {
  const source = await read('services/google-sheet-sync.ts');
  assert.match(source, /payload\.status === 'Removed'/);
  assert.match(source, /sheet_flag: 'Removed'/);
  assert.match(source, /Sheet status is Removed; app request status preserved/);
});

test('Guest Post Anchor tab names reject Google Sheets forbidden characters and overlong names', async () => {
  const { validateGuestPostTabName } = await import('../lib/project-sheet.ts');
  assert.equal(validateGuestPostTabName('New Outreach Tab'), 'New Outreach Tab');
  for (const bad of ['bad/name','bad\\name','bad[name]','bad*name','bad?name','bad:name','']) assert.throws(() => validateGuestPostTabName(bad));
  assert.throws(() => validateGuestPostTabName('x'.repeat(101)));
});

test('migration 013 is additive, seeds the seven Rankviz accounts, and guards the last admin', async () => {
  const sql = await read('database/migrations/013_team_directory_and_access_flow.sql');
  assert.match(sql, /create table if not exists public\.team_directory/i);
  assert.match(sql, /on conflict \(email\) do update/i);
  for (const email of ['atiflatif@rankviz.com','rizwaniftikhar@rankviz.com','muhammadatif@rankviz.com','sohailahmad@rankviz.com','zunnorainali@rankviz.com','wasif@rankviz.com','abubakarsultan@rankviz.com']) assert.ok(sql.includes(email));
  assert.match(sql, /return '\{\}'::jsonb/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /The last active admin cannot be demoted or disabled/i);
});

test('Guest Post Anchor new-tab flow persists state and has a retry action', async () => {
  const projects = await read('services/projects.ts');
  const form = await read('components/app/project-form-dialog.tsx');
  assert.match(projects, /createGuestPostAnchorTab\(/);
  assert.match(projects, /export async function retryProjectTabSetup/);
  assert.match(form, /Create new tab in Guest Post Anchor/);
  assert.match(form, /create_new_tab: newTab/);
});
