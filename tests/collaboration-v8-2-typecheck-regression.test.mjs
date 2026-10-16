import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(path.join(root,'services','collaboration.ts'),'utf8');

test('collaboration mutations use non-null validated results',()=>{
  assert.match(source,/const savedDeal\s*=\s*check\(data,error,'Could not create deal'\)/);
  assert.match(source,/return String\(savedDeal\.id\)/);
  assert.match(source,/const savedLink\s*=\s*check\(data,error,'Could not add link'\)/);
  assert.match(source,/syncCollaborationLink\(savedLink\.id\)/);
  assert.match(source,/return \{id:savedLink\.id,message\}/);
  assert.match(source,/const updatedLink\s*=\s*check\(data,error,'Link not found'\)/);
  assert.match(source,/refresh\(updatedLink\.partner_id\)/);
  assert.match(source,/const linkedRequest\s*=\s*check\(request,rError,'Request not found'\)/);
  assert.match(source,/linkedRequest\.created_by_user_id/);
});

test('retry sync uses current saved link status, not undefined newStatus',()=>{
  const retry=source.split('export async function retryCollaborationLinkSync')[1].split('export async function allocatePreviouslyGivenLink')[0];
  assert.match(retry,/select\('partner_id,status'\)/);
  assert.match(retry,/const link\s*=\s*check\(data,error,'Link not found'\)/);
  assert.match(retry,/updateRequestFromCollaboration\(linkId,String\(link\.status\)\)/);
  assert.doesNotMatch(retry,/\bnewStatus\b/);
});

test('partner create/connect uses validated partner values',()=>{
  assert.match(source,/const savedPartner\s*=\s*check\(partner,error,'Could not save partner'\)/);
  assert.match(source,/const validPartner\s*=\s*check\(partner,error,'Partner not found'\)/);
});
