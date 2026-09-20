import { z } from 'zod';

export const REQUEST_STATUSES = ['Request shared', 'Live'] as const;
export const REQUEST_PRIORITIES = ['High', 'Medium', 'Low'] as const;

export const requestSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  sub_project: z.string().optional().nullable(),
  target_url: z.string().trim().min(1, 'Target URL is required'),
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
});
export type ProjectInput = z.infer<typeof projectSchema>;

export function isRequestStatus(value: string): value is (typeof REQUEST_STATUSES)[number] {
  return REQUEST_STATUSES.includes(value as (typeof REQUEST_STATUSES)[number]);
}

// Matches the original sheet duplicate rule: lowercase, then remove every
// character except a-z and 0-9.
export function normalizeForDuplicate(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function looksLikeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const SITE_IMPORT_HEADERS = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note'] as const;
