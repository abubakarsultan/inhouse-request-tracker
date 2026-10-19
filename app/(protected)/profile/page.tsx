import { requireActiveProfile } from '@/lib/auth';
import LogoutButton from '@/components/app/logout-button';
import GoogleDriveConnectionCard from '@/components/app/google-drive-connection-card';
import { getConnectionStatus } from '@/lib/google-user-auth';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const profile = await requireActiveProfile();
  const [drive, params] = await Promise.all([getConnectionStatus(profile.id), searchParams]);
  const googleMessages: Record<string, { text: string; tone: 'success' | 'error' | 'info' }> = {
    connected: { text: `Google Drive connected${drive.email ? ` as ${drive.email}` : ''}.`, tone: 'success' },
    state_error: { text: 'Google connection could not be verified. Start Connect again from this page.', tone: 'error' },
    configuration_error: { text: 'Google Drive setup is incomplete. Set NEXT_PUBLIC_SITE_URL to the exact deployed site origin in Vercel, then redeploy.', tone: 'error' },
    reconnect_required: { text: 'Google did not issue a refresh token. Remove this app from your Google Account security permissions, then reconnect and approve access.', tone: 'error' },
    error: { text: 'Google Drive connection failed. Check OAuth settings and try again.', tone: 'error' },
  };
  const googleMessage = params.google ? googleMessages[params.google] || { text: 'Google Drive returned an unrecognized connection result. Try connecting again.', tone: 'info' as const } : null;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6"><h1 className="text-2xl font-bold">Profile</h1><p className="mt-1 text-sm text-[var(--muted)]">Your Google identity and Guest Post Anchor mapping.</p></div>
      {googleMessage && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${googleMessage.tone === 'success' ? 'border-[#b7dfc0] bg-[#e6f4ea] text-[#137333]' : googleMessage.tone === 'error' ? 'border-[#f2b8b5] bg-[#fce8e6] text-[#b3261e]' : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text)]'}`}>{googleMessage.text}</p>}
      <GoogleDriveConnectionCard status={drive.status} email={drive.email} lastError={drive.lastError} />
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
