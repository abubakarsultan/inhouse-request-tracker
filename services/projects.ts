'use server';

import { createClient } from '@/lib/supabase-server';
import { projectSchema, type ProjectInput } from '@/lib/validators';
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
  await requireAdminForAction();
  const supabase = await createClient();
  const projects = await getProjects(search);
  const rows: Array<{ project_id: string; status: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('requests').select('project_id,status').range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ project_id: string; status: string }>));
    if ((data ?? []).length < 1000) break;
  }

  const counts = new Map<string, { requests: number; live: number; pending: number }>();
  for (const row of rows) {
    const item = counts.get(row.project_id) ?? { requests: 0, live: 0, pending: 0 };
    item.requests += 1;
    if (row.status === 'Live') item.live += 1;
    if (row.status === 'Request shared') item.pending += 1;
    counts.set(row.project_id, item);
  }

  return projects.map((project: any) => ({
    ...project,
    counts: counts.get(String(project.id)) ?? { requests: 0, live: 0, pending: 0 },
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

export async function createProject(input: ProjectInput) {
  await requireAdminForAction();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();

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
    guest_post_tab_name: parsed.guest_post_tab_name || null,
    sync_enabled: parsed.sync_enabled,
    google_sheet_id: null,
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
  const { error } = await supabase.from('projects').update({
    name: parsed.name,
    outreach_project_name: parsed.outreach_project_name || parsed.name,
    guest_post_tab_name: parsed.guest_post_tab_name || null,
    sync_enabled: parsed.sync_enabled,
    google_sheet_id: null,
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
