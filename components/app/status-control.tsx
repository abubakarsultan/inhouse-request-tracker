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
    if (next === current) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setRequestStatus(id, next);
        setCurrent(next);
        setCurrentSync(result.teamSheet.state ?? currentSync);
        setMessage(result.ok ? 'Saved ✓' : 'Saved with warnings');
        onChanged?.(next);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save status');
      }
    });
  }

  return (
    <div className="flex min-w-52 flex-wrap items-center gap-2">
      <StatusBadge status={current} />
      {currentSync === 'failed' && <StatusBadge status={current} failedSync />}
      {current !== 'Live' && (
        <button type="button" onClick={() => changeStatus('Live')} disabled={pending} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[#188038] hover:bg-[var(--canvas)] disabled:opacity-50">
          {pending ? 'Saving…' : '✓ Mark Live'}
        </button>
      )}
      {current !== 'Request shared' && (
        <button type="button" onClick={() => changeStatus('Request shared')} disabled={pending} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[#b06000] hover:bg-[var(--canvas)] disabled:opacity-50">
          {pending ? 'Saving…' : '↩ Request shared'}
        </button>
      )}
      {current !== 'Rejected' && (
        <button type="button" onClick={() => changeStatus('Rejected')} disabled={pending} className="rounded-md border border-[#f5b5b1] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[#c5221f] hover:bg-[#fce8e6] disabled:opacity-50">
          {pending ? 'Saving…' : 'Reject'}
        </button>
      )}
      {message && <span className={`text-xs ${message.startsWith('Saved') ? 'text-[var(--muted)]' : 'text-[#c5221f]'}`}>{message}</span>}
    </div>
  );
}
