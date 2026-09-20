import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSheetWebhookPayload, normalizeImportedSiteStatus, buildInstallableTriggerSnippet } from '../lib/sheet-webhook.ts';

test('sheet webhook accepts the exact Phase 4 payload and statuses', () => {
  const parsed = parseSheetWebhookPayload({ tab: 'getprolinks', row: 12, website: 'example.com', anchor: 'best links', status: 'Live' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value.row, 12);

  const bad = parseSheetWebhookPayload({ tab: 'getprolinks', row: 1, website: 'example.com', anchor: 'best links', status: 'Removed' });
  assert.equal(bad.ok, false);
});

test('file import status vocabulary is exactly two values', () => {
  assert.equal(normalizeImportedSiteStatus('Live'), 'Live');
  assert.equal(normalizeImportedSiteStatus('Request Shared'), 'Request shared');
  assert.equal(normalizeImportedSiteStatus('Removed'), 'Request shared');
  assert.equal(normalizeImportedSiteStatus(''), 'Request shared');
});

test('installable trigger snippet uses the site webhook and installTrigger', () => {
  const script = buildInstallableTriggerSnippet('https://inhouse.example/');
  assert.match(script, /https:\/\/inhouse\.example\/api\/sheet-webhook/);
  assert.match(script, /ScriptApp\.newTrigger\('onSheetEdit'\)/);
  assert.match(script, /\.onEdit\(\)/);
  assert.match(script, /range\.getColumn\(\) !== 6/);
});
