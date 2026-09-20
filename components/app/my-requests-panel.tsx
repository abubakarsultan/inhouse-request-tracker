'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { getMyRequests, type MyRequestsResult } from '@/services/requests';
import { getBrowserIdentityName, IDENTITY_EVENT, setBrowserIdentityName } from '@/lib/identity';
import StatusControl from '@/components/app/status-control';
import DeadlineCell from '@/components/deadline-cell';
import { UserRound, Link2, Clock, AlertTriangle, CalendarDays } from 'lucide-react';

const EMPTY: MyRequestsResult = {
  name: '',
  today: '',
  kpis: { assigned: 0, live: 0, pending: 0, overdue: 0 },
  upcoming: [],
  requests: [],
};

const KPI = [
  ['assigned', 'Assigned', UserRound],
  ['live', 'Live', Link2],
  ['pending', 'Pending', Clock],
  ['overdue', 'Overdue', AlertTriangle],
] as const;

export default function MyRequestsPanel({ suggestions }: { suggestions: string[] }) {
  const listId = useId();
  const [name, setName] = useState('');
  const [data, setData] = useState<MyRequestsResult>(EMPTY);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function load(nextName: string, persist = false) {
    const clean = nextName.trim();
    if (persist) setBrowserIdentityName(clean);
    setError('');
    if (!clean) {
      setData({ ...EMPTY, today: data.today });
      return;
    }
    startTransition(async () => {
      try {
        const result = await getMyRequests(clean);
        setData(result);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load your requests');
      }
    });
  }

  useEffect(() => {
    const current = getBrowserIdentityName();
    setName(current);
    if (current) load(current);
    const handler = (event: Event) => {
      const next = String((event as CustomEvent<string>).detail ?? '');
      setName(next);
      if (next) load(next);
      else setData(EMPTY);
    };
    window.addEventListener(IDENTITY_EVENT, handler);
    return () => window.removeEventListener(IDENTITY_EVENT, handler);
    // Initial load is intentionally browser-identity driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-5 rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <label htmlFor={`my-name-${listId}`} className="mb-1 block text-xs font-medium text-[var(--muted)]">Who are you?</label>
            <input
              id={`my-name-${listId}`}
              list={`my-name-list-${listId}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  load(name, true);
                }
              }}
              placeholder="Type your name"
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
            <datalist id={`my-name-list-${listId}`}>{suggestions.map((item) => <option key={item} value={item} />)}</datalist>
          </div>
          <button type="button" onClick={() => load(name, true)} disabled={pending} className="h-10 rounded-lg bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
            {pending ? 'Loading…' : 'Show my requests'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">Your selected name is remembered in this browser and also used for status audit history.</p>
        {error && <p className="mt-2 text-sm text-[#c5221f]">{error}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI.map(([key, label, Icon]) => (
          <div key={key} className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <Icon size={18} className={key === 'live' ? 'text-[#188038]' : key === 'overdue' ? 'text-[#c5221f]' : key === 'pending' ? 'text-[#b06000]' : 'text-[var(--brand)]'} />
            <p className="mt-3 text-3xl font-bold text-[var(--text)]">{data.kpis[key]}</p>
            <p className="text-sm text-[var(--muted)]">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-white">
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-4">
          <CalendarDays size={17} className="text-[var(--brand)]" />
          <div>
            <h2 className="font-semibold text-[var(--text)]">Upcoming deadlines — next 7 days</h2>
            <p className="text-xs text-[var(--muted)]">Only non-Live requests are shown.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Client</th><th className="p-3">Website</th><th className="p-3">Deadline</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {data.upcoming.map((row: any) => (
                <tr key={row.id} className="border-t border-[var(--border)]/70">
                  <td className="p-3 font-medium">{row.projects ? <Link className="hover:text-[var(--brand)]" href={`/projects/${row.projects.slug}`}>{row.projects.name}</Link> : '—'}</td>
                  <td className="p-3 text-[var(--muted)]">{row.approved_site}</td>
                  <td className="p-3"><DeadlineCell deadline={row.deadline} status={row.status} today={data.today} /></td>
                  <td className="p-3"><StatusControl id={row.id} status={row.status} syncState={row.sync_state} onChanged={() => load(name)} /></td>
                </tr>
              ))}
              {!pending && data.upcoming.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[var(--muted)]">No upcoming deadlines for this person.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] p-4">
          <h2 className="font-semibold text-[var(--text)]">All assigned requests</h2>
          <p className="text-xs text-[var(--muted)]">{data.name ? `${data.kpis.assigned} request(s) assigned to ${data.name}.` : 'Choose your name to load assigned work.'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Client</th><th className="p-3">Website</th><th className="p-3">Anchor</th><th className="p-3">Priority</th><th className="p-3">Deadline</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {data.requests.map((row: any) => (
                <tr key={row.id} className="border-t border-[var(--border)]/70 align-top">
                  <td className="p-3 font-medium">{row.projects ? <Link className="hover:text-[var(--brand)]" href={`/projects/${row.projects.slug}`}>{row.projects.name}</Link> : '—'}</td>
                  <td className="p-3 text-[var(--muted)]">{row.approved_site}</td>
                  <td className="p-3 text-[var(--muted)]">{row.anchor || '—'}</td>
                  <td className="p-3 text-[var(--muted)]">{row.priority}</td>
                  <td className="p-3"><DeadlineCell deadline={row.deadline} status={row.status} today={data.today} /></td>
                  <td className="p-3"><StatusControl id={row.id} status={row.status} syncState={row.sync_state} onChanged={() => load(name)} /></td>
                </tr>
              ))}
              {!pending && data.requests.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-[var(--muted)]">{data.name ? 'No requests are assigned to this name.' : 'Choose your name above.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
