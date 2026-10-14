'use server';

import { createClient } from '@/lib/supabase-server';
import { adminClient } from '@/lib/supabase-admin';
import { projectSchema, validateSheetTabName, type ProjectInput } from '@/lib/validators';
<<<<<<< HEAD
import { checkProjectSheetConnection, ensureTeamSheetTab, getProjectSheetScript, getTeamSheetTabs, prepareOwnSheetConnection } from '@/services/google-sheet-sync';
=======
import { ensureTeamSheetTab, prepareOwnSheetConnection } from '@/services/google-sheet-sync';
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
import { slugify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';

export type ProjectSheetSource = 'guest_post_anchor' | 'own_sheet' | 'none';

const FIXED_CATEGORY_SLUGS = ['inhouse', 'client', 'onpage', 'others'] as const;

export async function getProjects(search?: string, activeOnly = false) {
  const supabase = await createClient();
  let query = supabase
    .from('projects')
    .select('id,name,slug,active,category_id,sheet_source,guest_post_tab_name,google_sheet_id,sheet_tab_name,sync_enabled,outreach_project_name')
    .order('name', { ascending: true });
  if (search) query = query.ilike('name', `%${search}%`);
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getProjectOverview(search?: string) {
  const profile = await requireActiveUserForAction();
  if (profile.role === 'member') throw new Error('Company-wide project counts are not available to member accounts.');

  const [projectResult, categoryResult, countResult] = await Promise.all([
    adminClient
      .from('projects')
      .select('id,name,slug,active,category_id,sheet_source,guest_post_tab_name,google_sheet_id,sheet_tab_name,sync_enabled,outreach_project_name')
      .order('name', { ascending: true }),
    adminClient
      .from('project_categories')
      .select('id,name,slug,sort_order,sheet_mode,active')
      .in('slug', [...FIXED_CATEGORY_SLUGS])
      .order('sort_order')
      .order('name'),
    adminClient.rpc('get_project_request_counts'),
  ]);

  if (projectResult.error) throw projectResult.error;
  if (categoryResult.error) throw categoryResult.error;
  if (countResult.error) throw countResult.error;

  const categories = categoryResult.data ?? [];
  const categoryById = new Map(categories.map((category: any) => [String(category.id), category]));
  const counts = new Map<string, { requests: number; live: number; pending: number; rejected: number }>();
  for (const row of countResult.data ?? []) {
    counts.set(String((row as any).project_id), {
      requests: Number((row as any).request_count ?? 0),
      live: Number((row as any).live_count ?? 0),
      pending: Number((row as any).pending_count ?? 0),
      rejected: Number((row as any).rejected_count ?? 0),
    });
  }

  const projects = (projectResult.data ?? []).filter((project: any) => !search || String(project.name).toLowerCase().includes(search.toLowerCase()));
  return {
    categories,
    projects: projects.map((project: any) => ({
      ...project,
      category: categoryById.get(String(project.category_id)) ?? null,
      counts: counts.get(String(project.id)) ?? { requests: 0, live: 0, pending: 0, rejected: 0 },
    })),
  };
}

export async function getProjectsWithCounts(search?: string) {
  const overview = await getProjectOverview(search);
  return overview.projects;
}


<<<<<<< HEAD
export async function getProjectCounts(projectId: string) {
  await requireActiveUserForAction();
  const { data, error } = await adminClient.rpc('get_single_project_request_counts', { p_project_id: projectId });
  if (error) throw new Error(error.message);
  const row = (data?.[0] ?? {}) as any;
  return {
    requests: Number(row.request_count ?? 0),
    live: Number(row.live_count ?? 0),
    pending: Number(row.pending_count ?? 0),
    rejected: Number(row.rejected_count ?? 0),
  };
}

export async function getProjectCategories(activeOnly = true) {
  const supabase = await createClient();
  let query = supabase
    .from('project_categories')
    .select('id,name,slug,sort_order,sheet_mode,active')
    .in('slug', [...FIXED_CATEGORY_SLUGS])
    .order('sort_order')
    .order('name');
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
=======
export async function getProjectsWithCounts(search?: string) {
  const { requireActiveUserForAction } = await import('@/lib/auth');
  const profile = await requireActiveUserForAction();
  if (profile.role === 'member') throw new Error('Company-wide project counts are not available to member accounts.');
  const supabase = adminClient;
  let projectQuery = supabase.from('projects').select('*').order('name', { ascending: true });
  if (search) projectQuery = projectQuery.ilike('name', `%${search}%`);
  const { data: projects, error: projectsError } = await projectQuery;
  if (projectsError) throw projectsError;
  const categories = await getProjectCategories(false);
  const categoryById = new Map(categories.map((category: any) => [String(category.id), category]));
  const rows: Array<{ project_id: string; status: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('requests').select('project_id,status').is('deleted_at', null).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ project_id: string; status: string }>));
    if ((data ?? []).length < 1000) break;
  }

  const counts = new Map<string, { requests: number; live: number; pending: number; rejected: number }>();
  for (const row of rows) {
    const item = counts.get(row.project_id) ?? { requests: 0, live: 0, pending: 0, rejected: 0 };
    item.requests += 1;
    if (row.status === 'Live') item.live += 1;
    if (row.status === 'Request shared') item.pending += 1;
    if (row.status === 'Rejected') item.rejected += 1;
    counts.set(row.project_id, item);
  }

  return projects.map((project: any) => ({
    ...project,
    category: categoryById.get(String(project.category_id)) ?? null,
    counts: counts.get(String(project.id)) ?? { requests: 0, live: 0, pending: 0, rejected: 0 },
  }));
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
}

