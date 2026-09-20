'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleProjectActive } from '@/services/projects';
import { Power } from 'lucide-react';

export default function ProjectToggleActive({ id, active }: { id: string; active: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await toggleProjectActive(id, !active);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update project');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`rounded-md p-1.5 hover:bg-[var(--canvas)] ${active ? 'text-[#188038]' : 'text-[var(--muted)]'} disabled:opacity-50`}
        title={active ? 'Disable project' : 'Enable project'}
      >
        <Power size={15} />
      </button>
      {error && <span className="max-w-36 text-[10px] text-[#c5221f]">{error}</span>}
    </div>
  );
}
