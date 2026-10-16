import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describeProjectSaveError } from '../lib/project-save-error.ts';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('missing columns produce actionable migration guidance', () => {
  assert.match(describeProjectSaveError({code:'42703',message:'column "google_sheet_gid" of relation "projects" does not exist'}), /migrations 007 and 008/);
  assert.match(describeProjectSaveError({code:'PGRST204',message:'Could not find column'}), /migrations 007 and 008/);
});
test('duplicate tab / project errors are understandable', () => {
  assert.match(describeProjectSaveError({code:'23505',message:'duplicate key value violates unique constraint'}), /already exists/);
  assert.match(describeProjectSaveError(new Error('This Google Sheet tab already belongs to Other Project. Choose a different tab to avoid conflicting status updates.')), /Other Project/);
});
test('unknown errors never expose server-only secrets in the browser', () => {
  const text = describeProjectSaveError({message:'private_key=secret-password; SQL connection string=secret'});
  assert.doesNotMatch(text,/secret-password/);
  assert.match(text,/Runtime Logs/);
});
test('legacy server action wrappers still handle errors for backwards compatibility', () => {
  const service = read('services/projects.ts');
  assert.match(service,/export async function createProjectWithFeedback/);
  assert.match(service,/export async function updateProjectWithFeedback/);
  assert.match(service,/console\.error\('\[project:save\] create failed:'/);
});
