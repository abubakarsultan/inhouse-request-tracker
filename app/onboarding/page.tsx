import { redirect } from 'next/navigation';
import { requireAuthenticatedProfile } from '@/lib/auth';
import { getAvailableTeamNames } from '@/services/team';
import OnboardingNameSelector from '@/components/app/onboarding-name-selector';
import LogoutButton from '@/components/app/logout-button';

export default async function OnboardingPage() {
  const profile = await requireAuthenticatedProfile();
  if (profile.onboarding_completed && profile.sheet_name) {
    redirect(profile.account_status === 'active' ? '/dashboard' : '/pending');
  }
  const names = await getAvailableTeamNames();
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--card)] p-7 shadow-sm">
        <div className="mb-6"><p className="text-sm font-medium text-[var(--brand)]">First-time setup</p><h1 className="mt-1 text-2xl font-bold">Which Guest Post Anchor name is yours?</h1><p className="mt-2 text-sm text-[var(--muted)]">Signed in as {profile.email}</p></div>
        <OnboardingNameSelector names={names} />
        <div className="mt-4 border-t border-[var(--border)] pt-2"><LogoutButton /></div>
      </section>
    </main>
  );
}
