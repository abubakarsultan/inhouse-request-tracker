'use client';
import { useState } from 'react';

type Props = { status: 'connected' | 'needs_reconnect' | 'disconnected'; email: string | null; lastError: string | null };
export default function GoogleDriveConnectionCard({ status, email, lastError }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function disconnect() {
    if (!window.confirm('Disconnect this Google Drive account? Existing sheets will remain, but creating or repairing sheets will require reconnecting.')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/google/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Disconnect failed.');
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Disconnect failed.'); setBusy(false); }
  }
  const label = status === 'connected' ? 'Connected' : status === 'needs_reconnect' ? 'Reconnect required' : 'Not connected';
  return <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Google Drive</h2><p className="mt-1 text-sm text-[var(--muted)]">Connect the Google account that should own new project and collaboration spreadsheets.</p><p className="mt-3 text-sm font-semibold">{label}{status === 'connected' && email ? ` as ${email}` : ''}</p>{lastError ? <p className="mt-1 text-sm text-amber-700">{lastError}</p> : null}{message ? <p role="alert" className="mt-2 text-sm text-red-600">{message}</p> : null}</div>
    <div className="flex flex-wrap gap-2">{status !== 'connected' ? <a className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white" href="/api/google/connect?return=%2Fprofile">{status === 'needs_reconnect' ? 'Reconnect Google Drive' : 'Connect Google Drive'}</a> : <><a className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold" href="/api/google/connect?return=%2Fprofile">Reconnect</a><button type="button" disabled={busy} onClick={disconnect} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Disconnecting…' : 'Disconnect'}</button></>}</div></div>
  </section>;
}
