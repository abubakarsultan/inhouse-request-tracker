'use server';

import { createClient } from '@/lib/supabase-server';
import { adminClient } from '@/lib/supabase-admin';
import { projectSchema, validateSheetTabName, type ProjectInput } from '@/lib/validators';
import { checkProjectSheetConnection, ensureTeamSheetTab, getProjectSheetScript, getTeamSheetTabs, prepareOwnSheetConnection } from '@/services/google-sheet-sync';
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
}

export async function getActiveProjects() {
  await requireActiveUserForAction();
  return getProjects(undefined, true);
}

export async function getProjectBySlug(slug: string) {
  const profile = await requireActiveUserForAction();
  if (profile.role === 'member') throw new Error('Project details are available to admins and read-only viewers.');
  const { data, error } = await adminClient
    .from('projects')
    .select('id,name,slug,outreach_project_name,guest_post_tab_name,google_sheet_id,sync_enabled,active,created_at,updated_at,category_id,sheet_source,sheet_tab_name,sheet_column_config,sheet_share_emails,project_categories(id,name,slug)')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}

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
    guest_post_tab_name: guestPostTabName,
    sync_enabled: syncEnabled,
    category_id: category.id,
    sheet_source: source,
    sheet_tab_name: tabName,
    sheet_column_config: columnConfig,
    sheet_share_emails: shareEmails,
    google_sheet_id: sheetId,
    active: true,
  }).select('id').single();
  if (error || !createdProject) throw error ?? new Error('Could not create project.');

  let warning: string | undefined;
  if (source === 'guest_post_anchor' && syncEnabled && tabName) {
    try {
      await ensureTeamSheetTab(tabName);
    } catch (caught) {
      warning = `Project saved, but the Guest Post Anchor tab was not created: ${caught instanceof Error ? caught.message : String(caught)}`;
      await adminClient.from('sync_logs').insert({ direction: 'to_sheet', sheet_name: tabName, status: 'error', detail: warning });
    }
  }

  revalidatePath('/projects');
  revalidatePath('/requests/new');
  return { warning };
}

export async function updateProject(id: string, input: ProjectInput) {
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
export async function saveProjectCategory(input: { id?: string; name: string; sheet_mode: 'team_sheet_tab' | 'own_sheet'; sort_order?: number; active?: boolean }) {
  await requireAdminForAction();
  const name = input.name.trim();
  if (!name) throw new Error('Category name is required.');
  const categoryKey = name.toLowerCase() === 'on page' ? 'onpage' : slugify(name);
  if (!FIXED_CATEGORY_SLUGS.includes(categoryKey as typeof FIXED_CATEGORY_SLUGS[number])) {
    throw new Error('Project categories are fixed: Inhouse, Client, On Page, and Others.');
  }
  const supabase = await createClient();
  const slug = categoryKey;
  const { error } = await supabase.from('project_categories').update({ name, slug, sheet_mode: input.sheet_mode, sort_order: input.sort_order ?? 0, active: true }).eq('slug', slug);
  if (error) throw new Error(error.message);
  revalidatePath('/projects');
}

export async function deactivateProjectCategory(id: string) {
  await requireAdminForAction();
  throw new Error('The four project categories are fixed and cannot be deactivated.');
}
