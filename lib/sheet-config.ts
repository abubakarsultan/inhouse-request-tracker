export const TEAM_SHEET_HEADERS = [
  'Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note', 'Created By Email',
] as const;

export const CLIENT_SHEET_HEADERS = ['Live Link', 'Anchor', 'Target Page', 'Status'] as const;
export const CLIENT_SHEET_HEADERS_WITH_METRICS = ['Live Link', 'Anchor', 'Target Page', 'Status', 'DR', 'Traffic'] as const;

export type SheetColumnMap = Record<string, number>;

export function resolveHeaderColumns(headers: unknown[]): SheetColumnMap {
  const result: SheetColumnMap = {};
  headers.forEach((header, index) => {
    const key = String(header ?? '').trim().toLocaleLowerCase();
    if (key && result[key] === undefined) result[key] = index;
  });
  return result;
}

export function validateSheetTabName(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const name = value.trim();
  if (!name) return { ok: false, error: 'Sheet tab name is required.' };
  if (name.length > 100) return { ok: false, error: 'Sheet tab names must be 100 characters or fewer.' };
  if (/[\[\]*?:/\\]/.test(name)) return { ok: false, error: 'Sheet tab names cannot contain [ ] * ? : / or backslash.' };
  return { ok: true, value: name };
}

export type IncompleteRequestFields = {
  placement_page?: string | null;
  live_link?: string | null;
  target_url?: string | null;
  anchor?: string | null;
  assign_to?: string | null;
  deadline?: string | null;
  dr?: number | string | null;
  traffic?: number | string | null;
};

export function getMissingRequestFields(request: IncompleteRequestFields, includeDrTraffic = false): string[] {
  const missing: string[] = [];
  if (!String(request.placement_page ?? request.live_link ?? '').trim()) missing.push('placement page / live link');
  if (!String(request.target_url ?? '').trim()) missing.push('target URL');
  if (!String(request.anchor ?? '').trim()) missing.push('anchor');
  if (!String(request.assign_to ?? '').trim()) missing.push('assigned person');
  if (!String(request.deadline ?? '').trim()) missing.push('deadline');
  if (includeDrTraffic && (request.dr === null || request.dr === undefined || String(request.dr).trim() === '')) missing.push('DR');
  if (includeDrTraffic && (request.traffic === null || request.traffic === undefined || String(request.traffic).trim() === '')) missing.push('Traffic');
  return missing;
}
