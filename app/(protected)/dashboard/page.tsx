import Link from 'next/link';
import { getDashboardOverview } from '@/services/requests';
import StatusBadge from '@/components/status-badge';
import RetrySyncButton from '@/components/app/retry-sync-button';
import { formatKarachiDateTime } from '@/lib/date';
import { Link2, Clock, AlertTriangle, LayoutGrid, CalendarDays, Activity, CheckCircle2, BarChart3 } from 'lucide-react';
import RefreshLiveStatusButton from '@/components/app/refresh-live-status-button';
import { requireActiveProfile } from '@/lib/auth';
import { getMemberWorkspace } from '@/services/member-workspace';
import MemberWorkspaceView from '@/components/app/member-workspace-view';

const CARDS = [
  { key: 'total', label: 'Total Requests', icon: LayoutGrid },
  { key: 'live', label: 'Live Links', icon: Link2 },
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'failedSync', label: 'Failed Sync', icon: AlertTriangle },
  { key: 'thisMonth', label: 'This Month', icon: CalendarDays },
] as const;

export default async function Dashboard() {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') {
    const memberData = await getMemberWorkspace();
    return (
      <div>
        <div className="mb-6"><h1 className="text-2xl font-bold text-[var(--text)]">My Dashboard</h1><p className="mt-1 text-sm text-[var(--muted)]">Your assigned Guest Post Anchor work, deadlines, and project activity.</p></div>
        <MemberWorkspaceView data={memberData} dashboard />
      </div>
    );
  }
  const data = await getDashboardOverview();
  const { stats } = data;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Live request, deadline, project, and sync overview.</p>
        </div>
        <RefreshLiveStatusButton lastRefresh={data.lastRefresh} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CARDS.map(({ key, label, icon: Icon }) => {
          const content = (
            <>
              <Icon size={18} className={key === 'live' ? 'text-[#188038]' : key === 'failedSync' ? 'text-[#c5221f]' : key === 'pending' ? 'text-[#b06000]' : 'text-[var(--brand)]'} />
              <p className="mt-3 text-3xl font-bold text-[var(--text)]">{stats[key]}</p>
              <p className="text-sm text-[var(--muted)]">{label}</p>
            </>
          );
          return key === 'failedSync' && stats.failedSync > 0 ? (
            <Link key={key} href="#failed-sync" className="rounded-2xl border border-[#f4b7b2] bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">{content}</Link>
          ) : (
            <div key={key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">{content}</div>
          );
        })}
      </div>

      {stats.failedSync > 0 && (
        <section id="failed-sync" className="mt-6 rounded-2xl border border-[#f4b7b2] bg-[var(--card)] scroll-mt-6">
          <div className="border-b border-[#f4b7b2] p-4">
            <h2 className="font-semibold text-[#c5221f]">Failed sync</h2>
            <p className="text-xs text-[var(--muted)]">Database rows are safe. Retry only re-attempts the team-sheet mirror.</p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {data.failed.map((row: any) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text)]">{row.approved_site}</p>
                  <p className="text-xs text-[var(--muted)]">{row.projects?.name || 'Unknown project'} · anchor: {row.anchor || '—'}</p>
                  <p className="mt-1 max-w-3xl text-xs text-[#c5221f]">{row.sync_error || 'Team sheet sync failed.'}</p>
                </div>
                <RetrySyncButton requestId={row.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] p-4">
            <Activity size={17} className="text-[var(--brand)]" />
            <div><h2 className="font-semibold text-[var(--text)]">Recent activity</h2><p className="text-xs text-[var(--muted)]">Latest 8 requests.</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Date</th><th className="p-3">Client</th><th className="p-3">Website</th><th className="p-3">Owner</th><th className="p-3">Status</th></tr></thead>
              <tbody>
                {data.recent.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)]/70">
                    <td className="whitespace-nowrap p-3 text-xs text-[var(--muted)]">{formatKarachiDateTime(row.created_at)}</td>
                    <td className="p-3 font-medium">{row.projects ? <Link href={`/projects/${row.projects.slug}`} className="hover:text-[var(--brand)]">{row.projects.name}</Link> : '—'}</td>
                    <td className="p-3 text-[var(--muted)]">{row.approved_site}</td>
                    <td className="p-3 text-[var(--muted)]">{row.assign_to || 'Unassigned'}</td>
                    <td className="p-3"><div className="flex flex-wrap gap-1"><StatusBadge status={row.status} />{row.sync_state === 'failed' && <StatusBadge status={row.status} failedSync />}</div></td>
                  </tr>
                ))}
                {data.recent.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-[var(--muted)]">No activity yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] p-4">
            <CheckCircle2 size={17} className="text-[#188038]" />
            <div><h2 className="font-semibold text-[var(--text)]">Became Live — last 7 days</h2><p className="text-xs text-[var(--muted)]">First Live date from {data.liveSince} onward.</p></div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Live date</th><th className="p-3">Client</th><th className="p-3">Website</th><th className="p-3">Owner</th><th className="p-3">Now</th></tr></thead>
              <tbody>
                {data.becameLive.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)]/70">
                    <td className="p-3 text-xs text-[var(--muted)]">{row.live_date || '—'}</td>
                    <td className="p-3 font-medium">{row.projects ? <Link href={`/projects/${row.projects.slug}`} className="hover:text-[var(--brand)]">{row.projects.name}</Link> : '—'}</td>
                    <td className="p-3 text-[var(--muted)]">{row.approved_site}</td>
                    <td className="p-3 text-[var(--muted)]">{row.assign_to || 'Unassigned'}</td>
                    <td className="p-3"><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
                {data.becameLive.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-[var(--muted)]">No requests became Live in the last 7 days.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-4">
          <BarChart3 size={17} className="text-[var(--brand)]" />
          <div><h2 className="font-semibold text-[var(--text)]">Per-project breakdown</h2><p className="text-xs text-[var(--muted)]">Request counts by current status.</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">
            <thead className="bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Project</th><th className="p-3 text-right">Requests</th><th className="p-3 text-right">Live</th><th className="p-3 text-right">Pending</th></tr></thead>
            <tbody>
              {data.breakdown.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]/70">
                  <td className="p-3 font-medium"><Link href={`/projects/${row.slug}`} className="hover:text-[var(--brand)]">{row.name}</Link></td>
                  <td className="p-3 text-right font-semibold text-[var(--text)]">{row.total}</td>
                  <td className="p-3 text-right font-semibold text-[#188038]">{row.live}</td>
                  <td className="p-3 text-right font-semibold text-[#b06000]">{row.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
