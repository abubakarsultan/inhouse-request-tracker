import { getDashboardStats, getFailedSyncRequests } from '@/services/requests';
import { Link2, Clock, XCircle, LayoutGrid, CalendarDays } from 'lucide-react';
import Link from 'next/link';

// Section 6.7 — Total Requests, Live Links, Pending, Failed Sync (clickable
// when > 0), This Month. "Removed" and "Total Projects" cards are gone —
// they no longer apply to the two-status workflow.
const CARDS = [
  { key: 'total', label: 'Total Requests', icon: LayoutGrid, tone: 'text-slate-700' },
  { key: 'live', label: 'Live Links', icon: Link2, tone: 'text-emerald-600' },
  { key: 'pending', label: 'Pending', icon: Clock, tone: 'text-amber-600' },
  { key: 'failedSync', label: 'Failed Sync', icon: XCircle, tone: 'text-red-500' },
  { key: 'thisMonth', label: 'This Month', icon: CalendarDays, tone: 'text-indigo-600' },
] as const;

export default async function Dashboard() {
  const stats = await getDashboardStats();
  const failed = stats.failedSync > 0 ? await getFailedSyncRequests() : [];

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CARDS.map(({ key, label, icon: Icon, tone }) => {
          const value = stats[key as keyof typeof stats];
          const card = (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
              <Icon size={18} className={tone} />
              <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
              <p className="text-sm text-slate-400">{label}</p>
            </div>
          );
          return key === 'failedSync' && (value as number) > 0 ? (
            <Link key={key} href="#failed-sync">{card}</Link>
          ) : (
            <div key={key}>{card}</div>
          );
        })}
      </div>

      {failed.length > 0 && (
        <div id="failed-sync" className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Failed sync ({failed.length})</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <tr><th className="p-3">Project</th><th className="p-3">Site</th><th className="p-3">Anchor</th><th className="p-3">Reason</th></tr>
              </thead>
              <tbody>
                {failed.map((r: any) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-3">{r.projects?.name ?? '—'}</td>
                    <td className="p-3 text-slate-500">{r.approved_site}</td>
                    <td className="p-3 text-slate-500">{r.anchor}</td>
                    <td className="p-3 text-red-600">{r.sync_error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">A Retry button lands here in Phase 4 — for now, use the API/service directly (retrySync).</p>
        </div>
      )}
    </>
  );
}
