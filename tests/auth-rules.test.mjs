import test from 'node:test';
import assert from 'node:assert/strict';
import { isRankvizEmail, parseAdminEmails } from '../lib/auth-rules.ts';

test('Rankviz domain gate accepts only exact @rankviz.com addresses', () => {
  assert.equal(isRankvizEmail('Abubakar@rankviz.com'), true);
  assert.equal(isRankvizEmail('person@gmail.com'), false);
  assert.equal(isRankvizEmail('person@rankviz.com.evil.test'), false);
  assert.equal(isRankvizEmail('rankviz.com'), false);
});

test('ADMIN_EMAILS parser keeps only Rankviz emails', () => {
  const emails = parseAdminEmails(' Admin@rankviz.com, user@gmail.com, second@rankviz.com ');
  assert.deepEqual([...emails], ['admin@rankviz.com', 'second@rankviz.com']);
});
