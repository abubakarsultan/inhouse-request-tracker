'use server';
import { createClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/session';
import { requestSchema, canChangeStatus, type RequestInput } from '@/lib/validators';
import { revalidatePath } from 'next/cache';

export async function getRequests(filters?: { status?: string; project_id?: string }) {
  await requireUser();
  const supabase = await createClient();
  let query = supabase
    .from('requests')
    .select('*, projects(id,name,slug,sync_enabled,guest_post_tab_name,google_sheet_id), assignee:assigned_to(id,name,email)')
    .order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.project_id) query = query.eq('project_id', filters.project_id);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createRequest(input: RequestInput) {
  const user = await requireUser();
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from('requests').insert({
    ...parsed,
    status: 'Request Shared', // every request always starts here, per the workflow
    created_by: user.id,
  });
  if (error) throw error;
  revalidatePath('/requests');
  revalidatePath('/dashboard');
}

export async function updateRequestStatus(id: string, nextStatus: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: current, error: fetchErr } = await supabase.from('requests').select('status').eq('id', id).single();
  if (fetchErr) throw fetchErr;
  if (!canChangeStatus(current.status, nextStatus)) {
    throw new Error(`Cannot move a request from "${current.status}" to "${nextStatus}".`);
  }

  const { error } = await supabase.from('requests').update({ status: nextStatus }).eq('id', id);
  if (error) throw error; // the DB trigger is the final backstop if this check is ever bypassed

  await supabase.from('request_logs').insert({
    request_id: id,
    old_status: current.status,
    new_status: nextStatus,
    changed_by: user.id,
  });

  revalidatePath('/requests');
  revalidatePath('/dashboard');

  // fire-and-forget push to the Guest Post Anchor sheet, if this project has sync on
  const { data: full } = await supabase.from('requests').select('*, projects(*)').eq('id', id).single();
  if (full?.projects) {
    const { syncStatusToSheet } = await import('@/services/google-sheet-sync');
    await syncStatusToSheet(full.projects, full.approved_site, nextStatus, id);
  }
}

export async function getDashboardStats() {
  await requireUser();
  const supabase = await createClient();
  const [{ count: total }, { count: live }, { count: pending }, { count: removed }, { count: projects }] = await Promise.all([
    supabase.from('requests').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Live'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Request Shared'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'Removed'),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('active', true),
  ]);
  return {
    total: total ?? 0,
    live: live ?? 0,
    pending: pending ?? 0,
    removed: removed ?? 0,
    projects: projects ?? 0,
  };
}
