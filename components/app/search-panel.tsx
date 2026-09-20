'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/status-badge';
import { searchDatabase, type SearchRequestRow } from '@/services/search';
import { setRequestStatus } from '@/services/requests';
import { getBrowserIdentityName } from '@/lib/identity';
import { normalizeSearchText } from '@/lib/domain';

type SearchResult = { count: number; capped: boolean; rows: SearchRequestRow[] };

function Highlight({ text, query }: { text: string; query: string }) {
  const q = normalizeSearchText(query);
  if (!q) return <>{text}</>;
  const normalized: string[] = [];
  const originalIndexes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index].toLowerCase();
    if (/[a-z0-9]/.test(char)) {
      normalized.push(char);
      originalIndexes.push(index);
    }
  }
  const at = normalized.join('').indexOf(q);
  if (at < 0) return <>{text}</>;
  const start = originalIndexes[at];
  const endIndex = originalIndexes[at + q.length - 1];
  if (start == null || endIndex == null) return <>{text}</>;
  return <>{text.slice(0, start)}<mark className="rounded-sm bg-[#fff2a8] px-0.5">{text.slice(start, endIndex + 1)}</mark>{text.slice(endIndex + 1)}</>;
}

function SearchStatus({ row, query }: { row: SearchRequestRow; query: string }) {
  const [status, setStatus] = useState(row.status);
  const [syncState, setSyncState] = useState(row.sync_state);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const next = status === 'Live' ? 'Request shared' : 'Live';

  function change() {
    setMessage('');
    startTransition(async () => {
      try {
        const result = await setRequestStatus(row.id, next, getBrowserIdentityName() || 'unknown');
        setStatus(next);
        setSyncState(result.teamSheet.state ?? syncState);
        setMessage(result.ok ? 'Saved ✓' : 'Saved with warnings');
        window.setTimeout(() => setMessage(''), 2200);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Save failed');
      }
    });
  }

  return (
    <div className="min-w-[190px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === 'Live' ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[#fef7e0] text-[#b06000]'}`}><Highlight text={status} query={query} /></span>
        {syncState === 'failed' && <StatusBadge status={status} failedSync />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={change} className={`text-xs font-semibold disabled:opacity-50 ${status === 'Live' ? 'text-[#b06000]' : 'text-[#188038]'}`}>
          {pending ? 'Saving…' : status === 'Live' ? '↩ Revert to Request shared' : '✓ Mark as Live'}
        </button>
        {message && <span className={`text-xs ${message.startsWith('Saved') ? 'text-[var(--muted)]' : 'text-[#c5221f]'}`}>{message}</span>}
      </div>
    </div>
  );
}

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>({ count: 0, capped: false, rows: [] });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResult({ count: 0, capped: false, rows: [] });
      setPending(false);
      setError('');
      return;
    }
    const sequence = ++requestSeq.current;
    const timer = window.setTimeout(async () => {
      setPending(true);
      setError('');
      try {
        const response = await searchDatabase(clean);
        if (sequence !== requestSeq.current) return;
        setResult({ count: response.count, capped: response.capped, rows: response.rows });
      } catch (caught) {
        if (sequence !== requestSeq.current) return;
        setError(caught instanceof Error ? caught.message : 'Search failed');
      } finally {
        if (sequence === requestSeq.current) setPending(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="max-w-4xl">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type to search… (min 2 characters)" autoFocus />
      <div className="my-3 min-h-5 text-xs text-[var(--muted)]">
        {pending ? 'Searching…' : query.trim().length >= 2 ? `${result.count}${result.capped ? '+' : ''} result(s)${result.capped ? ' — showing first 100, refine your search' : ''}` : ''}
      </div>
      {error && <div className="mb-3 rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</div>}
      <div className="space-y-2">
        {result.rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text)]"><Highlight text={row.approved_site} query={query} /></p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  <Highlight text={row.client} query={query} /> · <Highlight text={row.sub_project || '-'} query={query} /> · anchor: <Highlight text={row.anchor || '-'} query={query} /> · <Highlight text={row.assign_to || 'unassigned'} query={query} /> · {new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.created_at))}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]" title={row.target_url}><Highlight text={row.target_url} query={query} /></p>
              </div>
              <SearchStatus row={row} query={query} />
            </div>
            <Link href={`/projects/${row.project_slug}`} className="mt-2 inline-block text-xs font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]">Open project →</Link>
          </article>
        ))}
        {!pending && query.trim().length >= 2 && !error && result.rows.length === 0 && <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--muted)]">No matches.</p>}
      </div>
    </div>
  );
}
