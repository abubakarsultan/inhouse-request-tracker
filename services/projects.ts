'use server';
import { createClient } from '@/lib/supabase-server';
import { requireAdmin, requireUser } from '@/lib/session';
import { projectSchema, type ProjectInput } from '@/lib/validators';
import { slugify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

export async function getProjects(search?: string) {
  await requireUser();
  const supabase = await createClient();
  let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getProjectBySlug(slug: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

export async function createProject(input: ProjectInput) {
  const user = await requireAdmin();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();

  const baseSlug = slugify(parsed.name);
  let slug = baseSlug;
  for (let i = 1; i < 50; i++) {
    const { data: clash } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${i + 1}`;
  }

  const { error } = await supabase.from('projects').insert({ ...parsed, slug, created_by: user.id });
  if (error) throw error;
  revalidatePath('/projects');
}

export async function updateProject(id: string, input: ProjectInput) {
  await requireAdmin();
  const parsed = projectSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from('projects').update(parsed).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
}

export async function toggleProjectActive(id: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from('projects').update({ active }).eq('id', id);
  if (error) throw error;
  revalidatePath('/projects');
}
