'use server';
import { cookies } from 'next/headers';
import { adminClient } from '@/lib/supabase-admin';
export async function requestInvitation(): Promise<{ ok: boolean; message: string }> {
  const jar = await cookies();
  const email = jar.get('inhouse_uninvited_email')?.value?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'Please sign in with Google again so we can verify your email.' };
  const { error } = await adminClient.from('access_requests').upsert({ email, status: 'open', updated_at: new Date().toISOString() }, { onConflict: 'email', ignoreDuplicates: false });
  if (error) return { ok: false, message: 'Could not save the request. Please try again later.' };
  return { ok: true, message: 'Your invitation request has been sent. An admin will review it.' };
}
