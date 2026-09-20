import { z } from 'zod';

// Section 3 decisions: exactly two statuses, three priorities (no Urgent).
export const STATUS_OPTIONS = ['Request shared', 'Live'] as const;
export type RequestStatus = (typeof STATUS_OPTIONS)[number];

export const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'] as const;
export type RequestPriority = (typeof PRIORITY_OPTIONS)[number];

export const SYNC_STATES = ['synced', 'skipped', 'failed'] as const;
export type SyncState = (typeof SYNC_STATES)[number];

// setRequestStatus (6.2) allows Live -> Request shared (revert) and back.
// Same-status is a no-op (idempotent), not an error.
export function canChangeStatus(from: string, to: string) {
  return STATUS_OPTIONS.includes(to as RequestStatus);
}

export const requestSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  sub_project: z.string().optional().nullable(),
  target_url: z.string().min(1, 'Target URL is required'), // 6.1 — not stricter than the sheet; UI warns but doesn't block
  anchor: z.string().min(1, 'Anchor is required'),
  approved_site: z.string().min(1, 'Approved site is required'),
  placement_page: z.string().optional().nullable(),
  shared_with: z.string().optional().nullable(),
  priority: z.enum(PRIORITY_OPTIONS).default('Medium'),
  assign_to: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  status: z.enum(STATUS_OPTIONS).default('Request shared'), // creation only allows these two (6.1)
  created_by_name: z.string().optional().nullable(),
  force: z.boolean().optional(), // "Save anyway" past the duplicate warning
});
export type RequestInput = z.infer<typeof requestSchema>;

export const projectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  outreach_project_name: z.string().optional().nullable(),
  guest_post_tab_name: z.string().optional().nullable(),
  sync_enabled: z.boolean().default(true),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const SITE_IMPORT_HEADERS = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note'] as const;

// Outreach OS bulk-add CSV column order — must match EXACTLY (section 7.5).
export const CSV_COLUMNS = [
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
