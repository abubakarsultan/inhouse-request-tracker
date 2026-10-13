import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHeaderColumns, validateSheetTabName, getMissingRequestFields } from '../lib/sheet-config.ts';

test('resolves sheet columns by normalized header name', () => {
  const map = resolveHeaderColumns(['Live Link', ' Anchor ', 'Target Page', 'STATUS']);
  assert.equal(map['live link'], 0);
  assert.equal(map.anchor, 1);
  assert.equal(map.status, 3);
});

test('validates Google Sheets tab names', () => {
  assert.equal(validateSheetTabName('Live Link').ok, true);
  assert.equal(validateSheetTabName('bad/name').ok, false);
  assert.equal(validateSheetTabName('x'.repeat(101)).ok, false);
});

test('reports incomplete required fields and optional metrics', () => {
  assert.deepEqual(getMissingRequestFields({}), [
    'placement page / live link', 'target URL', 'anchor', 'assigned person', 'deadline',
  ]);
  assert.deepEqual(getMissingRequestFields({ placement_page: '/a', target_url: '/b', anchor: 'x', assign_to: 'Ali', deadline: '2026-10-20', dr: 30, traffic: 100 }, true), []);
});
