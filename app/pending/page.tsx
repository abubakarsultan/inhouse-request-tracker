import { redirect } from 'next/navigation';
import { Clock3 } from 'lucide-react';
import Link from 'next/link';
import { requireAuthenticatedProfile } from '@/lib/auth';
import LogoutButton from '@/components/app/logout-button';

export default async function PendingPage() {
  const profile = await requireAuthenticatedProfile();
  if (!profile.onboarding_completed || !profile.sheet_name) redirect('/onboarding');
  if (profile.account_status === 'active') redirect('/dashboard');
  if (profile.account_status === 'disabled') redirect('/login?error=disabled');
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#fef7e0] text-[#b06000]"><Clock3 size={22} /></span>
        <h1 className="mt-4 text-2xl font-bold">Waiting for admin approval</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Your Google account is connected and your Guest Post Anchor name is <strong>{profile.sheet_name}</strong>. An admin needs to approve this mapping once.</p>
        <p className="mt-3 text-xs text-[var(--muted)]">{profile.email}</p>
        <div className="mt-6 flex flex-col gap-2"><Link href="/dashboard" className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">Check approval</Link><div className="rounded-xl border border-[var(--border)] p-2 text-left"><LogoutButton /></div></div>
      </section>
    </main>
  );
}
