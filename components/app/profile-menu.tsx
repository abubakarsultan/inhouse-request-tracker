'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { ChevronDown, UserRound } from 'lucide-react';
import LogoutButton from '@/components/app/logout-button';
import type { UserProfile } from '@/lib/auth-types';

function initials(profile: UserProfile) {
  return (profile.sheet_name || profile.google_name || profile.email).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function ProfileMenu({ profile }: { profile: UserProfile }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 shadow-sm hover:bg-[var(--canvas)]">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--brand-soft)] text-[11px] font-bold text-[var(--brand-dark)]">{initials(profile)}</span>}
          <span className="hidden max-w-36 truncate text-sm font-medium sm:block">{profile.sheet_name || profile.google_name || profile.email}</span>
          <ChevronDown size={14} className="text-[var(--muted)]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={8} align="end" className="z-50 w-72 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl">
          <div className="border-b border-[var(--border)] px-3 py-2.5">
            <p className="font-semibold">{profile.sheet_name || profile.google_name || 'Rankviz user'}</p>
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{profile.email}</p>
            <div className="mt-2 flex gap-1.5"><span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-dark)]">{profile.role}</span><span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-semibold text-[#188038]">{profile.account_status}</span></div>
          </div>
          <DropdownMenu.Item asChild><Link href="/profile" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted)] outline-none hover:bg-[var(--canvas)]"><UserRound size={15} />Profile</Link></DropdownMenu.Item>
          <LogoutButton compact />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
