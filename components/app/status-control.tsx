'use client';
import { useState, useTransition } from 'react';
import { setRequestStatus } from '@/services/requests';
import { useWhoAmI } from '@/lib/use-who-am-i';
import StatusBadge from '@/components/status-badge';
import { Check, Undo2 } from 'lucide-react';

// The ONLY UI path for changing a request's status — every entry point
// (requests table, search, My Requests, project page) calls
// setRequestStatus (section 6.2). Mark Live / Revert, per the exact two
// statuses the team sheet uses.
export default function StatusControl({ id, status }: { id: string; status: string }) {
  const { name } = useWhoAmI();
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function change(next: 'Live' | 'Request shared') {
    if (next === current) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setRequestStatus(id, next, name || undefined);
        setCurrent(next);
        setSaved(true);
        if (!result.details.teamSheet.ok) {
          setError(`Saved, but the team sheet update failed: ${result.details.teamSheet.reason ?? 'unknown error'}`);
        }
        setTimeout(() => setSaved(false), 1500);
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={current} />
      {current === 'Request shared' ? (
        <button
          onClick={() => change('Live')}
          disabled={pending}
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? '…' : <><Check size={12} /> Mark Live</>}
        </button>
      ) : (
        <button
          onClick={() => change('Request shared')}
          disabled={pending}
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? '…' : <><Undo2 size={12} /> Revert</>}
        </button>
      )}
      {saved && !error && <span className="text-xs text-emerald-600">Saved ✓</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
