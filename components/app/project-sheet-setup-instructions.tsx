'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, FileCode2, ShieldAlert } from 'lucide-react';

type Props = { appScript: string; sheetUrl: string | null; serviceAccountEmail: string | null };

export default function ProjectSheetSetupInstructions({ appScript, sheetUrl, serviceAccountEmail }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showCode, setShowCode] = useState(false);

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(appScript);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
      setShowCode(true);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><FileCode2 size={20}/> Complete Apps Script Setup</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Complete these one-time steps to receive status changes from Google Sheets.</p>
        </div>
        <button type="button" onClick={copyScript} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold transition hover:bg-[var(--brand-soft)] hover:text-[var(--brand-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"><Copy size={16}/>{copyState === 'copied' ? 'Script Copied' : 'Copy Apps Script'}</button>
      </div>
      {copyState === 'copied' && <p role="status" className="mt-2 flex items-center gap-1 text-sm text-[#137333]"><Check size={16}/> Script copied. Paste it into the Google Apps Script editor.</p>}
      {copyState === 'failed' && <p role="alert" className="mt-2 text-sm text-[#b3261e]">Copy was blocked by your browser. Expand the script and copy it manually.</p>}
      <ol className="mt-5 space-y-3">
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-dark)]">1</span><div><p className="font-semibold">Open your Google Sheet</p><p className="mt-0.5 text-sm text-[var(--muted)]">Use the Open Google Sheet button above, then select <strong>Extensions → Apps Script</strong>.</p></div></li>
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-dark)]">2</span><div><p className="font-semibold">Paste and save the script</p><p className="mt-0.5 text-sm text-[var(--muted)]">Click Copy Apps Script, paste it into the script editor and save the project. If the workbook already contains custom scripts, preserve them and add the new code instead of deleting them.</p></div></li>
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-dark)]">3</span><div><p className="font-semibold">Configure the webhook secret</p><p className="mt-0.5 text-sm text-[var(--muted)]">Inside the generated code, replace <code>SHEET_WEBHOOK_SECRET</code>'s placeholder with the existing value configured in Vercel. <strong>Keep this secret private.</strong></p></div></li>
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-dark)]">4</span><div><p className="font-semibold">Install the edit trigger</p><p className="mt-0.5 text-sm text-[var(--muted)]">In Apps Script, choose the generated <code>installProjectTrigger_...</code> function from the function dropdown, click <strong>Run</strong>, and approve Google's permission request.</p></div></li>
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-dark)]">5</span><div><p className="font-semibold">Verify status synchronization</p><p className="mt-0.5 text-sm text-[var(--muted)]">Use an existing test row: change its Status in the Google Sheet, then check that the corresponding request status changes in the app. Restore the original status afterwards. Only mark the setup complete after confirming this update.</p></div></li>
      </ol>
      <div className="mt-5 rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-3 text-sm text-[#785000]"><div className="flex items-center gap-2 font-semibold"><ShieldAlert size={17}/> Manual Google authorization required</div><p className="mt-1">Creating or connecting the spreadsheet does not automatically install its Apps Script edit trigger. This setup must be authorized once by an owner or administrator.</p></div>
      {serviceAccountEmail && <p className="mt-4 text-xs text-[var(--muted)]">For an existing Sheet, verify Editor access for the sync service account: <code className="break-all">{serviceAccountEmail}</code>.</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {sheetUrl && <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold transition hover:bg-[var(--brand-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]">Open Sheet <ExternalLink size={15}/></a>}
        <button type="button" onClick={()=>setShowCode(value=>!value)} className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium transition hover:bg-[var(--canvas)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]">{showCode ? 'Hide Script' : 'View Script'}</button>
      </div>
      {showCode && <div className="mt-3"><label htmlFor="project-generated-script" className="mb-2 block text-xs font-medium text-[var(--muted)]">Generated Apps Script (read-only)</label><textarea id="project-generated-script" readOnly spellCheck={false} value={appScript} className="h-72 w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-xs leading-5 text-white" /></div>}
    </section>
  );
}
