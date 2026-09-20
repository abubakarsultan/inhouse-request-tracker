'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, ListTodo, Upload, Settings } from 'lucide-react';

const links = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['Projects', '/projects', FolderKanban],
  ['Requests', '/requests', ListTodo],
  ['Import', '/import', Upload],
  ['Settings', '/settings', Settings],
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-slate-200 bg-white p-5 lg:block">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">R</div>
        <div>
          <p className="text-sm font-bold leading-tight text-slate-900">INHOUSE REQUEST</p>
          <p className="text-[11px] leading-tight text-slate-400">Rankviz</p>
        </div>
      </div>
      {links.map(([label, href, Icon]) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
