'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OutreachCsvDownload({ defaultDate }: { defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function download() {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(`/api/exports/requests?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Could not build CSV.' }));
        setMessage(body.message || 'Could not build CSV.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `requests_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`Downloaded requests_${date}.csv`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not download CSV.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--text)]">Download Today CSV</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Exports requests created on the selected Karachi date in the exact 9-column bulk-add format.</p>
      <div className="mt-4 flex max-w-md flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1"><Label htmlFor="export-date">Date</Label><Input id="export-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <Button type="button" onClick={download} disabled={pending || !date}>{pending ? 'Preparing…' : 'Download CSV'}</Button>
      </div>
      {message && <p className={`mt-3 text-sm ${message.startsWith('Downloaded') ? 'text-[#188038]' : 'text-[#b06000]'}`}>{message}</p>}
    </div>
  );
}