export async function getProjectCategories(activeOnly = true) {
  const supabase = await createClient();
  let query = supabase.from('project_categories').select('id,name,slug,sort_order,sheet_mode,active').order('sort_order').order('name');
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getActiveProjects() {
  await requireActiveUserForAction();
  return getProjects(undefined, true);
}

export async function getProjectBySlug(slug: string) {
<<<<<<< HEAD
  const profile = await requireActiveUserForAction();
  if (profile.role === 'member') throw new Error('Project details are available to admins and read-only viewers.');
  const { data, error } = await adminClient
    .from('projects')
    .select('id,name,slug,outreach_project_name,guest_post_tab_name,google_sheet_id,sync_enabled,active,created_at,updated_at,category_id,sheet_source,sheet_tab_name,sheet_column_config,sheet_share_emails,project_categories(id,name,slug)')
    .eq('slug', slug)
    .single();
=======
  const { requireActiveUserForAction } = await import('@/lib/auth');
  const profile = await requireActiveUserForAction();
  if (profile.role === 'member') throw new Error('Project details are available to admins and read-only viewers.');
  const supabase = adminClient;
  const { data, error } = await supabase.from('projects').select('*').eq('slug', slug).single();
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
  if (error) throw error;
  return data;
}

<<<<<<< HEAD
function normalizeSheetSource(value: unknown, fallback: ProjectSheetSource): ProjectSheetSource {
  const source = String(value ?? '').trim();
  if (source === 'guest_post_anchor' || source === 'own_sheet' || source === 'none') return source;
  return fallback;
}

function categorySlug(category: any) {
  return String(category?.slug ?? '').trim().toLowerCase();
}

function legacySheetSource(input: ProjectInput, category: any): ProjectSheetSource {
  if (input.google_sheet_id) return 'own_sheet';
  if (input.guest_post_tab_name || input.sheet_tab_name) return 'guest_post_anchor';
  return categorySlug(category) === 'inhouse' ? 'guest_post_anchor' : 'none';
}

async function loadCategory(supabase: Awaited<ReturnType<typeof createClient>>, categoryId?: string) {
  const id = categoryId;
  if (id) {
    const { data, error } = await supabase.from('project_categories').select('id,name,slug,sheet_mode').eq('id', id).single();
    if (error || !data) throw new Error(error?.message ?? 'Selected category was not found.');
    return data;
  }
  const { data, error } = await supabase.from('project_categories').select('id,name,slug,sheet_mode').eq('slug', 'inhouse').single();
  if (error || !data) throw new Error('Inhouse category is missing. Run database/migrations/010_project_sheet_sources_and_performance.sql first.');
  return data;
}

function validateSheetSourceForCategory(source: ProjectSheetSource, category: any) {
  if (categorySlug(category) === 'inhouse') return;
  if (source === 'guest_post_anchor') return; // preserve legacy mappings if an older non-Inhouse project already uses the master sheet.
}

=======
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
export async function createProject(input: ProjectInput): Promise<{ warning?: string }> {
  await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();
  const category = await loadCategory(supabase, parsed.category_id);
  const source = normalizeSheetSource(parsed.sheet_source, legacySheetSource(parsed, category));
  validateSheetSourceForCategory(source, category);

  let tabName = parsed.sheet_tab_name || parsed.guest_post_tab_name || parsed.name;
  let sheetId: string | null = null;
  let columnConfig = parsed.sheet_column_config ?? {};
  let shareEmails = parsed.sheet_share_emails ?? [];
  let syncEnabled = Boolean(parsed.sync_enabled);
  let guestPostTabName: string | null = null;

  if (source === 'guest_post_anchor') {
    const invalid = validateSheetTabName(tabName);
    if (syncEnabled && invalid) throw new Error(invalid);
    guestPostTabName = tabName || null;
    sheetId = null;
    columnConfig = {};
    shareEmails = [];
  } else if (source === 'own_sheet') {
    const mode = parsed.sheet_connection_mode ?? (parsed.google_sheet_id ? 'existing' : 'none');
    if (mode === 'none') {
      syncEnabled = false;
      sheetId = null;
      tabName = parsed.sheet_tab_name || 'Live Link';
    } else {
      const connection = await prepareOwnSheetConnection({
        mode,
        title: parsed.name,
        url: parsed.sheet_url || parsed.google_sheet_id,
        tabName: parsed.sheet_tab_name || 'Live Link',
        shareEmails,
        includeDrTraffic: Boolean(parsed.include_dr_traffic),
      });
      sheetId = connection.spreadsheetId;
      tabName = connection.tabName;
      columnConfig = connection.sheetColumnConfig;
      shareEmails = connection.shareEmails;
      syncEnabled = true;
    }
  } else {
    syncEnabled = false;
    sheetId = null;
    tabName = parsed.sheet_tab_name || parsed.guest_post_tab_name || null;
    guestPostTabName = parsed.guest_post_tab_name || null;
    columnConfig = {};
    shareEmails = [];
  }

  let categoryId = parsed.category_id ?? null;
  if (!categoryId) {
    const { data: defaultCategory, error: categoryError } = await supabase.from('project_categories').select('id').eq('slug', 'inhouse').single();
    if (categoryError || !defaultCategory) throw new Error('Inhouse category is missing. Run database/migrations/009_project_categories_sheets_roles.sql first.');
    categoryId = String(defaultCategory.id);
  }
  const { data: categoryRow, error: categoryModeError } = await supabase.from('project_categories').select('id,name,sheet_mode').eq('id', categoryId).single();
  if (categoryModeError || !categoryRow) throw new Error(categoryModeError?.message ?? 'Selected category was not found.');
  let tabName = categoryRow.sheet_mode === 'own_sheet' ? (parsed.sheet_tab_name || 'Live Link') : (parsed.sheet_tab_name || parsed.guest_post_tab_name || parsed.name);
  let sheetId = parsed.google_sheet_id || null;
  let columnConfig = parsed.sheet_column_config ?? {};
  let shareEmails = parsed.sheet_share_emails ?? [];
  let syncEnabled = parsed.sync_enabled;
  if (categoryRow.sheet_mode === 'team_sheet_tab' && parsed.sync_enabled) { const invalid = validateSheetTabName(tabName); if (invalid) throw new Error(invalid); }
  if (categoryRow.sheet_mode === 'own_sheet') {
    const mode = parsed.sheet_connection_mode ?? (parsed.google_sheet_id ? 'existing' : 'none');
    if (mode === 'none') { syncEnabled = false; sheetId = null; }
    else {
      const connection = await prepareOwnSheetConnection({ mode, title: parsed.name, url: parsed.sheet_url || parsed.google_sheet_id, tabName, shareEmails, includeDrTraffic: Boolean(parsed.include_dr_traffic) });
      sheetId = connection.spreadsheetId; tabName = connection.tabName; columnConfig = connection.sheetColumnConfig; shareEmails = connection.shareEmails; syncEnabled = true;
    }
  }
  const baseSlug = slugify(parsed.name) || 'project';
  let slug = baseSlug;
  for (let i = 1; i < 50; i += 1) {
    const { data: clash, error: clashError } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
    if (clashError) throw new Error(clashError.message);
    if (!clash) break;
    slug = `${baseSlug}-${i + 1}`;
  }

  const { data: createdProject, error } = await supabase.from('projects').insert({
    name: parsed.name,
    slug,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
<<<<<<< HEAD
    guest_post_tab_name: guestPostTabName,
    sync_enabled: syncEnabled,
    category_id: category.id,
    sheet_source: source,
=======
    guest_post_tab_name: parsed.guest_post_tab_name || null,
    sync_enabled: syncEnabled,
    category_id: categoryId,
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
    sheet_tab_name: tabName,
    sheet_column_config: columnConfig,
    sheet_share_emails: shareEmails,
    google_sheet_id: sheetId,
    active: true,
  }).select('id').single();
  if (error || !createdProject) throw error ?? new Error('Could not create project.');
<<<<<<< HEAD

  let warning: string | undefined;
  if (source === 'guest_post_anchor' && syncEnabled && tabName) {
    try {
      await ensureTeamSheetTab(tabName);
    } catch (caught) {
      warning = `Project saved, but the Guest Post Anchor tab was not created: ${caught instanceof Error ? caught.message : String(caught)}`;
      await adminClient.from('sync_logs').insert({ direction: 'to_sheet', sheet_name: tabName, status: 'error', detail: warning });
    }
  }

=======
  let warning: string | undefined;
  if (categoryRow.sheet_mode === 'team_sheet_tab' && parsed.sync_enabled) {
    try { await ensureTeamSheetTab(tabName); }
    catch (caught) {
      warning = `Project saved, but Sheet tab was not created. Fix the issue and retry: ${caught instanceof Error ? caught.message : String(caught)}`;
      await adminClient.from('sync_logs').insert({ direction: 'to_sheet', sheet_name: tabName, status: 'error', detail: warning });
    }
  }
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
  revalidatePath('/projects');
  revalidatePath('/requests/new');
  return { warning };
}

export async function updateProject(id: string, input: ProjectInput) {
  await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();
<<<<<<< HEAD
  const category = await loadCategory(supabase, parsed.category_id);
  const source = normalizeSheetSource(parsed.sheet_source, legacySheetSource(parsed, category));
  validateSheetSourceForCategory(source, category);

  let tabName = parsed.sheet_tab_name || parsed.guest_post_tab_name || parsed.name;
  let sheetId: string | null = null;
  let columnConfig = parsed.sheet_column_config ?? {};
  let shareEmails = parsed.sheet_share_emails ?? [];
  let syncEnabled = Boolean(parsed.sync_enabled);
  let guestPostTabName: string | null = null;

  if (source === 'guest_post_anchor') {
    if (syncEnabled) {
      const invalid = validateSheetTabName(tabName);
      if (invalid) throw new Error(invalid);
    }
    guestPostTabName = tabName || null;
    sheetId = null;
    columnConfig = {};
    shareEmails = [];
  } else if (source === 'own_sheet') {
    const mode = parsed.sheet_connection_mode ?? (parsed.google_sheet_id ? 'existing' : 'none');
    if (mode === 'none') {
      syncEnabled = false;
      sheetId = null;
      tabName = parsed.sheet_tab_name || 'Live Link';
    } else {
      const connection = await prepareOwnSheetConnection({
        mode,
        title: parsed.name,
        url: parsed.sheet_url || parsed.google_sheet_id,
        tabName: parsed.sheet_tab_name || 'Live Link',
        shareEmails,
        includeDrTraffic: Boolean(parsed.include_dr_traffic),
      });
      sheetId = connection.spreadsheetId;
      tabName = connection.tabName;
      columnConfig = connection.sheetColumnConfig;
      shareEmails = connection.shareEmails;
      syncEnabled = true;
    }
  } else {
    syncEnabled = false;
    sheetId = null;
    tabName = parsed.sheet_tab_name || parsed.guest_post_tab_name || null;
    guestPostTabName = parsed.guest_post_tab_name || null;
    columnConfig = {};
    shareEmails = [];
  }

  const { error } = await supabase.from('projects').update({
    name: parsed.name,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    guest_post_tab_name: guestPostTabName,
    sync_enabled: syncEnabled,
    category_id: category.id,
    sheet_source: source,
=======
  let tabName = parsed.sheet_tab_name || parsed.guest_post_tab_name || parsed.name;
  let sheetId = parsed.google_sheet_id || null;
  let columnConfig = parsed.sheet_column_config ?? {};
  let shareEmails = parsed.sheet_share_emails ?? [];
  let syncEnabled = parsed.sync_enabled;
  if (parsed.category_id) {
    const { data: category, error: categoryError } = await supabase.from('project_categories').select('sheet_mode').eq('id', parsed.category_id).single();
    if (categoryError || !category) throw new Error(categoryError?.message ?? 'Selected category was not found.');
    if (category.sheet_mode === 'team_sheet_tab') { sheetId = null; columnConfig = {}; shareEmails = []; if (parsed.sync_enabled) { const invalid = validateSheetTabName(tabName); if (invalid) throw new Error(invalid); } }
    if (category.sheet_mode === 'own_sheet') {
      const mode = parsed.sheet_connection_mode ?? (sheetId ? 'existing' : 'none');
      if (mode === 'none') { syncEnabled = false; sheetId = null; }
      else { const connection = await prepareOwnSheetConnection({ mode, title: parsed.name, url: parsed.sheet_url || sheetId, tabName: parsed.sheet_tab_name || 'Live Link', shareEmails, includeDrTraffic: Boolean(parsed.include_dr_traffic) }); sheetId = connection.spreadsheetId; tabName = connection.tabName; columnConfig = connection.sheetColumnConfig; shareEmails = connection.shareEmails; syncEnabled = true; }
    }
  }
  const { error } = await supabase.from('projects').update({
    name: parsed.name,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    guest_post_tab_name: parsed.guest_post_tab_name || null,
    sync_enabled: syncEnabled,
    ...(parsed.category_id ? { category_id: parsed.category_id } : {}),
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
    sheet_tab_name: tabName,
    sheet_column_config: columnConfig,
    sheet_share_emails: shareEmails,
    google_sheet_id: sheetId,
  }).eq('id', id);
  if (error) throw error;

  if (source === 'guest_post_anchor' && syncEnabled && tabName) {
    try { await ensureTeamSheetTab(tabName); } catch (caught) {
      await adminClient.from('sync_logs').insert({ direction: 'to_sheet', sheet_name: tabName, status: 'error', detail: `Project mapping updated but tab check failed: ${caught instanceof Error ? caught.message : String(caught)}` });
    }
  }

  revalidatePath('/projects');
  revalidatePath('/requests/new');
  revalidatePath(`/projects/${(await supabase.from('projects').select('slug').eq('id', id).single()).data?.slug ?? ''}`);
}

export async function toggleProjectActive(id: string, active: boolean) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { error } = await supabase.from('projects').update({ active }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}

<<<<<<< HEAD
export async function getProjectSheetTabs() {
  await requireAdminForAction();
  return getTeamSheetTabs();
}

export async function ensureProjectGuestPostTab(projectId: string) {
  await requireAdminForAction();
  const { data: project, error } = await adminClient.from('projects').select('id,name,sheet_source,sync_enabled,guest_post_tab_name,sheet_tab_name').eq('id', projectId).single();
  if (error || !project) throw new Error(error?.message ?? 'Project not found.');
  if (String(project.sheet_source) !== 'guest_post_anchor') throw new Error('This project is not connected to the Guest Post Anchor sheet.');
  const tab = String(project.guest_post_tab_name ?? project.sheet_tab_name ?? '').trim();
  if (!tab) throw new Error('Project Sheet tab name is not configured.');
  const result = await ensureTeamSheetTab(tab);
  revalidatePath('/projects');
  return result;
}

export async function testProjectSheetConnection(projectId: string) {
  return checkProjectSheetConnection(projectId);
}

export async function getProjectSheetSetup(projectId: string, siteUrl: string) {
  return getProjectSheetScript(projectId, siteUrl);
}

// Kept for backwards compatibility with the old category-management UI. The
// current product intentionally exposes four fixed categories from Projects.
=======
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
export async function saveProjectCategory(input: { id?: string; name: string; sheet_mode: 'team_sheet_tab' | 'own_sheet'; sort_order?: number; active?: boolean }) {
  await requireAdminForAction();
  const name = input.name.trim();
  if (!name) throw new Error('Category name is required.');
<<<<<<< HEAD
  const categoryKey = name.toLowerCase() === 'on page' ? 'onpage' : slugify(name);
  if (!FIXED_CATEGORY_SLUGS.includes(categoryKey as typeof FIXED_CATEGORY_SLUGS[number])) {
    throw new Error('Project categories are fixed: Inhouse, Client, On Page, and Others.');
  }
  const supabase = await createClient();
  const slug = categoryKey;
  const { error } = await supabase.from('project_categories').update({ name, slug, sheet_mode: input.sheet_mode, sort_order: input.sort_order ?? 0, active: true }).eq('slug', slug);
  if (error) throw new Error(error.message);
=======
  if (name.length > 60) throw new Error('Category name must be 60 characters or fewer.');
  const supabase = await createClient();
  const slug = slugify(name) || 'category';
  if (input.id) {
    const { data: current, error: currentError } = await supabase.from('project_categories').select('id,name,active').eq('id', input.id).single();
    if (currentError || !current) throw new Error(currentError?.message ?? 'Category not found.');
    if (input.active === false && current.active) {
      const { count, error } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('category_id', input.id);
      if (error) throw new Error(error.message);
      if ((count ?? 0) > 0) throw new Error(`Cannot deactivate “${current.name}” because ${count} project(s) still use it. Move those projects first.`);
    }
    const { error } = await supabase.from('project_categories').update({ name, slug, sheet_mode: input.sheet_mode, sort_order: input.sort_order ?? 0, active: input.active ?? true }).eq('id', input.id);
    if (error) throw new Error(error.message.includes('unique') ? 'A category with this name already exists.' : error.message);
  } else {
    const { error } = await supabase.from('project_categories').insert({ name, slug, sheet_mode: input.sheet_mode, sort_order: input.sort_order ?? 0, active: input.active ?? true });
    if (error) throw new Error(error.message.includes('unique') ? 'A category with this name already exists.' : error.message);
  }
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
  revalidatePath('/projects');
}

export async function deactivateProjectCategory(id: string) {
  await requireAdminForAction();
<<<<<<< HEAD
  throw new Error('The four project categories are fixed and cannot be deactivated.');
=======
  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase.from('project_categories').select('name').eq('id', id).single();
  if (categoryError || !category) throw new Error(categoryError?.message ?? 'Category not found.');
  const { count, error } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('category_id', id);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) throw new Error(`Cannot deactivate “${category.name}”: move its ${count} project(s) to another category first.`);
  const { error: updateError } = await supabase.from('project_categories').update({ active: false }).eq('id', id);
  if (updateError) throw new Error(updateError.message);
  revalidatePath('/projects');
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
}
