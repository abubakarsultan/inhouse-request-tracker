'use server';

import { createClient } from '@/lib/supabase-server';
import { projectSchema, type ProjectInput } from '@/lib/validators';
import { slugify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { requireActiveUserForAction, requireAdminForAction } from '@/lib/auth';
import { resolveGoogleSheetUrl } from '@/lib/google-sheet-setup';
import { parseGoogleSheetUrl } from '@/lib/google-sheet-url';
import { adminClient } from '@/lib/supabase-admin';

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
  await requireAdminForAction();
  const [projects, { data: countsData, error: countsError }] = await Promise.all([
    getProjects(search), adminClient.rpc('project_request_status_counts'),
  ]);
  if (countsError) throw new Error(`Project stats are unavailable. Run database/migrations/008_project_url_speed.sql in Supabase SQL Editor. ${countsError.message}`);
  const counts = new Map<string, { requests: number; live: number; pending: number; rejected: number }>();
  for (const row of countsData ?? []) {
    counts.set(String(row.project_id), {
      requests: Number(row.requests || 0), live: Number(row.live || 0),
      pending: Number(row.pending || 0), rejected: Number(row.rejected || 0),
    });
  }

  return projects.map((project: any) => ({
    ...project,
    counts: counts.get(String(project.id)) ?? { requests: 0, live: 0, pending: 0, rejected: 0 },
  }));
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

async function resolveProjectSheet(input: ProjectInput, existing?: any) {
  if (input.sheet_source === 'guest_post_anchor') {
    return {
      google_sheet_id: null, google_sheet_gid: null, sheet_name: null,
      guest_post_tab_name: input.guest_post_tab_name || null,
      column_mapping: input.column_mapping,
    };
  }
  if (!input.sheet_url) throw new Error('Paste the Google Sheet URL to connect this project.');
  const parsedUrl = parseGoogleSheetUrl(input.sheet_url);
  const sheet = await resolveGoogleSheetUrl(input.sheet_url);
  // Preserve changes made in Advanced Column Mapping when the tab was not changed.
  const sameTab = existing?.google_sheet_id === parsedUrl.spreadsheetId &&
    Number(existing?.google_sheet_gid) === Number(sheet.google_sheet_gid) &&
    existing?.guest_post_tab_name === sheet.guest_post_tab_name;
  return { ...sheet, column_mapping: sameTab ? input.column_mapping : sheet.column_mapping };
}

export async function createProject(input: ProjectInput) {
  await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();
  const sheet = await resolveProjectSheet(parsed);

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
  const { data: existing, error: lookupError } = await supabase.from('projects').select('google_sheet_id,google_sheet_gid,guest_post_tab_name').eq('id', id).single();
  if (lookupError || !existing) throw new Error(lookupError?.message || 'Project not found');
  const sheet = await resolveProjectSheet(parsed, existing);
  const { error } = await supabase.from('projects').update({
    name: parsed.name,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    category: parsed.category,
    sheet_source: parsed.sheet_source,
    ...sheet,
    sync_enabled: parsed.sync_enabled,
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
