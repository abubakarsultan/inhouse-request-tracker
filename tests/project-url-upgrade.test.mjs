import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGoogleSheetUrl, buildGoogleSheetUrl } from '../lib/google-sheet-url.ts';
import { parseSheetWebhookPayload, buildProjectTriggerSnippet } from '../lib/sheet-webhook.ts';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('extracts sheet id + exact gid from URL, and preserves selected tab', () => {
  const id = '1aBcD_eFgH-0123456789Abc';
  assert.deepEqual(parseGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing#gid=1234`), { spreadsheetId: id, gid: 1234 });
  assert.deepEqual(parseGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit`), { spreadsheetId: id, gid: null });
  assert.equal(buildGoogleSheetUrl(id, 1234), `https://docs.google.com/spreadsheets/d/${id}/edit#gid=1234`);
  assert.throws(() => parseGoogleSheetUrl('https://docs.google.com.evil.example/spreadsheets/d/xyz/edit'));
  assert.throws(() => parseGoogleSheetUrl('https://docs.google.com/spreadsheets/d/abc/edit#gid=xyz'));
  assert.throws(() => parseGoogleSheetUrl('https://evil.example/a'));
});

test('project form asks for URL, and shows service account email to share as Editor', () => {
  const form = read('components/app/project-form-dialog.tsx');
  assert.match(form, /Google Sheet URL/);
  assert.match(form, /Share existing sheet with the sync service account/);
  assert.match(form, /serviceAccountEmail/);
  assert.doesNotMatch(form, /name="google_sheet_id"/);
});

test('sheet webhook sends sheet ID and parses it; old team webhook remains compatible', () => {
  const id = '1aBcD_eFgH-0123456789Abc';
  const script = buildProjectTriggerSnippet('https://example.com', { sheet_source: 'custom_sheet', google_sheet_id: id, guest_post_tab_name: 'Sheet1' });
  assert.match(script, /PROJECT_SPREADSHEET_ID/);
  assert.match(script, /spreadsheetId: PROJECT_SPREADSHEET_ID/);
  const legacy = parseSheetWebhookPayload({ tab: 'GetProLinks', row: 2, website: 'example.org', anchor: 'A', status: 'Live' });
  assert.equal(legacy.ok, true);
  const custom = parseSheetWebhookPayload({ tab: 'Sheet1', spreadsheetId: id, row: 2, website: 'example.org', anchor: 'A', status: 'Live' });
  assert.equal(custom.ok && custom.value.spreadsheetId, id);
  assert.equal(parseSheetWebhookPayload({ tab: 'Sheet1', spreadsheetId: '../bad', row: 2, website: 'example.org', anchor: 'A', status: 'Live' }).ok, false);
});

test('navigation speeds do not scan all request rows', () => {
  assert.match(read('services/projects.ts'), /project_request_status_counts/);
  assert.doesNotMatch(read('services/projects.ts'), /for \(let from = 0; ; from \+= 1000\)/);
  assert.match(read('services/sites.ts'), /\.range\(from, from \+ size - 1\)/);
  assert.match(read('services/requests.ts'), /getRequests\(filters\?.*pageSize = 50/);
  const migration = read('database/migrations/008_project_url_speed.sql');
  assert.match(migration, /find_request_from_sheet_scoped/);
  assert.match(migration, /p\.google_sheet_id = p_sheet_id/);
});


test('health relink supplies required sync_enabled to SyncableProject', () => {
  const health = read('services/health.ts');
  assert.ok(health.includes(".select('id,approved_site,anchor,team_tab,team_row,projects(id,google_sheet_id,sheet_source,column_mapping,guest_post_tab_name,sync_enabled),project_sites(id)')"));
  assert.match(read('services/google-sheet-sync.ts'), /type SyncableProject = \{[\s\S]*?sync_enabled: boolean;/);
});
