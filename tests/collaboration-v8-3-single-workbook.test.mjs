import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { templatePartnerTabName, COLLAB_HEADERS, COLLAB_SUMMARY_HEADERS } from '../lib/collaboration-core.ts';
const read = p => readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('Single file holds three workbook tabs, no CSV ZIP',()=>{
 const s=read('lib/collaboration-csv.ts');
 assert.match(s,/XLSX\.utils\.book_new\(\)/);
 assert.match(s,/for \(const tab of \['Rankviz', partnerTab\]\)/);
 assert.match(s,/XLSX\.utils\.book_append_sheet\(workbook, summary, 'Summary'\)/);
 assert.match(s,/bookType: 'xlsx'/);
 assert.doesNotMatch(s,/csvTemplateZip|Rankviz\.csv|Summary\.csv/);
 assert.deepEqual(COLLAB_HEADERS,['Date','Website','Placement Page','Anchor','Target Link','Status','Exchange ID']);
 assert.deepEqual(COLLAB_SUMMARY_HEADERS,['Metric','Our Links','Partner Links']);
});
test('Long names fit in Excel worksheet length and reserved names cannot clash',()=>{
 for (const name of ['John Outreach', 'Summary', 'Rankviz', 'Very Long Partner Company Name That Exceeds Excel Worksheet Length']) {
  const label=templatePartnerTabName(name);
  assert.ok(label.length > 0 && label.length <=31);
  assert.ok(!['rankviz','summary'].includes(label.toLowerCase()));
 }
});
test('Template route is XLSX and manual setup is one upload and one Google Sheet',()=>{
 const api=read('app/api/collaboration/templates/route.ts');
 assert.match(api,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
 assert.match(api,/collaboration-template\.xlsx/);
 const wizard=read('components/app/collaboration/partner-wizard.tsx');
 const details=read('app/(protected)/collaborations/[id]/page.tsx');
 assert.match(wizard,/upload the downloaded \.xlsx file/);
 assert.match(wizard,/one spreadsheet/);
 assert.match(details,/Download Excel Template \(\.xlsx\)/);
 assert.doesNotMatch(wizard,/Download CSV Templates/);
 const sheets=read('lib/collaboration-sheets.ts');
 assert.match(sheets,/templatePartnerTabName\(partnerName\)/);
});
