'use client';
import { useState, useTransition } from 'react';
import { updateRequestStatus } from '@/services/requests';
import { transitions } from '@/lib/validators';
import StatusBadge from '@/components/status-badge';
import { ArrowRight } from 'lucide-react';

export default function StatusControl({ id, status }: { id: string; status: string }) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = transitions[current]?.[0];

  function advance() {
    if (!next) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateRequestStatus(id, next);
        setCurrent(next);
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={current} />
      {next && (
        <button
          onClick={advance}
          disabled={pending}
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          title={`Move to ${next}`}
        >
          {pending ? '…' : <>{next} <ArrowRight size={12} /></>}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
