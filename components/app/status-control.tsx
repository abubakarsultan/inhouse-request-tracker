'use client';

import { useState, useTransition } from 'react';
import { setRequestStatus } from '@/services/requests';
import StatusBadge from '@/components/status-badge';
import { getBrowserIdentityName } from '@/lib/identity';

export default function StatusControl({ id, status, syncState, onChanged }: { id: string; status: string; syncState?: string | null; onChanged?: (status: string) => void }) {
  const [current, setCurrent] = useState(status);
  const [currentSync, setCurrentSync] = useState(syncState ?? null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const next = current === 'Live' ? 'Request shared' : 'Live';

  function changeStatus() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setRequestStatus(id, next, getBrowserIdentityName() || 'unknown');
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
    <div className="flex min-w-48 flex-wrap items-center gap-2">
      <StatusBadge status={current} />
      {currentSync === 'failed' && <StatusBadge status={current} failedSync />}
      <button
        type="button"
        onClick={changeStatus}
        disabled={pending}
        className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--canvas)] disabled:opacity-50"
      >
        {pending ? 'Saving…' : current === 'Live' ? '↩ Revert' : '✓ Mark Live'}
      </button>
      {message && <span className={`text-xs ${message.startsWith('Saved') ? 'text-[var(--muted)]' : 'text-[#c5221f]'}`}>{message}</span>}
    </div>
  );
}
