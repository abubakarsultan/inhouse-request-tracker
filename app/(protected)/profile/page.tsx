import { requireActiveProfile } from '@/lib/auth';
import LogoutButton from '@/components/app/logout-button';

export default async function ProfilePage() {
  const profile = await requireActiveProfile();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6"><h1 className="text-2xl font-bold">Profile</h1><p className="mt-1 text-sm text-[var(--muted)]">Your Google identity and Guest Post Anchor mapping.</p></div>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--brand-soft)] text-xl font-bold text-[var(--brand-dark)]">{(profile.sheet_name || profile.email).slice(0, 2).toUpperCase()}</div>}
          <div><h2 className="text-xl font-bold">{profile.sheet_name || profile.google_name || 'Rankviz user'}</h2><p className="text-sm text-[var(--muted)]">{profile.email}</p></div>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--canvas)] p-4"><dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Google name</dt><dd className="mt-1 font-medium">{profile.google_name || '—'}</dd></div>
          <div className="rounded-xl bg-[var(--canvas)] p-4"><dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Guest Post Anchor name</dt><dd className="mt-1 font-medium">{profile.sheet_name || '—'}</dd></div>
          <div className="rounded-xl bg-[var(--canvas)] p-4"><dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Role</dt><dd className="mt-1 font-medium capitalize">{profile.role}</dd></div>
          <div className="rounded-xl bg-[var(--canvas)] p-4"><dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Account status</dt><dd className="mt-1 font-medium capitalize">{profile.account_status}</dd></div>
        </dl>
        <div className="mt-6 max-w-44 rounded-xl border border-[var(--border)] p-1"><LogoutButton /></div>
      </section>
    </div>
  );
}
