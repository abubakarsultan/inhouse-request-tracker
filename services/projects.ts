'use server';

import { createClient } from '@/lib/supabase-server';
import { adminClient } from '@/lib/supabase-admin';
import { projectSchema, validateSheetTabName, type ProjectInput } from '@/lib/validators';
import { ensureTeamSheetTab, prepareOwnSheetConnection } from '@/services/google-sheet-sync';
import { slugify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';

export async function getProjects(search?: string, activeOnly = false) {
  const supabase = await createClient();
  let query = supabase.from('projects').select('*').order('name', { ascending: true });
  if (search) query = query.ilike('name', `%${search}%`);
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}


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
  const { requireActiveUserForAction } = await import('@/lib/auth');
  const profile = await requireActiveUserForAction();
  if (profile.role === 'member') throw new Error('Project details are available to admins and read-only viewers.');
  const supabase = adminClient;
  const { data, error } = await supabase.from('projects').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

export async function createProject(input: ProjectInput): Promise<{ warning?: string }> {
  await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();

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
    const { data: clash } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${i + 1}`;
  }

  const { data: createdProject, error } = await supabase.from('projects').insert({
    name: parsed.name,
    slug,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    guest_post_tab_name: parsed.guest_post_tab_name || null,
    sync_enabled: syncEnabled,
    category_id: categoryId,
    sheet_tab_name: tabName,
    sheet_column_config: columnConfig,
    sheet_share_emails: shareEmails,
    google_sheet_id: sheetId,
    active: true,
  }).select('id').single();
  if (error || !createdProject) throw error ?? new Error('Could not create project.');
  let warning: string | undefined;
  if (categoryRow.sheet_mode === 'team_sheet_tab' && parsed.sync_enabled) {
    try { await ensureTeamSheetTab(tabName); }
    catch (caught) {
      warning = `Project saved, but Sheet tab was not created. Fix the issue and retry: ${caught instanceof Error ? caught.message : String(caught)}`;
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
    sheet_tab_name: tabName,
    sheet_column_config: columnConfig,
    sheet_share_emails: shareEmails,
    google_sheet_id: sheetId,
  }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}

export async function toggleProjectActive(id: string, active: boolean) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { error } = await supabase.from('projects').update({ active }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}

export async function saveProjectCategory(input: { id?: string; name: string; sheet_mode: 'team_sheet_tab' | 'own_sheet'; sort_order?: number; active?: boolean }) {
  await requireAdminForAction();
  const name = input.name.trim();
  if (!name) throw new Error('Category name is required.');
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
  revalidatePath('/projects');
}

export async function deactivateProjectCategory(id: string) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase.from('project_categories').select('name').eq('id', id).single();
  if (categoryError || !category) throw new Error(categoryError?.message ?? 'Category not found.');
  const { count, error } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('category_id', id);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) throw new Error(`Cannot deactivate “${category.name}”: move its ${count} project(s) to another category first.`);
  const { error: updateError } = await supabase.from('project_categories').update({ active: false }).eq('id', id);
  if (updateError) throw new Error(updateError.message);
  revalidatePath('/projects');
}
