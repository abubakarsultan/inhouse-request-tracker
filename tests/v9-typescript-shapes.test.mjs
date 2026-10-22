import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const collaboration = readFileSync(new URL('../services/collaboration.ts', import.meta.url), 'utf8');
const reporting = readFileSync(new URL('../services/operations-report.ts', import.meta.url), 'utf8');

test('collaboration RPC results have typed progress and check rows', () => {
  assert.match(collaboration, /const dealProgressRows:\s*CollaborationDealProgressRow\[\]/);
  assert.match(collaboration, /const linkChecks:\s*CollaborationLinkCheckRow\[\]/);
  assert.match(collaboration, /given_live:\s*Number\(row\.given_live/);
  assert.match(collaboration, /received_live:\s*Number\(row\.received_live/);
  assert.match(collaboration, /dealProgressRows,checks:linkChecks/);
});

test('monthly and team report arrays have explicit service return types', () => {
  assert.match(reporting, /getOperationsReport\(\):\s*Promise<OperationsReport>/);
  assert.match(reporting, /const months:\s*MonthRow\[\]/);
  assert.match(reporting, /const team:\s*TeamRow\[\]/);
  assert.match(reporting, /months:\s*MonthRow\[\]/);
  assert.match(reporting, /team:\s*TeamRow\[\]/);
});
