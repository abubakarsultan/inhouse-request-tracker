import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(p)=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('project and partner archive actions enforce admin authorization',()=>{
  const projects=source('services/projects.ts');
  const collab=source('services/collaboration.ts');
  assert.match(projects,/export async function setProjectArchived/);
  assert.match(projects,/export async function deleteEmptyProject/);
  assert.match(collab,/export async function setCollaborationPartnerArchived/);
  assert.match(collab,/export async function deleteEmptyCollaborationPartner/);
  for(const content of [projects,collab]) assert.match(content,/requireAdminForAction/);
});
test('destructive actions check related records and leave Google Sheets untouched',()=>{
  const projects=source('services/projects.ts');const collab=source('services/collaboration.ts');
  assert.match(projects,/from\('requests'\).*select\('id'/s);
  assert.match(projects,/from\('project_sites'\)/);
  assert.match(collab,/from\('collaboration_links'\).*select\('id'/s);
  assert.match(collab,/from\('collaboration_deals'\).*select\('id'/s);
  assert.doesNotMatch(source('components/app/admin-record-actions.tsx'),/deleteSpreadsheet|drive\.files\.delete/);
});
test('team collaborator accordion exposes owner grouping and partner details',()=>{
  const page=source('app/(protected)/collaborations/page.tsx');
  const view=source('components/app/collaboration-team-directory.tsx');
  assert.match(page,/teamMembers/); assert.match(page,/CollaborationTeamDirectory/);
  assert.match(view,/members\.map|for\(const member of members\)/);
  assert.match(view,/aria-expanded/); assert.match(view,/Open partner details/);
  assert.match(view,/Show archived/);
  assert.match(source('services/collaboration.ts'),/This collaboration is archived/);
});
test('projects support archived view and management actions',()=>{
  const projects=source('app/(protected)/projects/page.tsx');
  assert.match(projects,/view === 'archived'/);
  assert.match(projects,/AdminRecordActions/);
  assert.match(projects,/Active projects/);
  assert.match(projects,/Archived projects/);
});
test('admin page presents focused tabs and interactions have focus/hover',()=>{
  assert.match(source('app/(protected)/team/page.tsx'),/AdminTeamTabs/);
  const tabs=source('components/app/admin-team-tabs.tsx');
  assert.match(tabs,/role="tablist"/);assert.match(tabs,/Access & directory/);
  const actions=source('components/app/admin-record-actions.tsx');
  assert.match(actions,/typed\.trim\(\)!==name/);assert.match(actions,/aria-modal="true"/);
  assert.match(source('app/globals.css'),/focus-visible/);
});
