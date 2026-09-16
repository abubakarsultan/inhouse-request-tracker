'use client';
import { useState, useTransition } from 'react';
import { updateSiteStatus } from '@/services/sites';

const OPTIONS = ['Pending', 'Sent', 'Live', 'Rejected', 'Removed'];

export default function SiteStatusSelect({ id, projectId, status }: { id: string; projectId: string; status: string }) {
  const [value, setValue] = useState(status || 'Pending');
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setValue(v);
    startTransition(() => updateSiteStatus(id, projectId, v));
  }

  return (
    <select
      value={value}
      onChange={onChange}
      disabled={pending}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
    >
      {OPTIONS.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
