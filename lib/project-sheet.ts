export const PROJECT_CATEGORIES = ['Inhouse', 'Client', 'On Page', 'Others'] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const SHEET_DATA_FIELDS = [
  { value: 'approved_site', label: 'Approved Site / Website' },
  { value: 'placement_page', label: 'Placement Page / Opportunity' },
  { value: 'anchor', label: 'Anchor' },
  { value: 'status', label: 'Status' },
  { value: 'assign_to', label: 'Assigned To' },
  { value: 'created_by_email', label: 'Created By Email' },
  { value: 'blank', label: 'Blank / Manual Sheet Entry' },
] as const;

export type SheetDataField = (typeof SHEET_DATA_FIELDS)[number]['value'];
export type ColumnMapping = { column: string; heading: string; field: SheetDataField };

export const DEFAULT_COLUMN_MAPPING: ColumnMapping[] = [
  { column: 'A', heading: 'Website', field: 'approved_site' },
  { column: 'B', heading: 'Opportunity', field: 'placement_page' },
  { column: 'C', heading: 'Anchor', field: 'anchor' },
  { column: 'D', heading: 'DR', field: 'blank' },
  { column: 'E', heading: 'Traffic', field: 'blank' },
  { column: 'F', heading: 'Status', field: 'status' },
  { column: 'G', heading: 'Note / Assigned To', field: 'assign_to' },
  { column: 'H', heading: 'Created By Email', field: 'created_by_email' },
];

export function normalizeColumnMapping(value: unknown): ColumnMapping[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_COLUMN_MAPPING;
  return value
    .map((item: any, index) => ({
      column: String(item?.column || String.fromCharCode(65 + index)).toUpperCase(),
      heading: String(item?.heading || '').trim(),
      field: SHEET_DATA_FIELDS.some((field) => field.value === item?.field) ? item.field as SheetDataField : 'blank',
    }))
    .filter((item) => item.heading);
}

export function columnNumber(column: string) {
  let result = 0;
  for (const char of column.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result;
}

export function valueForField(field: SheetDataField, record: Record<string, any>) {
  if (field === 'blank') return '';
  return record[field] ?? '';
}
