import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineTone, deadlineCellClass } from '../lib/date.ts';

test('deadline visuals follow Phase 3 rules', () => {
  const today = '2026-09-20';
  assert.equal(deadlineTone('2026-09-19', 'Request shared', today), 'overdue');
  assert.equal(deadlineTone('2026-09-20', 'Request shared', today), 'soon');
  assert.equal(deadlineTone('2026-09-22', 'Request shared', today), 'soon');
  assert.equal(deadlineTone('2026-09-23', 'Request shared', today), 'normal');
  assert.equal(deadlineTone('2026-09-19', 'Live', today), 'normal');
  assert.match(deadlineCellClass('2026-09-19', 'Request shared', today), /#f4c7c3/);
  assert.match(deadlineCellClass('2026-09-21', 'Request shared', today), /#fff2cc/);
});
