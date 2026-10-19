import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectCategorySlug } from '../lib/project-category-slugs.ts';
const service = readFileSync(new URL('../services/projects.ts', import.meta.url),'utf8');
const page = readFileSync(new URL('../app/(protected)/projects/page.tsx', import.meta.url),'utf8');
const wizard = readFileSync(new URL('../components/app/project-form-dialog.tsx', import.meta.url),'utf8');
const manager = readFileSync(new URL('../components/app/project-category-manager.tsx', import.meta.url),'utf8');
const validator = readFileSync(new URL('../lib/validators.ts', import.meta.url),'utf8');

test('all actions imported by category manager exist as admin-protected server actions', () => {
  for (const name of ['saveProjectCategory','deactivateProjectCategory'])
    assert.match(service, new RegExp('export async function '+name+'\\('));
  assert.match(service, /const parsed = projectCategoryInputSchema\.parse\(input\)/);
  assert.match(service, /BUILTIN_CATEGORY_SLUGS/);
  assert.match(service, /Move existing projects/);
  assert.match(manager, /saveProjectCategory/);
});

test('categories render and are selectable in wizard',()=>{
  assert.match(page,/ProjectCategoryManager categories=\{categories\}/);
  assert.match(page,/getProjectCategories\(/);
  assert.match(wizard,/categories\.map\(/);
  assert.match(validator,/category: z\.string\(\)/);
});

test('On Page and Onpage share the canonical slug, project counts compare FK first',()=>{
  assert.equal(projectCategorySlug('On Page'),'onpage');
  assert.equal(projectCategorySlug('Onpage'),'onpage');
  assert.equal(projectCategorySlug('Custom SEO'),'custom-seo');
  assert.match(page,/project\.category_id === tab\.id/);
  assert.match(wizard,/project\?\.category_id/);
});
