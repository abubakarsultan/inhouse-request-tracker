'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, Link2, ListTodo, XCircle } from 'lucide-react';
import type { MemberWorkspace } from '@/services/member-workspace';
import StatusControl from '@/components/app/status-control';
import StatusBadge from '@/components/status-badge';
import DeadlineCell from '@/components/deadline-cell';
import RequestActions from '@/components/app/request-actions';

export default function MemberWorkspaceView({ data, dashboard = false, readOnly = false }: { data: MemberWorkspace; dashboard?: boolean; readOnly?: boolean }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const cards = [
    ['assigned', 'Assigned', ListTodo],
    ['live', 'Live', Link2],
    ['pending', 'Pending', Clock],
    ['rejected', 'Rejected', XCircle],
    ['overdue', 'Overdue', CalendarDays],
  ] as const;

  return (
    <div className="min-w-0">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {cards.map(([key, label, Icon]) => (
          <div key={key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <Icon size={18} className={key === 'live' ? 'text-[#188038]' : key === 'rejected' || key === 'overdue' ? 'text-[#c5221f]' : key === 'pending' ? 'text-[#b06000]' : 'text-[var(--brand)]'} />
            <p className="mt-3 text-3xl font-bold">{data.kpis[key]}</p><p className="text-sm text-[var(--muted)]">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-4"><CalendarDays size={17} className="text-[var(--brand)]" /><div><h2 className="font-semibold">Upcoming deadlines — next 7 days</h2><p className="text-xs text-[var(--muted)]">Only pending Request shared items.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-[var(--canvas)] text-left text-xs uppercase text-[var(--muted)]"><tr><th className="p-3">Client</th><th className="p-3">Website</th><th className="p-3">Deadline</th><th className="p-3">Status</th></tr></thead><tbody>
          {data.upcoming.map((row) => <tr key={row.id} className="border-t border-[var(--border)]"><td className="p-3 font-medium">{row.project?.name || '—'}</td><td className="max-w-64 truncate p-3 text-[var(--muted)]" title={row.approved_site}>{row.approved_site}</td><td className="p-3"><DeadlineCell deadline={row.deadline} status={row.status} today={data.today} /></td><td className="p-3">{readOnly ? <StatusBadge status={row.status} failedSync={row.sync_state === 'failed'} /> : <StatusControl id={row.id} status={row.status} syncState={row.sync_state} onChanged={refresh} />}</td></tr>)}
          {data.upcoming.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[var(--muted)]">No upcoming deadlines.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4"><div><h2 className="font-semibold">{dashboard ? 'Recent assigned requests' : 'My requests'}</h2><p className="text-xs text-[var(--muted)]">Signed in as {data.name} · {data.email}. Imported Guest Post Anchor history is included here as real requests.</p></div>{dashboard && <Link href="/my-requests" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-dark)] transition hover:bg-[var(--canvas)]">View all My Requests →</Link>}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-[var(--canvas)] text-left text-xs uppercase text-[var(--muted)]"><tr><th className="p-3">Client</th><th className="p-3">Website</th><th className="p-3">Anchor</th><th className="p-3">Target URL</th><th className="p-3">Priority</th><th className="p-3">Deadline</th><th className="p-3">Status</th>{!readOnly && !dashboard && <th className="p-3">Actions</th>}</tr></thead><tbody>
          {(dashboard ? data.requests.slice(0, 8) : data.requests).map((row) => <tr key={row.id} className="border-t border-[var(--border)] align-top"><td className="p-3 font-medium">{row.project?.name || '—'}{row.source !== 'app' && <span className="ml-1 rounded-full bg-[#e8f0fe] px-1.5 py-0.5 text-[9px] font-semibold text-[#174ea6]">Imported</span>}</td><td className="max-w-56 truncate p-3 text-[var(--muted)]" title={row.approved_site}>{row.approved_site}</td><td className="max-w-56 truncate p-3 text-[var(--muted)]" title={row.anchor}>{row.anchor || '—'}</td><td className="max-w-52 truncate p-3 text-xs text-[var(--muted)]" title={row.target_url || ''}>{row.target_url || (row.source === 'team_sheet' ? 'Not available — imported from sheet' : '—')}</td><td className="p-3 text-[var(--muted)]">{row.priority}</td><td className="p-3"><DeadlineCell deadline={row.deadline} status={row.status} today={data.today} /></td><td className="p-3">{readOnly ? <StatusBadge status={row.status} failedSync={row.sync_state === 'failed'} /> : <StatusControl id={row.id} status={row.status} syncState={row.sync_state} onChanged={refresh} />}</td>{!readOnly && !dashboard && <td className="p-3"><RequestActions id={row.id} /></td>}</tr>)}
          {data.requests.length === 0 && <tr><td colSpan={readOnly || dashboard ? 7 : 8} className="p-8 text-center text-[var(--muted)]">No linked requests yet.</td></tr>}
        </tbody></table></div>
      </section>

      {dashboard && <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)]"><div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold">My project breakdown</h2><p className="text-xs text-[var(--muted)]">New and imported request history together.</p></div><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{data.breakdown.map((row) => <div key={row.project} className="rounded-xl bg-[var(--canvas)] p-4"><p className="font-semibold">{row.project}</p><p className="mt-2 text-xs text-[var(--muted)]">{row.total} total · <span className="text-[#188038]">{row.live} live</span> · <span className="text-[#b06000]">{row.pending} pending</span> · <span className="text-[#c5221f]">{row.rejected} rejected</span></p></div>)}{data.breakdown.length === 0 && <p className="text-sm text-[var(--muted)]">No project data yet.</p>}</div></section>}
    </div>
  );
}
