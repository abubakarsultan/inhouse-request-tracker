import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('final migration keeps the roster to the exact seven approved names', () => {
  const sql = read('database/migrations/005_final_workflow_upgrade.sql');
  for (const name of ['M.ATIF', 'Wasif', 'Atif latif', 'Sohail Ahmad', 'Rizwan', 'Abubakar', 'Zunnorain Ali']) assert.match(sql, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(sql, /update team_names set active = false/i);
  assert.match(sql, /abubakar sultan/i);
});

test('same project plus normalized domain is protected at service and database levels', () => {
  const sql = read('database/migrations/005_final_workflow_upgrade.sql');
  const requests = read('services/requests.ts');
  assert.match(sql, /find_project_domain_usage/);
  assert.match(sql, /enforce_project_domain_unique/);
  assert.match(sql, /r\.project_id = new\.project_id/);
  assert.match(requests, /assertProjectDomainAvailable/);
  assert.match(requests, /Each project can use a website only once/);
});

test('request form hard-blocks used project domains with no Save Anyway path', () => {
  const form = read('components/app/request-form.tsx');
  assert.match(form, /project=\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(form, /disabled=\{pending \|\| Boolean\(siteHint\?\.used\)\}/);
  assert.doesNotMatch(form, /Save anyway/i);
});

test('Rejected, edit/archive and creator email are wired into final workflow', () => {
  const validators = read('lib/validators.ts');
  const actions = read('components/app/request-actions.tsx');
  const sheets = read('services/google-sheet-sync.ts');
  assert.match(validators, /'Rejected'/);
  assert.match(actions, /archiveRequest/);
  assert.match(actions, /\/requests\/\$\{id\}\/edit/);
  assert.match(sheets, /Created By Email/);
  assert.match(sheets, /created_by_email/);
});

test('team admin exposes approvals and invalid-assignment reassignment', () => {
  const panel = read('components/app/team-admin-panel.tsx');
  assert.match(panel, /Google name/);
  assert.match(panel, /Rankviz email/);
  assert.match(panel, /Approve & link data/);
  assert.match(panel, /Invalid assignments/);
  assert.match(panel, /reassignHistoricalName/);
  assert.doesNotMatch(panel, /Add exact sheet name/);
});
