'use client';

import { useState, useTransition } from 'react';
import { setRequestStatus } from '@/services/requests';
import StatusBadge from '@/components/status-badge';

type Status = 'Request shared' | 'Live' | 'Rejected';

export default function StatusControl({ id, status, syncState, onChanged }: { id: string; status: string; syncState?: string | null; onChanged?: (status: string) => void }) {
  const [current, setCurrent] = useState<Status>(status === 'Live' ? 'Live' : status === 'Rejected' ? 'Rejected' : 'Request shared');
  const [currentSync, setCurrentSync] = useState(syncState ?? null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function changeStatus(next: Status) {
    if (next === current || pending) return;
    const previous = current;
    setCurrent(next); // Optimistic UI: the badge reacts immediately.
    setMessage('Saving…');
    startTransition(async () => {
      try {
        const result = await setRequestStatus(id, next);
        setCurrentSync(result.teamSheet.state ?? currentSync);
        setMessage(result.ok ? 'Saved ✓' : 'Saved · Sheet warning');
        onChanged?.(next);
        window.setTimeout(() => setMessage(null), 1800);
      } catch (error) {
        setCurrent(previous);
        setMessage(error instanceof Error ? error.message : 'Could not save status');
      }
    });
  }

  return (
    <div className="flex min-w-52 flex-wrap items-center gap-2">
      <StatusBadge status={current} />
      {currentSync === 'failed' && <StatusBadge status={current} failedSync />}
      {current !== 'Live' && <button type="button" onClick={() => changeStatus('Live')} disabled={pending} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--green)] transition active:scale-95 hover:bg-[var(--canvas)] disabled:opacity-50">✓ Mark Live</button>}
      {current !== 'Request shared' && <button type="button" onClick={() => changeStatus('Request shared')} disabled={pending} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--amber)] transition active:scale-95 hover:bg-[var(--canvas)] disabled:opacity-50">↩ Request shared</button>}
      {current !== 'Rejected' && <button type="button" onClick={() => changeStatus('Rejected')} disabled={pending} className="rounded-md border border-[#f5b5b1] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--red)] transition active:scale-95 hover:bg-[#fce8e6] disabled:opacity-50">Reject</button>}
      {message && <span className={`inline-flex items-center gap-1 text-xs ${message.startsWith('Saved') || message === 'Saving…' ? 'text-[var(--muted)]' : 'text-[var(--red)]'}`}>{pending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]" />}{message}</span>}
    </div>
  );
}
