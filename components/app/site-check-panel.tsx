'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/status-badge';

type Result = {
  ok: boolean;
  reason?: string;
  input?: string;
  host?: string;
  used?: Array<{ projectId: string; project: string; projectSlug: string; trackerOnly: boolean; status: string; anchor: string }>;
  notUsed?: Array<{ projectId: string; project: string; projectSlug: string; trackerOnly: boolean }>;
  usedProjectCount?: number;
  matchCount?: number;
  notUsedCount?: number;
};

export default function SiteCheckPanel() {
  const [domain, setDomain] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (!domain.trim()) return;
    setPending(true);
    setResult(null);
    try {
      const response = await fetch(`/api/site-check?q=${encodeURIComponent(domain.trim())}`, { cache: 'no-store' });
      const body = await response.json() as Result;
      setResult(body);
    } catch (error) {
      setResult({ ok: false, reason: error instanceof Error ? error.message : 'Site check failed.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex gap-2">
        <Input
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void run(); } }}
          placeholder="example.com or https://www.example.com/path"
          autoFocus
        />
        <Button type="button" onClick={run} disabled={pending || !domain.trim()}>{pending ? 'Checking…' : 'CHECK'}</Button>
      </div>

      {result && !result.ok && <div className="mt-4 rounded-xl border border-[#f5b5b1] bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{result.reason || 'Site check failed.'}</div>}

      {result?.ok && (
        <div className="mt-5 space-y-5">
          <p className="text-sm text-[var(--muted)]">
            <span className="font-medium text-[var(--text)]">{result.host}</span> — used in {result.usedProjectCount} project(s) across {result.matchCount} matching row(s), not used in {result.notUsedCount}.
          </p>

          <section>
            <h2 className="mb-2 text-xs font-bold tracking-wide text-[#188038]">✅ USED IN</h2>
            <div className="space-y-2">
              {(result.used ?? []).map((row, index) => (
                <div key={`${row.projectId}-${row.anchor}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white p-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/projects/${row.projectSlug}`} className="font-semibold text-[var(--text)] hover:text-[var(--brand)]">{row.project}</Link>
                      {row.trackerOnly && <span className="rounded-full bg-[var(--canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">Tracker only</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{row.anchor || 'No anchor'}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
              {(result.used ?? []).length === 0 && <p className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)]">Not used in any project yet.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-bold tracking-wide text-[#c5221f]">❌ NOT USED IN</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(result.notUsed ?? []).map((row) => (
                <div key={row.projectId} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white p-3">
                  <Link href={`/projects/${row.projectSlug}`} className="font-medium text-[var(--text)] hover:text-[var(--brand)]">{row.project}</Link>
                  {row.trackerOnly && <span className="rounded-full bg-[var(--canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">Tracker only</span>}
                </div>
              ))}
              {(result.notUsed ?? []).length === 0 && <p className="text-sm text-[var(--muted)]">Used in every project.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
