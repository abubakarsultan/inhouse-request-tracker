import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Projects exposes four fixed categories and per-project sheet source controls', () => {
  const page = read('components/app/projects-browser.tsx');
  const form = read('components/app/project-form-dialog.tsx');
  const migration = read('database/migrations/010_project_sheet_sources_and_performance.sql');
  assert.match(page, /inhouse.*client.*onpage.*others/s);
  assert.match(form, /Guest Post Anchor/);
  assert.match(form, /Existing Google Sheet/);
  assert.match(form, /Tool Only/);
  assert.match(migration, /sheet_source text/);
  assert.match(migration, /guest_post_anchor.*own_sheet.*none/s);
});

test('Sheet integration is behind Sheet & Sync controls instead of being rendered on project pages', () => {
  const projectPage = read('app/(protected)/projects/[slug]/page.tsx');
  const dialog = read('components/app/project-sheet-settings-dialog.tsx');
  const settings = read('app/(protected)/settings/page.tsx');
  assert.match(projectPage, /ProjectSheetSettingsDialog/);
  assert.doesNotMatch(projectPage, /<textarea/);
  assert.match(dialog, /View Apps Script/);
  assert.match(dialog, /Create Missing Tab/);
  assert.match(settings, /SettingsScriptPanel/);
});

test('heavy pages use streaming/loading boundaries and list pages paginate', () => {
  const projects = read('app/(protected)/projects/page.tsx');
  const requests = read('app/(protected)/requests/page.tsx');
  const projectDetail = read('app/(protected)/projects/[slug]/page.tsx');
  const health = read('app/(protected)/health/page.tsx');
  const settings = read('components/app/settings-diagnostics.tsx');
  assert.match(projects, /<Suspense/);
  assert.match(requests, /getRequestsPage/);
  assert.match(requests, /<Pagination/);
  assert.match(projectDetail, /getProjectSites/);
  assert.match(projectDetail, /<Pagination/);
  assert.match(health, /<Suspense/);
  assert.match(settings, /fetch\('\/api\/diagnostics'/);
});
