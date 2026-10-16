'use server';

import { createClient } from '@/lib/supabase-server';
import { projectSchema, type ProjectInput } from '@/lib/validators';
import { slugify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { resolveGoogleSheetUrl, inspectProjectSpreadsheet, inspectProjectTab, createBlankProjectSpreadsheet } from '@/lib/google-sheet-setup';
import { parseGoogleSheetUrl } from '@/lib/google-sheet-url';
import { adminClient } from '@/lib/supabase-admin';
import { describeProjectSaveError } from '@/lib/project-save-error';
import { projectCategorySlug } from '@/lib/project-category-slugs';

export async function getProjects(search?: string, activeOnly = false) {
  const supabase = await createClient();
  let query = supabase.from('projects').select('*').order('name', { ascending: true });
  if (search) query = query.ilike('name', `%${search}%`);
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}


/**
 * Statistics are an enhancement, not a dependency of the Projects workspace.
 * Migration 008 adds the fast Postgres aggregate RPC. Older deployments should
 * still list/edit projects while the DB is being upgraded. Never show fake 0s
 * when the aggregate cannot be obtained.
 */
export async function getProjectsWithCounts(search?: string) {
  await requireAdminForAction();
  const [projects, stats] = await Promise.all([
    getProjects(search),
    Promise.resolve()
      .then(() => adminClient.rpc('project_request_status_counts'))
      .then(({ data, error }) => {
        if (error) {
          console.error('[projects] Project counts RPC failed. Check migration 008 and service role permissions:', error.message);
          return { rows: [] as any[], unavailable: true };
        }
        return { rows: (data ?? []) as any[], unavailable: false };
      })
      .catch((error: unknown) => {
        console.error('[projects] Project counts RPC unavailable:', error);
        return { rows: [] as any[], unavailable: true };
      }),
  ]);

  type Counts = { requests: number | null; live: number | null; pending: number | null; rejected: number | null };
  const counts = new Map<string, Counts>();
  for (const row of stats.rows) {
    counts.set(String(row.project_id), {
      requests: Number(row.requests || 0), live: Number(row.live || 0),
      pending: Number(row.pending || 0), rejected: Number(row.rejected || 0),
    });
  }

  const empty: Counts = stats.unavailable
    ? { requests: null, live: null, pending: null, rejected: null }
    : { requests: 0, live: 0, pending: 0, rejected: 0 };
  return {
    statsUnavailable: stats.unavailable,
    projects: projects.map((project: any) => ({ ...project, counts: counts.get(String(project.id)) ?? empty })),
  };
}

export async function getActiveProjects() {
  await requireActiveUserForAction();
  return getProjects(undefined, true);
}

export async function getProjectBySlug(slug: string) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

/** Admin-only metadata lookup. No writes and no full-row scans. */
export async function listProjectSheetTabs(sheetUrl?: string, shared = false) {
  await requireAdminForAction();
  return inspectProjectSpreadsheet(sheetUrl, shared);
}

export async function inspectSharedProjectTab(tabName: string) {
  await requireAdminForAction();
  const result = await inspectProjectSpreadsheet(undefined, true);
  const tab = result.tabs.find((entry) => entry.title === tabName);
  if (!tab) throw new Error('Shared Guest Post Anchor tab not found.');
  return inspectProjectTab(`https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit#gid=${tab.gid}`);
}

export async function testProjectSheetConnection(sheetUrl: string) {
  await requireAdminForAction();
  return inspectProjectTab(sheetUrl);
}

async function resolveProjectSheet(input: ProjectInput, existing?: any, adminEmail?: string) {
  if (input.sheet_source === 'guest_post_anchor') {
    if (!input.guest_post_tab_name?.trim()) throw new Error('Select a Guest Post Anchor project tab.');
    // Validate the existing shared workbook and tab without changing its contents.
    const shared = await inspectProjectSpreadsheet(undefined, true);
    const chosen = shared.tabs.find((item) => item.title === input.guest_post_tab_name);
    if (!chosen) throw new Error('That Guest Post Anchor tab was not found. Reload available tabs.');
    return {
      google_sheet_id: null, google_sheet_gid: chosen.gid, sheet_name: 'Guest Post Anchor',
      guest_post_tab_name: chosen.title, column_mapping: input.column_mapping,
    };
  }
  if (input.create_new_sheet) {
    if (!adminEmail) throw new Error('A signed-in administrator is needed to share the new sheet.');
    if (!input.new_sheet_title?.trim() || !input.guest_post_tab_name?.trim()) throw new Error('New Sheet title and tab name are required.');
    const created = await createBlankProjectSpreadsheet(input.new_sheet_title, input.guest_post_tab_name, adminEmail, input.column_mapping as any);
    return { ...created, column_mapping: input.column_mapping };
  }
  if (!input.sheet_url) throw new Error('Paste the Google Sheet URL to connect this project.');
  const parsed = parseGoogleSheetUrl(input.sheet_url);
  const sheet = await resolveGoogleSheetUrl(input.sheet_url);
  // The administrator's custom mapping is authoritative. Never overwrite it with
  // automatic header detection at Save time (including on first creation).
  return { ...sheet, column_mapping: input.column_mapping };
}

/** Resolve the required UUID FK against existing categories. Never hard-code IDs:
 * each Supabase environment may have different UUIDs. A missing category is
 * an explicit setup error, not a reason to insert an arbitrary ID.
 */
async function resolveProjectCategoryId(category: ProjectInput['category']): Promise<string> {
  const slug = projectCategorySlug(category);
  const { data, error } = await adminClient.from('project_categories')
    .select('id')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    console.error('[projects] Category lookup failed:', { slug, code: error.code, message: error.message });
    throw new Error('Project categories could not be loaded. Check project category migration 009 and Supabase permissions.');
  }
  if (!data?.id) {
    throw new Error(`The ${category} category is missing or inactive. Apply project category migration 009 and try again.`);
  }
  return String(data.id);
}

