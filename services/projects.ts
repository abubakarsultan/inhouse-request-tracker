'use server';

import { createClient } from '@/lib/supabase-server';
import { z } from 'zod';
import { projectSchema, type ProjectInput } from '@/lib/validators';
import { slugify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { resolveGoogleSheetUrl, inspectProjectSpreadsheet, inspectProjectTab, createGuestPostAnchorTab } from '@/lib/google-sheet-setup';
import { createSpreadsheetForUser, repairServiceAccountAccess } from '@/lib/google-sheet-factory';
import { getConnectionStatus, getUserGoogleClient } from '@/lib/google-user-auth';
import { parseGoogleSheetUrl } from '@/lib/google-sheet-url';
import { adminClient } from '@/lib/supabase-admin';
import { describeProjectSaveError } from '@/lib/project-save-error';
import { projectCategorySlug } from '@/lib/project-category-slugs';

/** The category picker is DB-backed; authorization is verified for every action. */
const projectCategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(70),
  sheet_mode: z.enum(['team_sheet_tab', 'own_sheet']),
  sort_order: z.number().int().min(-100000).max(100000).default(100),
  active: z.boolean().optional(),
});
const BUILTIN_CATEGORY_SLUGS = new Set(['inhouse', 'client', 'onpage', 'others']);

