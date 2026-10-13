import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSheetTabName, getIncompleteFields } from '../lib/validators.ts';
import { parseSheetWebhookPayload } from '../lib/sheet-webhook.ts';

test('Google Sheets tab names enforce Google restrictions', () => {
  assert.equal(validateSheetTabName('Client Live Links'), null);
  assert.match(validateSheetTabName('Bad/Tab') ?? '', /cannot contain/);
  assert.match(validateSheetTabName('x'.repeat(101)) ?? '', /100 characters/);
});

test('incomplete helper lists the required missing fields', () => {
  assert.deepEqual(getIncompleteFields({ approved_site: 'example.com', target_url: '', anchor: '', assign_to: '', deadline: '' }), ['Target URL', 'Anchor', 'Assigned person', 'Deadline']);
  assert.deepEqual(getIncompleteFields({ approved_site: 'example.com', target_url: 'https://target.test', anchor: 'anchor', assign_to: 'Abubakar', deadline: '2026-11-01' }), []);
  assert.deepEqual(getIncompleteFields({ approved_site: 'example.com', target_url: 'https://target.test', anchor: 'anchor', assign_to: 'Abubakar', deadline: '2026-11-01', dr: null, traffic: '' }, true), ['DR', 'Traffic']);
});

test('webhook remains backward compatible and accepts spreadsheet identity + Removed', () => {
  const legacy = parseSheetWebhookPayload({ tab: 'Inhouse', row: 2, website: 'example.com', anchor: 'anchor', status: 'Live' });
  assert.equal(legacy.ok, true);
  const ownSheet = parseSheetWebhookPayload({ spreadsheetId: 'sheet-id', tab: 'Live Link', row: 3, liveLink: 'https://example.com/page', anchor: 'anchor', status: 'Removed' });
  assert.equal(ownSheet.ok, true);
  assert.equal(ownSheet.ok && ownSheet.value.spreadsheetId, 'sheet-id');
});
