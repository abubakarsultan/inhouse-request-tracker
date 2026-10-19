'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSheetForExistingProject, retryProjectSheetSetup, retryProjectTabSetup } from '@/services/projects';

export default function ProjectSheetRecovery({ projectId, hasSheet, canCreateSheet = false, setupState, tabSetupState }: { projectId: string; hasSheet: boolean; canCreateSheet?: boolean; setupState?: string | null; tabSetupState?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(action: 'create' | 'retry') {
    setBusy(true); setMessage('');
    try { setMessage(action === 'create' ? await createSheetForExistingProject(projectId) : await retryProjectSheetSetup(projectId)); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Sheet setup failed.'); }
    finally { setBusy(false); }
  }
  const needsRetry = setupState === 'error' || setupState === 'pending';
  const needsTabRetry = tabSetupState === 'error' || tabSetupState === 'pending';
  return <div className="flex flex-wrap items-center gap-2">
    {!hasSheet && canCreateSheet && <button type="button" disabled={busy} onClick={() => run('create')} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50">{busy ? 'Working…' : 'Create sheet now'}</button>}
    {needsTabRetry && <button type="button" disabled={busy} onClick={async()=>{setBusy(true);setMessage('');try{setMessage(await retryProjectTabSetup(projectId));router.refresh()}catch(error){setMessage(error instanceof Error?error.message:'Tab setup failed')}finally{setBusy(false)}}} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50">{busy?'Working…':'Retry tab creation'}</button>}
    {hasSheet && needsRetry && <button type="button" disabled={busy} onClick={() => run('retry')} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50">{busy ? 'Repairing…' : 'Retry setup / Repair access'}</button>}
    {message && <span role="status" className="text-xs text-[var(--muted)]">{message}</span>}
  </div>;
}
