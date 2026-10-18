import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('UI category labels map to live database slugs (On Page = onpage)', async () => {
  const { projectCategorySlug } = await import('../lib/project-category-slugs.ts');
  assert.equal(projectCategorySlug('Inhouse'), 'inhouse');
  assert.equal(projectCategorySlug('Client'), 'client');
  assert.equal(projectCategorySlug('On Page'), 'onpage');
  assert.equal(projectCategorySlug('Others'), 'others');
});

test('create and update both resolve and save category_id UUID, not a hardcoded ID', () => {
  const src = read('services/projects.ts');
  assert.match(src, /from\('project_categories'\)/);
  assert.match(src, /\.eq\('slug', slug\)/);
  assert.match(src, /\.eq\('active', true\)/);
  assert.match(src, /\.maybeSingle\(\)/);
  assert.equal((src.match(/category_id: categoryId/g) || []).length, 3);
  assert.equal((src.match(/await resolveProjectCategoryId\(parsed\.category\)/g) || []).length, 2);
  assert.match(src, /const categoryId = await resolveProjectCategoryId\(parsed\.category\);[\s\S]*?const sheet = \(parsed\.create_new_sheet \|\| parsed\.create_new_tab\) \? null : await resolveProjectSheet\(parsed, undefined, profile\.id\)/);
  assert.doesNotMatch(src, /category_id: ['"][0-9a-f]{8}-/);
});

test('missing category gives readable remediation, no silent fallback', () => {
  const src = read('services/projects.ts');
  const feedback = read('lib/project-save-error.ts');
  assert.match(src, /category is missing or inactive\. Apply project category migration 009/);
  assert.match(feedback, /category is missing or inactive/);
});

test('database migration adds missing Others without rewriting existing category IDs or Sheets', () => {
  const sql = read('database/migrations/009_project_category_ids.sql');
  assert.match(sql, /'Others', 'others'/);
  assert.match(sql, /on conflict \(slug\) do nothing/i);
  assert.match(sql, /where p\.category_id is null/i);
  assert.match(sql, /when 'on page' then 'onpage'/i);
  assert.match(sql, /alter table public\.projects alter column category_id set not null/i);
  assert.doesNotMatch(sql, /delete from|truncate|drop table/i);
});
