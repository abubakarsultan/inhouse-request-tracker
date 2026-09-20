'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, Link2, ListTodo, Search, SlidersHorizontal, X, XCircle } from 'lucide-react';
import type { MemberRequestRow, MemberWorkspace, MyRequestsPage } from '@/services/member-workspace';
import StatusControl from '@/components/app/status-control';
import StatusBadge from '@/components/status-badge';
import DeadlineCell from '@/components/deadline-cell';
import RequestActions from '@/components/app/request-actions';

export type MyRequestsFilterState = {
  q: string;
  project: string;
  status: string;
  priority: string;
  deadline: string;
  source: string;
  sort: string;
  pageSize: string;
};

type ProjectOption = { id: string; name: string };

type Props = {
  data: MyRequestsPage;
  summary: MemberWorkspace;
  projects: ProjectOption[];
  filters: MyRequestsFilterState;
};

function navigationStart() {
  window.dispatchEvent(new CustomEvent('rankviz:navigation-start'));
}

function isOverdue(row: MemberRequestRow, today: string) {
  return row.status === 'Request shared' && Boolean(row.deadline && row.deadline < today);
}

export default function MyRequestsView({ data, summary, projects, filters }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(data.rows);
  const [total, setTotal] = useState(data.total);
  const [kpis, setKpis] = useState(summary.kpis);
  const [query, setQuery] = useState(filters.q);

  useEffect(() => { setRows(data.rows); setTotal(data.total); }, [data.rows, data.total]);
  useEffect(() => setKpis(summary.kpis), [summary.kpis]);
  useEffect(() => setQuery(filters.q), [filters.q]);

  const baseParams = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value && !(key === 'sort' && value === 'newest') && !(key === 'pageSize' && value === '25')) params.set(key, value);
    }
    return params;
  }, [filters]);

  function navigate(changes: Record<string, string | null>, mode: 'push' | 'replace' = 'push') {
    const params = new URLSearchParams(baseParams);
    for (const [key, value] of Object.entries(changes)) {
      if (!value || (key === 'sort' && value === 'newest') || (key === 'pageSize' && value === '25')) params.delete(key);
      else params.set(key, value);
    }
    if (!('page' in changes)) params.delete('page');
    navigationStart();
    startTransition(() => {
      const href = `/my-requests${params.toString() ? `?${params.toString()}` : ''}`;
      mode === 'replace' ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false });
    });
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === filters.q) return;
    const timer = window.setTimeout(() => navigate({ q: trimmed || null }, 'replace'), 350);
    return () => window.clearTimeout(timer);
    // navigate is intentionally derived from the latest server-provided filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters.q]);

  function applyStatusChange(rowId: string, next: string) {
    const previous = rows.find((row) => row.id === rowId);
    if (!previous || previous.status === next) return;
    setKpis((current) => {
      const updated = { ...current };
      const keyFor = (status: string): 'live' | 'rejected' | 'pending' => status === 'Live' ? 'live' : status === 'Rejected' ? 'rejected' : 'pending';
      const previousKey = keyFor(previous.status);
      const nextKey = keyFor(next);
      updated[previousKey] = Math.max(0, updated[previousKey] - 1);
      updated[nextKey] += 1;
      if (isOverdue(previous, summary.today)) updated.overdue = Math.max(0, updated.overdue - 1);
      const nextRow = { ...previous, status: next as MemberRequestRow['status'] };
      if (isOverdue(nextRow, summary.today)) updated.overdue += 1;
      return updated;
    });

    const nextRow = { ...previous, status: next as MemberRequestRow['status'] };
    const shouldHideForStatus = Boolean(filters.status && filters.status !== next);
    const shouldHideForDeadline = Boolean(filters.deadline && !(
      (filters.deadline === 'overdue' && isOverdue(nextRow, summary.today)) ||
      (filters.deadline === 'today' && nextRow.status === 'Request shared' && nextRow.deadline === summary.today) ||
      (filters.deadline === 'none' && !nextRow.deadline) ||
      (filters.deadline === 'next7' && nextRow.status === 'Request shared')
    ));
    if (shouldHideForStatus || shouldHideForDeadline) {
      setRows((current) => current.filter((row) => row.id !== rowId));
      setTotal((current) => Math.max(0, current - 1));
    } else {
      setRows((current) => current.map((row) => row.id === rowId ? nextRow : row));
    }
  }

  function applyArchive(rowId: string) {
    const previous = rows.find((row) => row.id === rowId);
    if (!previous) return;
    setRows((current) => current.filter((row) => row.id !== rowId));
    setTotal((current) => Math.max(0, current - 1));
    setKpis((current) => {
      const updated = { ...current, assigned: Math.max(0, current.assigned - 1) };
      if (previous.status === 'Live') updated.live = Math.max(0, updated.live - 1);
      else if (previous.status === 'Rejected') updated.rejected = Math.max(0, updated.rejected - 1);
      else updated.pending = Math.max(0, updated.pending - 1);
      if (isOverdue(previous, summary.today)) updated.overdue = Math.max(0, updated.overdue - 1);
      return updated;
    });
  }

  const cards = [
    ['assigned', 'Assigned', ListTodo],
    ['live', 'Live', Link2],
    ['pending', 'Pending', Clock],
    ['rejected', 'Rejected', XCircle],
    ['overdue', 'Overdue', CalendarDays],
  ] as const;

  const quickTabs = [
    { label: 'All', value: '', count: kpis.assigned },
    { label: 'Pending', value: 'Request shared', count: kpis.pending },
    { label: 'Live', value: 'Live', count: kpis.live },
    { label: 'Rejected', value: 'Rejected', count: kpis.rejected },
  ];

  const hasFilters = Boolean(filters.q || filters.project || filters.status || filters.priority || filters.deadline || filters.source || filters.sort !== 'newest' || filters.pageSize !== '25');

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {cards.map(([key, label, Icon]) => (
          <div key={key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md">
            <Icon size={18} className={key === 'live' ? 'text-[var(--green)]' : key === 'rejected' || key === 'overdue' ? 'text-[var(--red)]' : key === 'pending' ? 'text-[var(--amber)]' : 'text-[var(--brand)]'} />
            <p className="mt-3 text-3xl font-bold">{kpis[key]}</p><p className="text-sm text-[var(--muted)]">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {quickTabs.map((tab) => {
                const active = filters.status === tab.value && !filters.deadline;
                return <button key={tab.label} type="button" onClick={() => navigate({ status: tab.value || null, deadline: null })} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-[var(--brand)] text-white shadow-sm' : 'bg-[var(--canvas)] text-[var(--muted)] hover:text-[var(--text)]'}`}>{tab.label} <span className="ml-1 opacity-80">{tab.count}</span></button>;
              })}
              <button type="button" onClick={() => navigate({ deadline: 'overdue', status: null })} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filters.deadline === 'overdue' ? 'bg-[var(--red)] text-white shadow-sm' : 'bg-[var(--canvas)] text-[var(--muted)] hover:text-[var(--text)]'}`}>Overdue <span className="ml-1 opacity-80">{kpis.overdue}</span></button>
            </div>
            {isPending && <span className="inline-flex items-center gap-2 text-xs text-[var(--muted)]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]" />Updating…</span>}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(220px,2fr)_repeat(5,minmax(120px,1fr))]">
            <label className="relative block min-w-0">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search website, anchor, target URL, project…" className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-9 pr-9 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
              {query && <button type="button" onClick={() => { setQuery(''); navigate({ q: null }, 'replace'); }} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--canvas)]"><X size={14} /></button>}
            </label>
            <select value={filters.project} onChange={(e) => navigate({ project: e.target.value || null })} className="h-10 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
            <select value={filters.priority} onChange={(e) => navigate({ priority: e.target.value || null })} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select>
            <select value={filters.deadline} onChange={(e) => navigate({ deadline: e.target.value || null })} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="">Any deadline</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="next7">Next 7 days</option><option value="none">No deadline</option></select>
            <select value={filters.source} onChange={(e) => navigate({ source: e.target.value || null })} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="">All sources</option><option value="app">Created in tool</option><option value="imported">Imported from Sheet</option></select>
            <select value={filters.sort} onChange={(e) => navigate({ sort: e.target.value })} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="deadline">Deadline</option><option value="website">Website A–Z</option><option value="project">Project A–Z</option></select>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={13} />{total.toLocaleString()} matching request{total === 1 ? '' : 's'}</span>
            {hasFilters && <button type="button" onClick={() => { navigationStart(); router.push('/my-requests', { scroll: false }); }} className="font-semibold text-[var(--brand-dark)] hover:underline">Clear filters</button>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Project</th><th className="p-3">Website</th><th className="p-3">Anchor</th><th className="p-3">Target URL</th><th className="p-3">Priority</th><th className="p-3">Deadline</th><th className="p-3">Status</th><th className="p-3">Sync</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.id} className="border-t border-[var(--border)] align-top transition-opacity duration-150"><td className="p-3 font-medium">{row.project?.name || '—'}{row.source !== 'app' && <span className="ml-1.5 rounded-full bg-[var(--brand-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--brand-dark)]">Imported</span>}</td><td className="max-w-56 truncate p-3 text-[var(--muted)]" title={row.approved_site}>{row.approved_site}</td><td className="max-w-56 truncate p-3 text-[var(--muted)]" title={row.anchor}>{row.anchor || '—'}</td><td className="max-w-56 truncate p-3 text-xs text-[var(--muted)]" title={row.target_url || ''}>{row.target_url || (row.source !== 'app' ? 'Not available — imported from sheet' : '—')}</td><td className="p-3 text-[var(--muted)]">{row.priority}</td><td className="p-3"><DeadlineCell deadline={row.deadline} status={row.status} today={summary.today} /></td><td className="p-3"><StatusControl id={row.id} status={row.status} syncState={row.sync_state} onChanged={(next) => applyStatusChange(row.id, next)} /></td><td className="p-3">{row.sync_state === 'failed' ? <div><StatusBadge status={row.status} failedSync /><p className="mt-1 max-w-48 text-[10px] text-[var(--red)]">{row.sync_error || 'Sheet sync failed'}</p></div> : <span className="text-xs text-[var(--muted)]">{row.sync_state === 'synced' ? 'Synced ✓' : 'Saved here only'}</span>}</td><td className="p-3"><RequestActions id={row.id} onArchived={() => applyArchive(row.id)} /></td></tr>)}
              {rows.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-[var(--muted)]">No requests match these filters.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] p-4 text-sm">
          <div className="flex items-center gap-2 text-[var(--muted)]"><span>Rows</span><select value={String(data.pageSize)} onChange={(e) => navigate({ pageSize: e.target.value, page: '1' })} className="h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2"><option>25</option><option>50</option><option>100</option></select></div>
          <div className="flex items-center gap-3"><button type="button" disabled={data.page <= 1 || isPending} onClick={() => navigate({ page: String(Math.max(1, data.page - 1)) })} className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium disabled:opacity-40 hover:bg-[var(--canvas)]">← Previous</button><span className="min-w-24 text-center text-xs text-[var(--muted)]">Page {data.page} of {data.totalPages}</span><button type="button" disabled={data.page >= data.totalPages || isPending} onClick={() => navigate({ page: String(Math.min(data.totalPages, data.page + 1)) })} className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium disabled:opacity-40 hover:bg-[var(--canvas)]">Next →</button></div>
        </div>
      </section>
    </div>
  );
}
