import ThemeToggle from '@/components/app/theme-toggle';
import ProfileMenu from '@/components/app/profile-menu';
import type { UserProfile } from '@/lib/auth-types';

export default function Topbar({ profile }: { profile: UserProfile }) {
  return (
    <header className="mb-7 flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--text)]">Rankviz outreach operations</p>
        <p className="truncate text-xs text-[var(--muted)]">{profile.role === 'admin' ? 'Admin workspace' : `Personal workspace · ${profile.sheet_name}`}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2"><ThemeToggle /><ProfileMenu profile={profile} /></div>
    </header>
  );
}
