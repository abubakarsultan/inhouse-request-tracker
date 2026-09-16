'use server';
import { createClient } from '@/lib/supabase-server';
import { requireAdmin, requireUser } from '@/lib/session';
import { revalidatePath } from 'next/cache';

export async function getAssignableUsers() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from('users').select('id,name,email').eq('active', true).order('name');
  if (error) throw error;
  return data;
}

export async function getAllUsers() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function setUserRole(id: string, role: 'admin' | 'member') {
  const admin = await requireAdmin();
  if (admin.id === id) throw new Error("You can't change your own role.");
  const supabase = await createClient();
  const { error } = await supabase.from('users').update({ role }).eq('id', id);
  if (error) throw error;
  revalidatePath('/settings');
}

export async function setUserActive(id: string, active: boolean) {
  const admin = await requireAdmin();
  if (admin.id === id) throw new Error("You can't deactivate your own account.");
  const supabase = await createClient();
  const { error } = await supabase.from('users').update({ active }).eq('id', id);
  if (error) throw error;
  revalidatePath('/settings');
}