export async function getProjectCategories(activeOnly = false) {
  await requireActiveUserForAction();
  let query = adminClient.from('project_categories').select('id,name,slug,sheet_mode,sort_order,active').order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load project categories: ${error.message}. Check migration 009.`);
  return data ?? [];
}

/** Create/update project categories. Never rename an in-use category, which would
 * orphan the legacy text label stored on projects even though its FK still works. */
export async function saveProjectCategory(input: z.input<typeof projectCategoryInputSchema>) {
  await requireAdminForAction();
  const parsed = projectCategoryInputSchema.parse(input);
  if (parsed.id) {
    const { data: current, error: lookupError } = await adminClient.from('project_categories')
      .select('id,name,slug,sheet_mode,active').eq('id', parsed.id).single();
    if (lookupError || !current) throw new Error('Category not found. Refresh the page.');
    if (BUILTIN_CATEGORY_SLUGS.has(current.slug) &&
      (parsed.name !== current.name || parsed.sheet_mode !== current.sheet_mode || parsed.active === false)) {
      throw new Error('The four standard categories are protected. You can change their display order, not their identity or Sheet mode.');
    }
    if (current.name !== parsed.name || parsed.active === false) {
      const { count, error: countError } = await adminClient.from('projects')
        .select('id', { count: 'exact', head: true }).eq('category_id', parsed.id);
      if (countError) throw new Error(`Unable to verify linked projects: ${countError.message}`);
      if ((count ?? 0) > 0) throw new Error('Move existing projects to another category before renaming or deactivating this category.');
    }
    const update: Record<string, unknown> = {
      name: parsed.name, sheet_mode: parsed.sheet_mode, sort_order: parsed.sort_order,
    };
    if (parsed.active !== undefined) update.active = parsed.active;
    if (current.name !== parsed.name) {
      const slug = slugify(parsed.name);
      if (!slug) throw new Error('Category name must contain letters or numbers.');
      update.slug = slug;
    }
    const { error } = await adminClient.from('project_categories').update(update).eq('id', parsed.id);
    if (error) throw new Error(`Could not update category: ${error.message}`);
  } else {
    const slug = slugify(parsed.name);
    if (!slug) throw new Error('Category name must contain letters or numbers.');
    if (BUILTIN_CATEGORY_SLUGS.has(slug)) throw new Error('That standard category already exists.');
    const { error } = await adminClient.from('project_categories').insert({
      name: parsed.name, slug, sheet_mode: parsed.sheet_mode,
      sort_order: parsed.sort_order, active: true,
    });
    if (error) throw new Error(`Could not create category: ${error.message}`);
  }
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}

export async function deactivateProjectCategory(id: string) {
  await requireAdminForAction();
  const categoryId = z.string().uuid().parse(id);
  const { data: category, error: lookupError } = await adminClient.from('project_categories')
    .select('id,slug').eq('id', categoryId).single();
  if (lookupError || !category) throw new Error('Category not found. Refresh the page.');
  if (BUILTIN_CATEGORY_SLUGS.has(category.slug)) throw new Error('Standard categories cannot be deactivated.');
  const { count, error: countError } = await adminClient.from('projects')
    .select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
  if (countError) throw new Error(`Unable to verify linked projects: ${countError.message}`);
  if ((count ?? 0) > 0) throw new Error('Move existing projects to another category before deactivation.');
  const { error } = await adminClient.from('project_categories').update({ active: false }).eq('id', categoryId);
  if (error) throw new Error(`Could not deactivate category: ${error.message}`);
  revalidatePath('/projects');
}

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
  await requireActiveUserForAction();
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
  await requireActiveUserForAction();
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

async function resolveProjectSheet(input: ProjectInput, existing?: any, userId?: string, onCreated?: (sheet: { spreadsheetId: string; url: string; tabs: Array<{ title: string; gid: number }>; ownerEmail: string }) => Promise<void>) {
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
    if (!userId) throw new Error('A signed-in administrator is needed to create the sheet in their own Google Drive.');
    if (!input.new_sheet_title?.trim() || !input.guest_post_tab_name?.trim()) throw new Error('New Sheet title and tab name are required.');
    const created = await createSpreadsheetForUser({ userId, title: input.new_sheet_title, tabs: [{ title: input.guest_post_tab_name, headers: input.column_mapping.map((item) => item.heading), statusValues: ['Request shared', 'Live', 'Rejected'] }], onCreated });
    return { google_sheet_id: created.spreadsheetId, google_sheet_gid: created.tabs[0]?.gid ?? null, sheet_name: input.new_sheet_title, guest_post_tab_name: input.guest_post_tab_name, column_mapping: input.column_mapping, sheet_setup_state: created.setupState, sheet_setup_error: created.setupError };
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
    .select('id,sheet_mode')
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

async function assertCategorySheetMode(category: string, source: ProjectInput['sheet_source']) {
  const slug = projectCategorySlug(category);
  const { data, error } = await adminClient.from('project_categories').select('sheet_mode')
    .eq('slug', slug).eq('active', true).maybeSingle();
  if (error || !data) throw new Error('Selected category is missing or inactive. Refresh the Projects page.');
  if (source === 'guest_post_anchor' && data.sheet_mode !== 'team_sheet_tab')
    throw new Error('This category requires its own Google Sheet, not the shared Guest Post Anchor tab.');
}

export async function createProject(input: ProjectInput) {
  const profile = await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  await assertCategorySheetMode(parsed.category, parsed.sheet_source);
  const supabase = await createClient();
  // Refuse before any draft insert when the admin has not connected their own Drive.
  if (parsed.create_new_sheet) {
    const connection = await getConnectionStatus(profile.id);
    if (!connection.connected) throw new Error('Connect Google Drive before creating a project sheet. Open Profile → Google Drive → Connect. No project draft was created.');
    try { await getUserGoogleClient(profile.id); } catch (error) { throw new Error(`${error instanceof Error ? error.message : 'Google Drive connection is unavailable.'} No project draft was created.`); }
  }
  // Validate the FK before creating a Google spreadsheet (no orphan sheets).
  const categoryId = await resolveProjectCategoryId(parsed.category);
  if (parsed.sheet_source === 'guest_post_anchor') {
    const { data: duplicate, error: duplicateError } = await supabase.from('projects')
      .select('id,name').eq('sheet_source', 'guest_post_anchor')
      .eq('guest_post_tab_name', parsed.create_new_tab ? (parsed.new_tab_name?.trim() || parsed.name) : parsed.guest_post_tab_name).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new Error(`This Guest Post Anchor tab is already connected to ${duplicate.name}. Choose another tab.`);
  }
  const sheet = (parsed.create_new_sheet || parsed.create_new_tab) ? null : await resolveProjectSheet(parsed, undefined, profile.id);
  if (parsed.sheet_source === 'custom_sheet' && sheet?.google_sheet_id) {
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

  if (parsed.create_new_sheet) {
    const { data: draft, error: draftError } = await supabase.from('projects').insert({
      name: parsed.name, slug, outreach_project_name: parsed.outreach_project_name || parsed.name, category: parsed.category, category_id: categoryId,
      sheet_source: parsed.sheet_source, google_sheet_id: null, google_sheet_gid: null, sheet_owner_user_id: profile.id, sheet_name: parsed.new_sheet_title, guest_post_tab_name: parsed.guest_post_tab_name,
      column_mapping: parsed.column_mapping, sync_enabled: false, active: true, sheet_setup_state: 'pending', sheet_setup_error: null,
    }).select('id').single();
    if (draftError || !draft) throw new Error(draftError?.message || 'Could not save project before creating its Google Sheet.');
    try {
      const created = await createSpreadsheetForUser({ userId: profile.id, title: parsed.new_sheet_title || parsed.name, tabs: [{ title: parsed.guest_post_tab_name || parsed.name, headers: parsed.column_mapping.map((item) => item.heading), statusValues: ['Request shared', 'Live', 'Rejected'] }], onCreated: async (newSheet) => {
        const { error } = await adminClient.from('projects').update({ google_sheet_id: newSheet.spreadsheetId, google_sheet_gid: newSheet.tabs[0]?.gid ?? null, sheet_name: parsed.new_sheet_title || parsed.name, guest_post_tab_name: parsed.guest_post_tab_name || parsed.name, sheet_setup_state: 'pending', sheet_setup_error: null, sheet_owner_user_id: profile.id }).eq('id', draft.id);
        if (error) throw new Error(`Sheet was created but its ID could not be saved for retry: ${error.message}`);
      } });
      const { error: finishError } = await adminClient.from('projects').update({ google_sheet_id: created.spreadsheetId, google_sheet_gid: created.tabs[0]?.gid ?? null, sheet_name: parsed.new_sheet_title || parsed.name, guest_post_tab_name: parsed.guest_post_tab_name || parsed.name, column_mapping: parsed.column_mapping, sync_enabled: parsed.sync_enabled && created.setupState === 'connected', sheet_setup_state: created.setupState, sheet_setup_error: created.setupError }).eq('id', draft.id);
      if (finishError) throw new Error(`Sheet ${created.spreadsheetId} was created, but project setup status could not be saved: ${finishError.message}`);
    } catch (error) {
      const { data: persisted } = await adminClient.from('projects').select('google_sheet_id').eq('id', draft.id).maybeSingle();
      if (!persisted?.google_sheet_id) {
        await adminClient.from('projects').delete().eq('id', draft.id);
      } else {
        await adminClient.from('projects').update({ sheet_setup_state: 'error', sheet_setup_error: error instanceof Error ? error.message.slice(0, 500) : 'Sheet setup failed.', sync_enabled: false }).eq('id', draft.id);
      }
      throw error;
    }
    revalidatePath('/projects'); revalidatePath('/requests/new'); return;
  }
  const { error } = await supabase.from('projects').insert({
    name: parsed.name,
    slug,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    category: parsed.category,
    category_id: categoryId,
    sheet_source: parsed.sheet_source,
    ...(sheet || {}),
    ...(parsed.create_new_tab ? { guest_post_tab_name: parsed.new_tab_name?.trim() || parsed.name, tab_setup_state: 'pending', tab_setup_error: null } : {}),
    sync_enabled: parsed.sync_enabled,
    active: true,
  });
  if (error) throw error;
  if (parsed.create_new_tab) {
    const { data: saved } = await supabase.from('projects').select('id').eq('slug', slug).single();
    if (saved?.id) {
      try {
        await createGuestPostAnchorTab(parsed.new_tab_name?.trim() || parsed.name, parsed.column_mapping.map(item => item.heading));
        await adminClient.from('projects').update({ tab_setup_state: 'connected', tab_setup_error: null }).eq('id', saved.id);
      } catch (tabError) {
        await adminClient.from('projects').update({ tab_setup_state: 'error', tab_setup_error: tabError instanceof Error ? tabError.message.slice(0,500) : 'Tab setup failed.' }).eq('id', saved.id);
      }
    }
  }
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}

export async function updateProject(id: string, input: ProjectInput) {
  await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  await assertCategorySheetMode(parsed.category, parsed.sheet_source);
  const supabase = await createClient();
  const categoryId = await resolveProjectCategoryId(parsed.category);
  const { data: existing, error: lookupError } = await supabase.from('projects').select('google_sheet_id,google_sheet_gid,guest_post_tab_name,sheet_source,column_mapping').eq('id', id).single();
  if (lookupError || !existing) throw new Error(lookupError?.message || 'Project not found');
  if (parsed.create_new_sheet) throw new Error('Create a new Google Sheet only while adding a project. Connect an existing Sheet URL to change this project.');
  if (parsed.create_new_tab) throw new Error('Create a new Guest Post Anchor tab only while adding a project.');
  if (existing.sheet_source === 'guest_post_anchor' && parsed.sheet_source === 'guest_post_anchor' &&
      existing.guest_post_tab_name !== parsed.guest_post_tab_name) {
    throw new Error('Existing Guest Post Anchor project tabs cannot be reassigned. Create a new project instead to protect linked requests and Sheet rows.');
  }
  // Never overwrite the A:H mapping of an existing shared Guest Post Anchor project.
  // Its historic rows and the installed workbook-level trigger depend on those positions.
  const sheet = await resolveProjectSheet(parsed, existing, undefined);
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

export async function retryProjectTabSetup(projectId: string) {
  await requireAdminForAction();
  const id = z.string().uuid().parse(projectId);
  const { data: project, error } = await adminClient.from('projects').select('id,name,guest_post_tab_name,column_mapping,sheet_source').eq('id',id).single();
  if (error || !project) throw new Error(error?.message || 'Project not found.');
  if (project.sheet_source !== 'guest_post_anchor') throw new Error('This is not a Guest Post Anchor project.');
  try {
    await createGuestPostAnchorTab(String(project.guest_post_tab_name || project.name), (Array.isArray(project.column_mapping) ? project.column_mapping as Array<{heading:string}> : []).map(item => item.heading));
    const { error: updateError } = await adminClient.from('projects').update({ tab_setup_state:'connected',tab_setup_error:null }).eq('id',id);
    if (updateError) throw new Error(updateError.message);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0,500) : 'Tab setup failed.';
    await adminClient.from('projects').update({ tab_setup_state:'error',tab_setup_error:message }).eq('id',id);
    throw new Error(message);
  }
  revalidatePath('/projects'); revalidatePath('/projects/[slug]','page');
  return 'Guest Post Anchor tab verified or created without duplicating an existing tab.';
}

export async function retryProjectSheetSetup(projectId: string) {
  const profile = await requireAdminForAction();
  const id = z.string().uuid().parse(projectId);
  const { data: project, error } = await adminClient.from('projects').select('id,google_sheet_id,sheet_setup_state,sheet_name,guest_post_tab_name,sheet_owner_user_id').eq('id', id).single();
  if (error || !project) throw new Error(error?.message || 'Project not found.');
  if (!project.google_sheet_id) throw new Error('This project has no saved spreadsheet ID. Use Create sheet now to create one.');
  try {
    await repairServiceAccountAccess(String(project.sheet_owner_user_id || profile.id), String(project.google_sheet_id));
    const { error: updateError } = await adminClient.from('projects').update({ sheet_setup_state: 'connected', sheet_setup_error: null }).eq('id', id);
    if (updateError) throw new Error(updateError.message);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 500) : 'Sheet repair failed.';
    await adminClient.from('projects').update({ sheet_setup_state: 'error', sheet_setup_error: message }).eq('id', id);
    throw new Error(message);
  }
  revalidatePath('/projects');
  revalidatePath('/projects/[slug]', 'page');
  return 'Service-account access repaired. The existing spreadsheet was reused.';
}

export async function createSheetForExistingProject(projectId: string) {
  const profile = await requireAdminForAction();
  const id = z.string().uuid().parse(projectId);
  const { data: project, error } = await adminClient.from('projects').select('id,name,google_sheet_id,sheet_name,guest_post_tab_name,column_mapping,sheet_owner_user_id').eq('id', id).single();
  if (error || !project) throw new Error(error?.message || 'Project not found.');
  if (project.google_sheet_id) throw new Error('This project already has a spreadsheet ID. Use Retry setup / Repair access instead.');
  const connection = await getConnectionStatus(profile.id);
  if (!connection.connected) throw new Error('Connect Google Drive from Profile before creating this project sheet.');
  const mapping = Array.isArray(project.column_mapping) ? project.column_mapping as Array<{heading:string}> : [];
  if (!mapping.length) throw new Error('This project has no saved column mapping. Edit the project and configure its headings first.');
  const title = String(project.sheet_name || project.name).trim();
  const tab = String(project.guest_post_tab_name || project.name).trim();
  const created = await createSpreadsheetForUser({ userId: profile.id, title, tabs: [{ title: tab, headers: mapping.map((item) => item.heading), statusValues: ['Request shared', 'Live', 'Rejected'] }], onCreated: async (sheet) => {
    const { error: persistError } = await adminClient.from('projects').update({ google_sheet_id: sheet.spreadsheetId, google_sheet_gid: sheet.tabs[0]?.gid ?? null, sheet_owner_user_id: profile.id, sheet_setup_state: 'pending', sheet_setup_error: null, sync_enabled: false }).eq('id', id).is('google_sheet_id', null);
    if (persistError) throw new Error(`Sheet was created but its ID could not be saved for retry: ${persistError.message}`);
  } });
  const { error: updateError } = await adminClient.from('projects').update({ google_sheet_id: created.spreadsheetId, google_sheet_gid: created.tabs[0]?.gid ?? null, sheet_owner_user_id: profile.id, sheet_setup_state: created.setupState, sheet_setup_error: created.setupError, sync_enabled: created.setupState === 'connected' }).eq('id', id);
  if (updateError) throw new Error(`Sheet ${created.spreadsheetId} was created, but project setup status could not be saved: ${updateError.message}`);
  revalidatePath('/projects'); revalidatePath('/projects/[slug]', 'page');
  return created.setupState === 'connected' ? 'Sheet created and connected.' : `Sheet created, but setup needs repair: ${created.setupError || 'Unknown setup error'}`;
}

export async function toggleProjectActive(id: string, active: boolean) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { error } = await supabase.from('projects').update({ active }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}


/** Admin-only archival; never changes historical requests or Sheets. */
export async function setProjectArchived(projectId: string, archived: boolean) {
  await requireAdminForAction();
  const id = z.string().uuid().parse(projectId);
  const {data:project,error:lookupError}=await adminClient.from('projects').select('id,name,active').eq('id',id).maybeSingle();
  if(lookupError || !project)throw new Error(lookupError?.message||'Project no longer exists.');
  const {error}=await adminClient.from('projects').update({active:!archived}).eq('id',id);
  if(error)throw new Error(`Could not ${archived?'archive':'restore'} project: ${error.message}`);
  revalidatePath('/projects');revalidatePath('/requests/new');
  return archived?'Project archived. Existing requests and Google Sheets are unchanged.':'Project restored.';
}

/** Permanent deletion is intentionally restricted to empty projects only. */
export async function deleteEmptyProject(projectId: string, expectedName: string) {
  await requireAdminForAction();
  const id=z.string().uuid().parse(projectId);
  const {data:project,error:lookupError}=await adminClient.from('projects').select('id,name').eq('id',id).maybeSingle();
  if(lookupError||!project)throw new Error(lookupError?.message||'Project not found.');
  if(String(expectedName).trim()!==project.name)throw new Error('The typed project name does not match. Nothing was deleted.');
  const {count,error:countError}=await adminClient.from('requests').select('id',{count:'exact',head:true}).eq('project_id',id);
  if(countError)throw new Error(`Could not safely verify project requests: ${countError.message}`);
  if((count??0)>0)throw new Error(`This project has ${count} request(s). Archive it instead; linked history cannot be permanently deleted here.`);
  const {count:siteCount,error:siteError}=await adminClient.from('project_sites').select('id',{count:'exact',head:true}).eq('project_id',id);
  if(siteError)throw new Error(`Could not safely verify project sites: ${siteError.message}`);
  if((siteCount??0)>0)throw new Error(`This project has ${siteCount} linked site row(s). Archive it instead.`);
  const {error}=await adminClient.from('projects').delete().eq('id',id);
  if(error)throw new Error(`Deletion blocked to protect linked data: ${error.message}. Archive the project instead.`);
  revalidatePath('/projects');revalidatePath('/requests/new');
  return 'Empty project removed. No Google Sheet was deleted.';
}