export async function createProject(input: ProjectInput) {
  const profile = await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();
  // Validate the FK before creating a Google spreadsheet (no orphan sheets).
  const categoryId = await resolveProjectCategoryId(parsed.category);
  if (parsed.sheet_source === 'guest_post_anchor') {
    const { data: duplicate, error: duplicateError } = await supabase.from('projects')
      .select('id,name').eq('sheet_source', 'guest_post_anchor')
      .eq('guest_post_tab_name', parsed.guest_post_tab_name).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new Error(`This Guest Post Anchor tab is already connected to ${duplicate.name}. Choose another tab.`);
  }
  const sheet = await resolveProjectSheet(parsed, undefined, profile.email);
  if (parsed.sheet_source === 'custom_sheet' && sheet.google_sheet_id) {
    const { data: duplicate, error: duplicateError } = await supabase.from('projects')
      .select('id,name').eq('sheet_source', 'custom_sheet')
      .eq('google_sheet_id', sheet.google_sheet_id)
      .eq('guest_post_tab_name', sheet.guest_post_tab_name).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new Error(`This Google Sheet tab already belongs to ${duplicate.name}. Choose a different tab to avoid conflicting status updates.`);
  }

  const baseSlug = slugify(parsed.name) || 'project';
  let slug = baseSlug;
  for (let i = 1; i < 50; i += 1) {
    const { data: clash } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${i + 1}`;
  }

  const { error } = await supabase.from('projects').insert({
    name: parsed.name,
    slug,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    category: parsed.category,
    category_id: categoryId,
    sheet_source: parsed.sheet_source,
    ...sheet,
    sync_enabled: parsed.sync_enabled,
    active: true,
  });
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}

export async function updateProject(id: string, input: ProjectInput) {
  await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();
  const categoryId = await resolveProjectCategoryId(parsed.category);
  const { data: existing, error: lookupError } = await supabase.from('projects').select('google_sheet_id,google_sheet_gid,guest_post_tab_name,sheet_source,column_mapping').eq('id', id).single();
  if (lookupError || !existing) throw new Error(lookupError?.message || 'Project not found');
  if (parsed.create_new_sheet) throw new Error('Create a new Google Sheet only while adding a project. Connect an existing Sheet URL to change this project.');
  if (existing.sheet_source === 'guest_post_anchor' && parsed.sheet_source === 'guest_post_anchor' &&
      existing.guest_post_tab_name !== parsed.guest_post_tab_name) {
    throw new Error('Existing Guest Post Anchor project tabs cannot be reassigned. Create a new project instead to protect linked requests and Sheet rows.');
  }
  // Never overwrite the A:H mapping of an existing shared Guest Post Anchor project.
  // Its historic rows and the installed workbook-level trigger depend on those positions.
  const sheet = await resolveProjectSheet(parsed, existing);
  if (existing.sheet_source === 'guest_post_anchor' && parsed.sheet_source === 'guest_post_anchor') {
    sheet.column_mapping = existing.column_mapping;
  }
  // One tab represents one project. Sharing the same tab between two projects
  // would make status webhooks ambiguous even if spreadsheet IDs are scoped.
  let duplicateQuery = supabase.from('projects').select('id,name')
    .eq('sheet_source', parsed.sheet_source)
    .eq('guest_post_tab_name', sheet.guest_post_tab_name).neq('id', id);
  if (parsed.sheet_source === 'custom_sheet') duplicateQuery = duplicateQuery.eq('google_sheet_id', sheet.google_sheet_id);
  const { data: duplicate, error: duplicateError } = await duplicateQuery.limit(1).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) throw new Error(`This spreadsheet tab is already mapped to ${duplicate.name}. Select another tab.`);
  const { error } = await supabase.from('projects').update({
    name: parsed.name,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    category: parsed.category,
    category_id: categoryId,
    sheet_source: parsed.sheet_source,
    ...sheet,
    sync_enabled: parsed.sync_enabled,
  }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
  revalidatePath('/projects/[slug]', 'page');
}

/**
 * A Server Action exception is masked as React #441 in production. Return
 * serializable feedback so the wizard can display a real, actionable message.
 * Never return raw SQL or Google API errors to the browser.
 */
type ProjectSaveFeedback = { ok: true } | { ok: false; message: string };

export async function createProjectWithFeedback(input: ProjectInput): Promise<ProjectSaveFeedback> {
  try {
    await createProject(input);
    return { ok: true };
  } catch (error) {
    console.error('[project:save] create failed:', error);
    return { ok: false, message: describeProjectSaveError(error) };
  }
}

export async function updateProjectWithFeedback(id: string, input: ProjectInput): Promise<ProjectSaveFeedback> {
  try {
    await updateProject(id, input);
    return { ok: true };
  } catch (error) {
    console.error('[project:save] update failed:', error);
    return { ok: false, message: describeProjectSaveError(error) };
  }
}

export async function toggleProjectActive(id: string, active: boolean) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { error } = await supabase.from('projects').update({ active }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}
