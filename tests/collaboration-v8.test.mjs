import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLLAB_HEADERS, COLLAB_SUMMARY_HEADERS, cleanTabName, partnerTabName, dealProgress, partnerMetrics, validateCollabHeaders, normalizeCollabStatus } from '../lib/collaboration-core.ts';
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
test('CSV template column headings are consistent across both link tabs',()=>{
  assert.deepEqual(COLLAB_HEADERS,['Date','Website','Placement Page','Anchor','Target Link','Status','Exchange ID']);
  assert.deepEqual(COLLAB_SUMMARY_HEADERS,['Metric','Our Links','Partner Links']);
  assert.equal(validateCollabHeaders([...COLLAB_HEADERS,'Record ID']),true);
  assert.equal(validateCollabHeaders(['Date','Anchor']),false);
  assert.equal(partnerTabName('John / SEO'), 'John SEO');
  assert.equal(cleanTabName('Summary'), 'Summary');
});
test('2-for-1 deal only completes after both sides are Live',()=>{
  const deal={id:'d1',give_required:2,receive_required:1,state:'open'};
  const links=[{deal_id:'d1',direction:'given',status:'Live'},{deal_id:'d1',direction:'given',status:'Rejected'},{deal_id:'d1',direction:'received',status:'Live'}];
  assert.deepEqual(dealProgress(deal,links),{liveGiven:1,liveReceived:1,giveRemaining:1,receiveRemaining:0,completed:false});
  assert.equal(dealProgress(deal,[...links,{deal_id:'d1',direction:'given',status:'Live'}]).completed,true);
});
test('advance exchange remains a genuine outstanding obligation',()=>{
  const deal={id:'advance',give_required:1,receive_required:1,state:'open'};
  const metrics=partnerMetrics([deal],[{deal_id:'advance',direction:'received',status:'Live'}]);
  assert.equal(metrics.receivedLive,1);assert.equal(metrics.givenOutstanding,1);assert.equal(metrics.openDeals,1);
  assert.equal(metrics.completedDeals,0);
});
test('prior unallocated Live link cannot be counted twice',()=>{
  const sql=read('database/migrations/010_collaboration_module.sql');
  assert.match(sql,/status='Live' and deal_id is null/);
  assert.match(sql,/request_id uuid unique/);
  assert.match(sql,/revoke all on function public\.create_collaboration_from_request/);
  assert.match(sql,/raise exception 'Collaboration deal does not belong to link partner'/);
});
test('one three-tab Excel template plus Google automatic creation, manual connect and headings checks are implemented',()=>{
  const setup=read('lib/collaboration-sheets.ts');
  const zip=read('lib/collaboration-csv.ts');
  const wizard=read('components/app/collaboration/partner-wizard.tsx');
  assert.match(zip,/collaborationWorkbookTemplate/);assert.match(zip,/book_append_sheet\(workbook, sheet, tab\)/);assert.match(zip,/book_append_sheet\(workbook, summary, 'Summary'\)/);
  assert.match(wizard,/Download Collaboration Template \(\.xlsx\)/);assert.match(wizard,/Google Drive → New → File upload/);
  assert.match(setup,/spreadsheets\.create/);assert.match(setup,/validateCollabHeaders/);
  assert.match(setup,/Record ID/);assert.match(setup,/refreshCollaborationSummary/);
});
test('Google inbound webhook requires partner specific token and verifies spreadsheet and tab',()=>{
  const source=read('app/api/collaboration/webhook/route.ts');
  assert.match(source,/constantEqual\(actual,String\(partner\.webhook_token\)\)/);
  assert.match(source,/tabGid===partner\.our_tab_gid/);
  assert.match(source,/recordId/);
  assert.equal(normalizeCollabStatus('REQUEST SHARED'),'Pending');
});
test('request form can link collaborations without replacing normal request save or Guest Post Anchor flow',()=>{
  const form=read('components/app/request-form.tsx');
  assert.match(form,/attachRequestToCollaboration/);
  assert.match(form,/savedRequestId \? result! : await createRequest/);
  assert.match(form,/Retry Collaboration Linking/);
  assert.match(form,/Placement Page is required for collaboration requests/);
  const sql=read('database/migrations/010_collaboration_module.sql');
  assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.requests\b/i);
  assert.doesNotMatch(sql,/\bupdate\s+public\.projects\b/i);
});
