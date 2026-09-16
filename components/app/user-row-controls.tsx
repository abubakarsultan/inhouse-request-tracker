'use client';
import { useState, useTransition } from 'react';
import { setUserRole, setUserActive } from '@/services/users';
import { useRouter } from 'next/navigation';

export default function UserRowControls({ id, role, active, isSelf }: { id: string; role: 'admin' | 'member'; active: boolean; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function changeRole(e: React.ChangeEvent<HTMLSelectElement>) {
    setError(null);
    startTransition(async () => {
      try {
        await setUserRole(id, e.target.value as 'admin' | 'member');
        router.refresh();
      } catch (err: any) {
        setError(err.message);
      }
    });
  }

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      try {
        await setUserActive(id, !active);
        router.refresh();
      } catch (err: any) {
        setError(err.message);
      }
    });
  }

  if (isSelf) return <span className="text-xs text-slate-400">(you)</span>;

  return (
    <div className="flex items-center gap-2">
      <select value={role} onChange={changeRole} disabled={pending} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      <button
        onClick={toggleActive}
        disabled={pending}
        className={`rounded-md px-2 py-1 text-xs font-medium ${active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
