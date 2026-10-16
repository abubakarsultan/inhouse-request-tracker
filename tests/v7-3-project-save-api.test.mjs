import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('project create/update uses dedicated JSON route rather than RSC action transport', () => {
  const ui = read('components/app/project-form-dialog.tsx');
  const route = read('app/api/projects/save/route.ts');
  assert.match(ui, /fetch\('\/api\/projects\/save'/);
  assert.match(ui, /credentials: 'same-origin'/);
  assert.match(ui, /JSON\.stringify\(\{ mode: isEdit/);
  assert.doesNotMatch(ui, /await (createProjectWithFeedback|updateProjectWithFeedback)\(/);
  assert.match(route, /createProject\(projectInput\.data\)/);
  assert.match(route, /updateProject\(body\.projectId as string, projectInput\.data\)/);
});

test('save API enforces origin and schema validation and retains admin authorization in service', () => {
  const route = read('app/api/projects/save/route.ts');
  const service = read('services/projects.ts');
  assert.match(route, /headers\.get\('origin'\)/);
  assert.match(route, /new URL\(origin\)\.host/);
  assert.match(route, /projectSchema\.safeParse/);
  assert.match(route, /'Cache-Control': 'no-store'/);
  assert.match(service, /export async function createProject\(input: ProjectInput\) \{\s+const profile = await requireAdminForAction\(\)/);
  assert.match(service, /export async function updateProject\(id: string, input: ProjectInput\) \{\s+await requireAdminForAction\(\)/);
});

test('save API always returns sanitized feedback with a log reference', () => {
  const route = read('app/api/projects/save/route.ts');
  const ui = read('components/app/project-form-dialog.tsx');
  assert.match(route, /describeProjectSaveError\(error\)/);
  assert.match(route, /console\.error\(`\[project:save\]\[\$\{traceId\}\]/);
  assert.match(route, /reference: traceId/);
  assert.match(ui, /Reference: \$\{result\.reference\}/);
  assert.match(ui, /HTTP \$\{response\.status\}/);
});
