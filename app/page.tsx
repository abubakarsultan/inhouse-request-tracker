import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';

export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.onboarding_completed || !profile.sheet_name) redirect('/onboarding');
  if (profile.account_status === 'pending') redirect('/pending');
  if (profile.account_status === 'disabled') redirect('/login?error=disabled');
  redirect('/dashboard');
}
