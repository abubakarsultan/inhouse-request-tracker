export const OUTREACH_CSV_HEADERS = [
  'Client',
  'Sub-Project',
  'Target URL',
  'Anchor',
  'Approved Site (Domain)',
  'Placement Page',
  'Priority',
  'Assign To',
  'Deadline',
] as const;

export type OutreachCsvRow = Record<(typeof OUTREACH_CSV_HEADERS)[number], string | null | undefined>;

function escapeCell(value: string | null | undefined) {
  const text = String(value ?? '');
  return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildOutreachCsv(rows: OutreachCsvRow[]) {
  const lines = [
    OUTREACH_CSV_HEADERS.map(escapeCell).join(','),
    ...rows.map((row) => OUTREACH_CSV_HEADERS.map((header) => escapeCell(row[header])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
