'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Archive, Pencil } from 'lucide-react';
import { archiveRequest } from '@/services/requests';

export default function RequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm('Archive this request? It will disappear from active views and its linked team-sheet row will be cleared.')) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await archiveRequest(id);
        if (!result.ok) window.alert(result.sync.text || 'Archived with a sheet warning.');
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not archive request.');
      }
    });
  }

  return (
    <div className="min-w-32">
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/requests/${id}/edit`} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-[var(--canvas)]"><Pencil size={12} />Edit</Link>
        <button type="button" disabled={pending} onClick={remove} className="inline-flex items-center gap-1 rounded-md border border-[#f5b5b1] px-2 py-1 text-xs font-medium text-[#c5221f] hover:bg-[#fce8e6] disabled:opacity-50"><Archive size={12} />{pending ? 'Archiving…' : 'Delete'}</button>
      </div>
      {error && <p className="mt-1 max-w-48 text-[10px] text-[#c5221f]">{error}</p>}
    </div>
  );
}
