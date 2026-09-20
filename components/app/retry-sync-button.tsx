'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { retryRequestSync } from '@/services/requests';

export default function RetrySyncButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();

  function retry() {
    setMessage('');
    startTransition(async () => {
      try {
        const result = await retryRequestSync(requestId);
        setMessage(result.state === 'failed' ? result.text : 'Synced ✓');
        if (result.state !== 'failed') router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Retry failed');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={retry} disabled={pending} className="rounded-md border border-[#f4b7b2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#c5221f] hover:bg-[#fce8e6] disabled:opacity-50">
        {pending ? 'Retrying…' : 'Retry sync'}
      </button>
      {message && <span className={`text-xs ${message === 'Synced ✓' ? 'text-[#188038]' : 'text-[#c5221f]'}`}>{message}</span>}
    </div>
  );
}
