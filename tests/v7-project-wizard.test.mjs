import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_COLUMN_MAPPING, NEW_SHEET_COLUMN_MAPPING, reindexColumns, previewMappedRow, valueForField } from '../lib/project-sheet.ts';
import { buildProjectTriggerSnippet } from '../lib/sheet-webhook.ts';
const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('Guest Post Anchor legacy A:H field positions stay consistent', () => {
  assert.deepEqual(DEFAULT_COLUMN_MAPPING.map(item => item.column), ['A','B','C','D','E','F','G','H']);
  assert.equal(DEFAULT_COLUMN_MAPPING[5].field, 'status');
  assert.equal(DEFAULT_COLUMN_MAPPING[5].heading, 'Status');
  assert.equal(DEFAULT_COLUMN_MAPPING[7].field, 'created_by_email');
  assert.equal(DEFAULT_COLUMN_MAPPING[6].heading, 'Note');
});

test('column builder reorders the physical columns and previews dynamic and static values', () => {
  const mapping = reindexColumns([
    { column: 'Z', heading: 'Status', field: 'status' },
    { column: 'A', heading: 'Origin', field: 'static', static_value: 'Guest Post' },
    { column: 'Q', heading: 'URL', field: 'target_url' },
  ]);
  assert.deepEqual(mapping.map(item => item.column), ['A','B','C']);
  assert.deepEqual(previewMappedRow(mapping).values, ['Live','Guest Post','https://client.com/page']);
  assert.equal(valueForField('note', { assign_to: 'Jane' }), 'Jane');
  assert.equal(NEW_SHEET_COLUMN_MAPPING.find(item => item.field === 'traffic').column, 'E');
});

test('unique project-specific Google triggers isolate each project even in one workbook', () => {
  const settings = {sheet_source:'custom_sheet',google_sheet_id:'abcdefghijklmn0123456',guest_post_tab_name:'Sheet1', column_mapping:[
    {column:'A',field:'approved_site'}, {column:'B',field:'anchor'}, {column:'D',field:'status'}
  ]};
  const a=buildProjectTriggerSnippet('https://example.com',{...settings,id:'aaaaaaaa-1111'});
  const b=buildProjectTriggerSnippet('https://example.com',{...settings,id:'bbbbbbbb-2222'});
  assert.match(a,/const STATUS_COLUMN = 4;/);
  assert.match(a,/const ANCHOR_COLUMN = 2;/);
  assert.match(a,/range\.getLastColumn\(\) < STATUS_COLUMN/);
  assert.match(a,/const PROJECT_SPREADSHEET_ID = "abcdefghijklmn0123456"/);
  const handlerA=a.match(/function (onProjectSheetEdit_[a-f0-9]+)\(/)?.[1];
  const handlerB=b.match(/function (onProjectSheetEdit_[a-f0-9]+)\(/)?.[1];
  assert.ok(handlerA && handlerB && handlerA !== handlerB);
  assert.ok(a.includes(`getHandlerFunction() === "${handlerA}"`));
  assert.doesNotMatch(a,/getHandlerFunction\(\) === 'onSheetEdit'/);
  assert.match(a,/spreadsheetId: PROJECT_SPREADSHEET_ID/);
});

test('existing Guest Post Anchor project mapping is protected on edits', () => {
  assert.match(read('services/projects.ts'), /existing\.sheet_source === 'guest_post_anchor'/);
  assert.match(read('services/projects.ts'), /sheet\.column_mapping = existing\.column_mapping/);
  assert.match(read('components/app/project-form-dialog.tsx'), /lockedLegacyMapping/);
});

test('wizard includes 4 categories and all key setup steps', () => {
  const form=read('components/app/project-form-dialog.tsx');
  for(const fragment of ['Basic info','Sheet source','Columns','Preview & save','Detect headings','Test connection & load tabs','Create New Google Sheet','Existing Guest Post Anchor','Give this email Editor access']) {
    assert.ok(form.includes(fragment),`wizard missing ${fragment}`);
  }
  assert.match(read('lib/project-sheet.ts'), /\['Inhouse', 'Client', 'On Page', 'Others'\]/);
  assert.match(read('lib/project-sheet.ts'), /Static Value/);
});

test('importer uses configured columns and Google new-sheet creation seeds headings', () => {
  const sync=read('services/google-sheet-sync.ts');
  assert.match(sync,/readCell\(row, 'dr', 3\)/);
  assert.match(sync,/readCell\(row, 'traffic', 4\)/);
  assert.match(sync,/readCell\(row, 'status', 5\)/);
  const create=read('lib/google-sheet-setup.ts');
  assert.match(create,/const headers = columnMapping\.map\(\(item\) => item\.heading\)/);
  assert.match(create,/spreadsheets\.values\.update/);
  assert.match(read('components/app/project-sheet-details.tsx'), /Open Sheet/);
});
