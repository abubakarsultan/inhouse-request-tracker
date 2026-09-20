'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, ListTodo, Upload, Settings, Search, ScanSearch, UserRoundCheck, HeartPulse } from 'lucide-react';

const links = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['Projects', '/projects', FolderKanban],
  ['Requests', '/requests', ListTodo],
  ['My Requests', '/my-requests', UserRoundCheck],
  ['Search', '/search', Search],
  ['Site Check', '/site-check', ScanSearch],
  ['Import', '/import', Upload],
  ['Health', '/health', HeartPulse],
  ['Settings', '/settings', Settings],
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 border-r border-[var(--border)] bg-white p-5 lg:block">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">R</div>
          <div>
            <p className="text-sm font-bold leading-tight text-[var(--text)]">INHOUSE REQUEST</p>
            <p className="text-[11px] leading-tight text-[var(--muted)]">Rankviz</p>
          </div>
        </div>
        {links.map(([label, href, Icon]) => (
          <Link key={href} href={href} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive(href) ? 'bg-[var(--brand-soft)] text-[var(--brand-dark)]' : 'text-[var(--muted)] hover:bg-[var(--canvas)]'}`}>
            <Icon size={17} />{label}
          </Link>
        ))}
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-[var(--border)] bg-white px-1 py-1 lg:hidden" aria-label="Mobile navigation">
        {links.map(([label, href, Icon]) => (
          <Link key={href} href={href} className={`flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium ${isActive(href) ? 'bg-[var(--brand-soft)] text-[var(--brand-dark)]' : 'text-[var(--muted)]'}`}>
            <Icon size={17} /><span className="whitespace-nowrap">{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
