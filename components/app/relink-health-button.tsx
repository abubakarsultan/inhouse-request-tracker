'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { relinkHealthRequest } from '@/services/health';

export default function RelinkHealthButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();

  function relink() {
    setMessage('');
    startTransition(async () => {
      try {
        const result = await relinkHealthRequest(requestId);
        setMessage(result.text);
        if (result.ok) router.refresh();
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : 'Re-link failed');
      }
    });
  }

  return (
    <div className="flex min-w-[150px] flex-col items-end gap-1">
      <button type="button" onClick={relink} disabled={pending} className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--brand-dark)] hover:bg-[var(--brand-soft)] disabled:opacity-50">
        {pending ? 'Checking…' : 'Re-link'}
      </button>
      {message && <span className="max-w-[240px] text-right text-[11px] text-[var(--muted)]">{message}</span>}
    </div>
  );
}
