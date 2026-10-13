import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('auth rollout migration seeds requested Guest Post Anchor names', () => {
  const sql = fs.readFileSync(new URL('../database/migrations/004_auth_team_rollout.sql', import.meta.url), 'utf8');
  for (const name of ['M.ATIF', 'Wasif', 'Atif latif', 'Sohail Ahmad', 'Rizwan', 'Abubakar', 'Zunnorain Ali']) {
    assert.match(sql, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(sql, /hook_restrict_rankviz_signup/);
  assert.match(sql, /link_user_sheet_history/);
  assert.match(sql, /with historical_names as/);
});

test('team sheet mirror stores creator email in column H', () => {
  const source = fs.readFileSync(new URL('../services/google-sheet-sync.ts', import.meta.url), 'utf8');
  assert.match(source, /Created By Email/);
  assert.match(source, /A\$\{targetRow\}:H\$\{targetRow\}/);
  assert.match(source, /request\.created_by_email/);
});
