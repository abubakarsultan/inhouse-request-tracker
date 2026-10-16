import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Create Request loads correct project-specific Google Sheet destination and mapping', () => {
  const src = read('services/requests.ts');
  const query = src.match(/export async function createRequest\([\s\S]*?\.from\('projects'\)\s*\.select\('([^']+)'\)/)?.[1];
  assert.ok(query, 'Create Request should load the selected project from DB');
  for (const name of ['google_sheet_id','sheet_source','guest_post_tab_name','column_mapping','sync_enabled']) {
    assert.ok(query.split(',').includes(name), `Required project field missing: ${name}`);
  }
  assert.match(src, /await appendRequestToTeamSheet\(project, sheetRecord, projectSite\.id\)/);
});

test('New requests pass mapped dynamic values including target URL, priority and creator email', () => {
  const src = read('services/requests.ts');
  const section = src.split('const sheetRecord: RequestSheetRecord =')[1].split('const sync = await')[0];
  for (const name of ['target_url', 'priority', 'deadline', 'created_by_name', 'created_by_email', 'project_name', 'created_at']) {
    assert.match(section, new RegExp(`${name}:`));
  }
});

test('Incorrect tab is retryable error and custom project sheet ID is not replaced with global Team Sheet ID', () => {
  const src = read('services/google-sheet-sync.ts');
  assert.match(src, /project\?\.sheet_source === 'custom_sheet'/);
  assert.match(src, /return String\(project\.google_sheet_id \|\| ''\)\.trim\(\)/);
  assert.match(src, /This project has no Google Sheet tab configured/);
  assert.match(src, /does not exist in this project.s connected Google Sheet/);
  assert.match(src, /state: 'failed',\s*text: `❌ \$\{reason\} Request is saved in the app\.`/);
});

test('Saved-only requests can be retried without creating a second request or duplicate Sheet row', () => {
  const actions = read('components/app/request-actions.tsx');
  const requestForm = read('components/app/request-form.tsx');
  const sync = read('services/google-sheet-sync.ts');
  assert.match(actions, /<RetrySyncButton requestId=\{id\}/);
  assert.match(requestForm, /result\.summary\.client/);
  assert.match(sync, /matchingIndex >= 1/);
  assert.match(sync, /avoided duplicate Sheet append/);
});

test('New Request page reports per-project sync target, not fixed Guest Post Anchor H column', () => {
  const page = read('app/(protected)/requests/new/page.tsx');
  const form = read('components/app/request-form.tsx');
  assert.doesNotMatch(page, /mirrored to column H in Guest Post Anchor/);
  assert.match(form, /Sheet target:/);
  assert.match(form, /Google Sheet connection is incomplete/);
});
