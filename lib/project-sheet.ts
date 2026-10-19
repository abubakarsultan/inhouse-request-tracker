export const SITE_IMPORT_HEADERS = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note'] as const;
export const PROJECT_CATEGORIES = ['Inhouse', 'Client', 'On Page', 'Others'] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

/** Values come from persisted request/project_site columns, never eval'd expressions. */
export const SHEET_DATA_FIELDS = [
  { value: 'approved_site', label: 'Approved Site' },
  { value: 'target_url', label: 'Target URL' },
  { value: 'anchor', label: 'Anchor' },
  { value: 'placement_page', label: 'Placement Page' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'dr', label: 'DR' },
  { value: 'traffic', label: 'Traffic' },
  { value: 'status', label: 'Status' },
  { value: 'note', label: 'Note' },
  { value: 'assign_to', label: 'Assigned To' },
  { value: 'created_by_name', label: 'Created By' },
  { value: 'created_by_email', label: 'Created By Email' },
  { value: 'project_name', label: 'Project Name' },
  { value: 'created_at', label: 'Date Created' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'static', label: 'Static Value' },
  { value: 'blank', label: 'Blank / Manual Sheet Entry' },
] as const;
export type SheetDataField = (typeof SHEET_DATA_FIELDS)[number]['value'];
export type ColumnMapping = { column: string; heading: string; field: SheetDataField; static_value?: string };

/** Legacy Guest Post Anchor mapping is deliberately unchanged for all existing projects. */
export const DEFAULT_COLUMN_MAPPING: ColumnMapping[] = [
  { column: 'A', heading: 'Website', field: 'approved_site' },
  { column: 'B', heading: 'Opportunity', field: 'placement_page' },
  { column: 'C', heading: 'Anchor', field: 'anchor' },
  { column: 'D', heading: 'DR', field: 'blank' },
  { column: 'E', heading: 'Traffic', field: 'blank' },
  { column: 'F', heading: 'Status', field: 'status' },
  { column: 'G', heading: 'Note', field: 'assign_to' },
  { column: 'H', heading: 'Created By Email', field: 'created_by_email' },
];

export const NEW_SHEET_COLUMN_MAPPING: ColumnMapping[] = [
  { column: 'A', heading: 'Website', field: 'approved_site' },
  { column: 'B', heading: 'Opportunity', field: 'placement_page' },
  { column: 'C', heading: 'Anchor', field: 'anchor' },
  { column: 'D', heading: 'DR', field: 'dr' },
  { column: 'E', heading: 'Traffic', field: 'traffic' },
  { column: 'F', heading: 'Status', field: 'status' },
  { column: 'G', heading: 'Note', field: 'note' },
  { column: 'H', heading: 'Created By Email', field: 'created_by_email' },
];

export const CLIENT_LIVE_LINK_COLUMN_MAPPING: ColumnMapping[] = [
  { column: 'A', heading: 'Live Link', field: 'placement_page' },
  { column: 'B', heading: 'Anchor', field: 'anchor' },
  { column: 'C', heading: 'Target Page', field: 'target_url' },
  { column: 'D', heading: 'Status', field: 'status' },
];
export const CLIENT_LIVE_LINK_WITH_METRICS_MAPPING: ColumnMapping[] = [
  ...CLIENT_LIVE_LINK_COLUMN_MAPPING.slice(0, 3),
  { column: 'D', heading: 'DR', field: 'dr' },
  { column: 'E', heading: 'Traffic', field: 'traffic' },
  { column: 'F', heading: 'Status', field: 'status' },
];

export function validateGuestPostTabName(value: unknown): string {
  const name = String(value ?? '').trim();
  if (!name || name.length > 100 || /[\[\]*?:\/\\]/.test(name)) throw new Error('Tab name must be 1–100 characters and cannot contain [ ] * ? : / or backslash.');
  return name;
}

export function normalizeColumnMapping(value: unknown): ColumnMapping[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_COLUMN_MAPPING.map((item) => ({ ...item }));
  return value
    .map((item: any, index) => ({
      column: String(item?.column || String.fromCharCode(65 + index)).toUpperCase(),
      heading: String(item?.heading || '').trim(),
      field: SHEET_DATA_FIELDS.some((field) => field.value === item?.field) ? item.field as SheetDataField : 'blank',
      ...(item?.field === 'static' ? { static_value: String(item?.static_value ?? '') } : {}),
    }))
    .filter((item) => item.heading);
}

export function reindexColumns(items: ColumnMapping[]): ColumnMapping[] {
  return items.map((item, index) => ({ ...item, column: String.fromCharCode(65 + index) }));
}

export function columnNumber(column: string) {
  let result = 0;
  for (const char of column.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result;
}

export function valueForField(field: SheetDataField, record: Record<string, any>, staticValue = ''): string | number {
  if (field === 'static') return staticValue;
  if (field === 'placement_page') return String(record.placement_page || record.approved_site || '');
  if (field === 'blank') return '';
  const aliases: Record<string, string[]> = {
    approved_site: ['approved_site', 'website'],
    placement_page: ['placement_page', 'opportunity'],
    opportunity: ['opportunity', 'placement_page'],
    anchor: ['anchor'],
    note: ['note', 'assign_to'],
    assign_to: ['assign_to', 'note'],
    created_by_name: ['created_by_name', 'created_by'],
    created_by_email: ['created_by_email'],
    project_name: ['project_name'],
  };
  for (const key of aliases[field] || [field]) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return '';
}

export function previewMappedRow(mapping: ColumnMapping[]): { headings: string[]; values: (string | number)[] } {
  const sample = {
    approved_site: 'example.com', website: 'example.com', target_url: 'https://client.com/page',
    anchor: 'SEO services', placement_page: 'https://example.com/blog', opportunity: 'https://example.com/blog',
    dr: 60, traffic: 20000, status: 'Live', note: 'Approved', assign_to: 'Team A',
    created_by_name: 'Sample User', created_by_email: 'user@example.com', project_name: 'Sample Project',
    created_at: '2026-10-16', deadline: '2026-10-30', priority: 'Medium',
  };
  return {
    headings: mapping.map((item) => item.heading),
    values: mapping.map((item) => valueForField(item.field, sample, item.static_value)),
  };
}
