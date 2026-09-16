import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'admin' | 'member';
};

// Reads the signed-in auth user + their public.users profile row (role,
// active flag, name, avatar). Returns null if nobody is signed in, or if
// their profile has been deactivated by an admin.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id,email,name,avatar,role,active')
    .eq('id', auth.user.id)
    .single();

  if (!profile || !profile.active) return null;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    avatar: profile.avatar,
    role: profile.role,
  };
}

// Use at the top of a server component/page that must be signed in.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

// Use at the top of admin-only pages and server actions.
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard?error=forbidden');
  return user;
}
