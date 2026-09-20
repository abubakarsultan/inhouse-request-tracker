'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import StatusControl from '@/components/app/status-control';
import { searchDatabase, type SearchRequestRow } from '@/services/search';
import { normalizeSearchText } from '@/lib/domain';

function Highlight({ text, query }: { text: string; query: string }) {
  const q = normalizeSearchText(query);
  if (!q) return <>{text}</>;
  const normalized: string[] = [];
  const originalIndexes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index].toLowerCase();
    if (/[a-z0-9]/.test(char)) { normalized.push(char); originalIndexes.push(index); }
  }
  const at = normalized.join('').indexOf(q);
  if (at < 0) return <>{text}</>;
  const start = originalIndexes[at];
  const endIndex = originalIndexes[at + q.length - 1];
  if (start == null || endIndex == null) return <>{text}</>;
  return <>{text.slice(0, start)}<mark className="rounded-sm bg-[#fff2a8] px-0.5">{text.slice(start, endIndex + 1)}</mark>{text.slice(endIndex + 1)}</>;
}

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ count: number; capped: boolean; rows: SearchRequestRow[] }>({ count: 0, capped: false, rows: [] });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) { setResult({ count: 0, capped: false, rows: [] }); setPending(false); setError(''); return; }
    const sequence = ++requestSeq.current;
    const timer = window.setTimeout(async () => {
      setPending(true); setError('');
      try {
        const response = await searchDatabase(clean);
        if (sequence !== requestSeq.current) return;
        setResult({ count: response.count, capped: response.capped, rows: response.rows });
      } catch (caught) {
        if (sequence !== requestSeq.current) return;
        setError(caught instanceof Error ? caught.message : 'Search failed');
      } finally { if (sequence === requestSeq.current) setPending(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="max-w-5xl">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type to search… (min 2 characters)" autoFocus />
      <div className="my-3 min-h-5 text-xs text-[var(--muted)]">{pending ? 'Searching…' : query.trim().length >= 2 ? `${result.count}${result.capped ? '+' : ''} result(s)${result.capped ? ' — showing first 100, refine your search' : ''}` : ''}</div>
      {error && <div className="mb-3 rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</div>}
      <div className="space-y-2">
        {result.rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text)]"><Highlight text={row.approved_site} query={query} /></p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]"><Highlight text={row.client} query={query} /> · <Highlight text={row.sub_project || '-'} query={query} /> · anchor: <Highlight text={row.anchor || '-'} query={query} /> · <Highlight text={row.assign_to || 'unassigned'} query={query} /> · {new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.created_at))}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]" title={row.target_url}><Highlight text={row.target_url || 'Not available — imported from sheet'} query={query} /></p>
              </div>
              <StatusControl id={row.id} status={row.status} syncState={row.sync_state} />
            </div>
            <div className="mt-2 flex gap-3"><Link href={`/projects/${row.project_slug}`} className="text-xs font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]">Open project →</Link><Link href={`/requests/${row.id}/edit`} className="text-xs font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]">Edit request →</Link></div>
          </article>
        ))}
        {!pending && query.trim().length >= 2 && !error && result.rows.length === 0 && <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">No matches.</p>}
      </div>
    </div>
  );
}
