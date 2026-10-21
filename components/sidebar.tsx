'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, ShieldCheck, ListTodo, Upload, Settings, Search, ScanSearch, HeartPulse, UsersRound, Handshake, PlusCircle, UserRound, Bell, BarChart3, type LucideIcon } from 'lucide-react';
import type { AppRole } from '@/lib/auth-types';

const memberLinks = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['Projects', '/projects', FolderKanban],
  ['My Requests', '/my-requests', ListTodo],
  ['Create Request', '/requests/new', PlusCircle],
  ['Collaborations', '/collaborations', Handshake],
  ['Site Check', '/site-check', ScanSearch],
  ['Profile', '/profile', UserRound],
] as const;

const adminPrimaryLinks = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['Projects', '/projects', FolderKanban],
  ['Collaborations', '/collaborations', Handshake],
  ['All Requests', '/requests', ListTodo],
  ['Needs Attention', '/attention', Bell],
  ['Reports', '/reports', BarChart3],
  ['My Requests', '/my-requests', UserRound],
  ['Create Request', '/requests/new', PlusCircle],
  ['Search', '/search', Search],
  ['Site Check', '/site-check', ScanSearch],
] as const;

const adminControlLinks = [
  ['Admin', '/team', ShieldCheck],
  ['Import', '/import', Upload],
  ['Health', '/health', HeartPulse],
  ['Settings', '/settings', Settings],
] as const;

type LinkTuple = readonly [string, string, LucideIcon];

const quickPrefetch = new Set(['/dashboard', '/projects', '/collaborations', '/requests', '/my-requests', '/requests/new']);

export default function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const renderLinks = (links: readonly LinkTuple[]) => links.map(([label, href, Icon]) => (
    <Link prefetch={quickPrefetch.has(href)} key={href} href={href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-150 active:scale-[0.98] ${isActive(href) ? 'bg-[var(--brand-soft)] text-[var(--brand-dark)]' : 'text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--text)]'}`}>
      <Icon size={17} className="transition-transform duration-150 group-hover:scale-105" />{label}
    </Link>
  ));
  const mobileLinks = role === 'admin' ? [...adminPrimaryLinks, ...adminControlLinks] : memberLinks;

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-60 overflow-y-auto border-r border-[var(--border)] bg-[var(--card)] p-4 lg:block">
        <div className="mb-7 flex items-center gap-2 px-2 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">R</div>
          <div><p className="text-sm font-bold leading-tight text-[var(--text)]">INHOUSE REQUEST</p><p className="text-[11px] leading-tight text-[var(--muted)]">Rankviz</p></div>
        </div>
        {role === 'admin' ? <>
          <nav className="space-y-1">{renderLinks(adminPrimaryLinks)}</nav>
          <div className="mb-2 mt-6 flex items-center gap-2 px-3"><span className="h-px flex-1 bg-[var(--border)]" /><span className="rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[9px] font-bold tracking-[0.18em] text-[#174ea6]">ADMIN</span><span className="h-px flex-1 bg-[var(--border)]" /></div>
          <nav className="space-y-1">{renderLinks(adminControlLinks)}</nav>
        </> : <nav className="space-y-1">{renderLinks(memberLinks)}</nav>}
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-[var(--border)] bg-[var(--card)] px-1 py-1 lg:hidden" aria-label="Mobile navigation">
        {mobileLinks.map(([label, href, Icon]) => (
          <Link prefetch={quickPrefetch.has(href)} key={href} href={href} className={`flex min-w-[76px] flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition active:scale-95 ${isActive(href) ? 'bg-[var(--brand-soft)] text-[var(--brand-dark)]' : 'text-[var(--muted)]'}`}>
            <Icon size={17} /><span className="whitespace-nowrap">{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
