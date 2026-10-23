import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Create Project returns slug for post-save route without exposing secrets', () => {
  const service = read('services/projects.ts');
  const route = read('app/api/projects/save/route.ts');
  assert.match(service, /return \{ slug \}/);
  assert.match(route, /slug: created\.slug/);
  assert.doesNotMatch(route, /SHEET_WEBHOOK_SECRET/);
});

test('Wizard routes new projects to guide but keeps existing edits in place', () => {
  const wizard = read('components/app/project-form-dialog.tsx');
  assert.match(wizard, /!isEdit && result\.slug/);
  assert.match(wizard, /\/sheet-setup/);
  assert.match(wizard, /router\.refresh\(\)/);
});

test('Guide is admin-only and avoids duplicate shared Guest Post Anchor trigger', () => {
  const page = read('app/(protected)/projects/[slug]/sheet-setup/page.tsx');
  assert.match(page, /profile\.role !== 'admin'/);
  assert.match(page, /Do not install a second project-specific trigger/);
  assert.match(page, /project\.sheet_source === 'guest_post_anchor'/);
});

test('Project cards link directly to the real spreadsheet, never a placeholder', () => {
  const projects = read('app/(protected)/projects/page.tsx');
  assert.match(projects, /buildGoogleSheetUrl\(project\.google_sheet_id/);
  assert.match(projects, /Open Sheet <ExternalLink/);
  assert.match(projects, /noopener noreferrer/);
});

test('Manual guide is English, includes secret and trigger warnings', () => {
  const guide = read('components/app/project-sheet-setup-instructions.tsx');
  for (const step of ['Open your Google Sheet','Paste and save the script','Configure the webhook secret','Install the edit trigger','Verify status synchronization']) assert.ok(guide.includes(step));
  assert.match(guide, /Creating or connecting the spreadsheet does not automatically install/);
  assert.doesNotMatch(guide, /mark as verified|setup complete automatically/i);
});
