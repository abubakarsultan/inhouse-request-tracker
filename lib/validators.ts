import { z } from 'zod';

export const requestSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  sub_project: z.string().optional().nullable(),
  target_url: z.string().url('Enter a valid URL'),
  anchor: z.string().min(1, 'Anchor is required'),
  approved_site: z.string().min(1, 'Approved site is required'),
  placement_page: z.string().optional().nullable(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
  assigned_to: z.string().uuid().optional().nullable(),
  deadline: z.string().optional().nullable(),
  shared_with: z.string().optional().nullable(),
});
export type RequestInput = z.infer<typeof requestSchema>;

export const projectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  outreach_project_name: z.string().optional().nullable(),
  guest_post_tab_name: z.string().optional().nullable(),
  google_sheet_id: z.string().optional().nullable(),
  sync_enabled: z.boolean().default(false),
});
export type ProjectInput = z.infer<typeof projectSchema>;

// Status workflow — kept in one place so the UI and any server action
// agree on what's legal. The database trigger (see database/schema.sql)
// enforces the same rule as a last line of defense.
export const STATUS_ORDER = ['Request Shared', 'Live', 'Removed'] as const;
export const transitions: Record<string, string[]> = {
  'Request Shared': ['Live'],
  Live: ['Removed'],
  Removed: [],
};
export function canChangeStatus(from: string, to: string) {
  return from === to || (transitions[from] ?? []).includes(to);
}

export const SITE_IMPORT_HEADERS = ['Website', 'Opportunity', 'Anchor', 'DR', 'Traffic', 'Status', 'Note'] as const;
