'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Diagnostic = { key: string; label: string; ok: boolean; detail: string };

export default function SettingsDiagnostics() {
  const [items, setItems] = useState<Diagnostic[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/diagnostics', { cache: 'no-store' });
      const body = await response.json() as { ok?: boolean; diagnostics?: Diagnostic[]; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || 'Could not load diagnostics.');
      setItems(body.diagnostics ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load diagnostics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <div><h2 className="font-semibold text-[var(--text)]">Connection checks</h2><p className="text-xs text-[var(--muted)]">Loaded in the background so Settings opens immediately.</p></div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading && !items ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-[var(--canvas)]" />) : null}
        {error && <div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-[#f4b7b2] bg-[#fce8e6] p-4 text-sm text-[#c5221f]">{error}</div>}
        {items?.map((item) => (
          <div key={item.key} className="rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-2"><p className="font-medium text-[var(--text)]">{item.label}</p>{item.ok ? <CheckCircle2 size={17} className="text-[#188038]" /> : <XCircle size={17} className="text-[#c5221f]" />}</div>
            <p className="mt-2 text-xs text-[var(--muted)]">{item.detail}</p>
          </div>
        ))}
      </div>
      {loading && items && <p className="flex items-center gap-2 px-4 pb-4 text-xs text-[var(--muted)]"><Loader2 size={13} className="animate-spin" /> Checking connections...</p>}
    </section>
  );
}
