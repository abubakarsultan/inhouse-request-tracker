'use server';

import { createClient } from '@/lib/supabase-server';
import { projectSchema, type ProjectInput } from '@/lib/validators';
import { slugify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

export async function getProjects(search?: string, activeOnly = false) {
  const supabase = await createClient();
  let query = supabase.from('projects').select('*').order('name', { ascending: true });
  if (search) query = query.ilike('name', `%${search}%`);
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getActiveProjects() {
  return getProjects(undefined, true);
}

export async function getProjectBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

export async function createProject(input: ProjectInput) {
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
  const supabase = await createClient();
  const { error } = await supabase.from('projects').update({ active }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
  revalidatePath('/requests/new');
}
