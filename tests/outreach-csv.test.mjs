import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutreachCsv, OUTREACH_CSV_HEADERS } from '../lib/outreach-csv.ts';

test('buildOutreachCsv emits exact header order, UTF-8 BOM, CRLF, trailing CRLF and CSV escaping', () => {
  const csv = buildOutreachCsv([{
    Client: 'Get Pro Links',
    'Sub-Project': 'A, B',
    'Target URL': 'https://example.com/page',
    Anchor: 'best "link" agency',
    'Approved Site (Domain)': 'publisher.com',
    'Placement Page': 'https://publisher.com/a\nline',
    Priority: 'Medium',
    'Assign To': 'Amelia',
    Deadline: '2026-09-20',
  }]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('\r\nGet Pro Links,'));
  assert.equal(csv.slice(1).split('\r\n')[0], OUTREACH_CSV_HEADERS.join(','));
  assert.match(csv, /"A, B"/);
  assert.match(csv, /"best ""link"" agency"/);
  assert.match(csv, /"https:\/\/publisher\.com\/a\nline"/);
});
