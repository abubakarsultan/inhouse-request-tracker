import ThemeToggle from '@/components/app/theme-toggle';
import ProfileMenu from '@/components/app/profile-menu';
import type { UserProfile } from '@/lib/auth-types';
import { ShieldCheck } from 'lucide-react';

export default function Topbar({ profile }: { profile: UserProfile }) {
  return (
    <header className="mb-7 flex min-h-11 min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-semibold text-[var(--text)]">Rankviz outreach operations</p>{profile.role === 'admin' && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[9px] font-bold tracking-wide text-[#174ea6]"><ShieldCheck size={10} />ADMIN</span>}</div>
        <p className="truncate text-xs text-[var(--muted)]">{profile.role === 'admin' ? 'Company-wide admin workspace' : `Personal workspace · ${profile.sheet_name}`}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2"><ThemeToggle /><ProfileMenu profile={profile} /></div>
    </header>
  );
}
