'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleProjectActive } from '@/services/projects';
import { Power } from 'lucide-react';

export default function ProjectToggleActive({ id, active }: { id: string; active: boolean }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function toggle() {
    setPending(true);
    try {
      await toggleProjectActive(id, !active);
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-md p-1.5 hover:bg-slate-100 ${active ? 'text-emerald-600' : 'text-slate-400'}`}
      title={active ? 'Disable project' : 'Enable project'}
    >
      <Power size={15} />
    </button>
  );
}
