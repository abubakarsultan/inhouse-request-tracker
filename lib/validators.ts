import { z } from 'zod';
import { PROJECT_CATEGORIES, SHEET_DATA_FIELDS } from '@/lib/project-sheet';
import { parseGoogleSheetUrl } from '@/lib/google-sheet-url';

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

const columnMappingSchema = z.array(z.object({
  column: z.string().trim().toUpperCase().regex(/^[A-Z]$/, 'Use a column from A to Z'),
  heading: z.string().trim().min(1, 'Heading is required'),
  field: z.enum(SHEET_DATA_FIELDS.map((item) => item.value) as [string, ...string[]]),
})).min(1).max(26).superRefine((columns, ctx) => {
  const seen = new Set<string>();
  for (const [index, item] of columns.entries()) {
    if (seen.has(item.column)) ctx.addIssue({ code: 'custom', path: [index, 'column'], message: 'Each Sheet column can only be mapped once.' });
    seen.add(item.column);
  }
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  outreach_project_name: z.string().trim().optional().nullable(),
  category: z.enum(PROJECT_CATEGORIES),
  sheet_source: z.enum(['guest_post_anchor', 'custom_sheet']),
  sheet_url: z.string().trim().optional().nullable().superRefine((value, ctx) => {
    if (!value) return;
    try { parseGoogleSheetUrl(value); } catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }); }
  }),
  guest_post_tab_name: z.string().trim().optional().nullable(),
  column_mapping: columnMappingSchema,
  sync_enabled: z.boolean().default(true),
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
