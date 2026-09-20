import { redirect } from 'next/navigation';
import GoogleSignInButton from '@/components/app/google-sign-in-button';
import { getCurrentProfile } from '@/lib/auth';

const ERROR_TEXT: Record<string, string> = {
  domain: 'Only @rankviz.com Google accounts can use this tool.',
  auth: 'Google sign-in could not be completed. Please try again.',
  disabled: 'Your account is disabled. Contact an admin if you need access.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile) {
    if (!profile.onboarding_completed || !profile.sheet_name) redirect('/onboarding');
    if (profile.account_status === 'pending') redirect('/pending');
    if (profile.account_status === 'active') redirect('/dashboard');
  }
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand)] text-lg font-bold text-white">R</div>
          <div><h1 className="text-xl font-bold">INHOUSE REQUEST</h1><p className="text-sm text-[var(--muted)]">Rankviz outreach operations</p></div>
        </div>
        <h2 className="text-2xl font-bold">Sign in</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Use your Rankviz Google account. Personal Gmail and other domains are blocked.</p>
        {error && <p className="mt-4 rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{ERROR_TEXT[error] ?? ERROR_TEXT.auth}</p>}
        <div className="mt-6"><GoogleSignInButton /></div>
        <p className="mt-5 text-xs leading-5 text-[var(--muted)]">Allowed domain: <strong>@rankviz.com</strong>. New members choose their Guest Post Anchor name once, then wait for admin approval.</p>
      </section>
    </main>
  );
}
