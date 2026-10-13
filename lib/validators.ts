import { z } from 'zod';

export const REQUEST_STATUSES = ['Request shared', 'Live', 'Rejected'] as const;
export const REQUEST_PRIORITIES = ['High', 'Medium', 'Low'] as const;

export const requestSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  sub_project: z.string().optional().nullable(),
  target_url: z.string().trim(),
  anchor: z.string().trim().min(1, 'Anchor is required'),
  approved_site: z.string().trim().min(1, 'Approved site is required'),
  placement_page: z.string().optional().nullable(),
  shared_with: z.string().optional().nullable(),
  priority: z.enum(REQUEST_PRIORITIES).default('Medium'),
  assign_to: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  status: z.enum(REQUEST_STATUSES).default('Request shared'),
  created_by_name: z.string().optional().nullable(),
});
export type RequestInput = z.infer<typeof requestSchema>;

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  outreach_project_name: z.string().trim().optional().nullable(),
  guest_post_tab_name: z.string().trim().optional().nullable(),
  sync_enabled: z.boolean().default(true),
  category_id: z.string().uuid().optional(),
  sheet_tab_name: z.string().trim().max(100).optional().nullable(),
  google_sheet_id: z.string().trim().optional().nullable(),
  sheet_column_config: z.record(z.string(), z.string()).optional(),
  sheet_share_emails: z.array(z.string().email()).optional(),
  sheet_connection_mode: z.enum(['existing', 'create', 'none']).optional(),
  sheet_url: z.string().trim().optional().nullable(),
  include_dr_traffic: z.boolean().optional(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export function isRequestStatus(value: string): value is (typeof REQUEST_STATUSES)[number] {
  return REQUEST_STATUSES.includes(value as (typeof REQUEST_STATUSES)[number]);
}

// Legacy helper retained for Sheet row identity matching. Project-domain uniqueness
// itself uses exact host normalization in normalize_project_domain()/extractHost().
export function normalizeForDuplicate(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function looksLikeHttpUrl(value: string) {
  if (!value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const SITE_IMPORT_HEADERS = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note'] as const;

export function validateSheetTabName(value: string) {
  const name = value.trim();
  if (!name) return 'Sheet tab name is required.';
  if (name.length > 100) return 'Google Sheets tab names must be 100 characters or fewer.';
  if (/[\[\]\*\?:\/\\]/.test(name)) return 'Sheet tab name cannot contain [ ] * ? : / or \\.';
  return null;
}

export type IncompleteFieldInput = { placement_page?: string | null; approved_site?: string | null; target_url?: string | null; anchor?: string | null; assign_to?: string | null; deadline?: string | null; dr?: number | string | null; traffic?: number | string | null };
export function getIncompleteFields(row: IncompleteFieldInput, includeDrTraffic = false) {
  const missing: string[] = [];
  if (!(row.placement_page || row.approved_site || '').toString().trim()) missing.push('Placement page / live link');
  if (!String(row.target_url ?? '').trim()) missing.push('Target URL');
  if (!String(row.anchor ?? '').trim()) missing.push('Anchor');
  if (!String(row.assign_to ?? '').trim()) missing.push('Assigned person');
  if (!String(row.deadline ?? '').trim()) missing.push('Deadline');
  if (includeDrTraffic && (row.dr === null || row.dr === undefined || String(row.dr).trim() === '')) missing.push('DR');
  if (includeDrTraffic && (row.traffic === null || row.traffic === undefined || String(row.traffic).trim() === '')) missing.push('Traffic');
  return missing;
}
