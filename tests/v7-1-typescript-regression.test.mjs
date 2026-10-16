import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../services/google-sheet-sync.ts', import.meta.url), 'utf8');

test('V7.1 sheet reader keeps note as a string for TeamSheetProjectRow', () => {
  assert.match(src, /export type TeamSheetProjectRow = \{[\s\S]*?note:\s*string;/);
  assert.match(src, /note:\s*readCell\(row, 'note', fieldIndex\('assign_to', 6\)\),/);
  assert.doesNotMatch(src, /note:\s*readCell\(row, 'note', fieldIndex\('assign_to', 6\)\)\s*\|\|\s*null/);
});

// The existing import path deliberately turns empty notes into null when storing them.
test('empty sheet notes remain nullable when inserted into the database', () => {
  const sites = fs.readFileSync(new URL('../services/sites.ts', import.meta.url), 'utf8');
  assert.match(sites, /const note = row\.note \|\| null;/);
});
