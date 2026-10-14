'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

export default function ClientSheetScript({ script, sheetUrl, tabName }: { script: string; sheetUrl: string; tabName: string }) {
  const [copied, setCopied] = useState(false);
  async function copyScript() {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold text-[var(--text)]">Sheet → Tool status sync</h2><p className="mt-1 text-sm text-[var(--muted)]">Tab: <strong>{tabName}</strong>. Install this trigger once so edits to the Status column sync back into INHOUSE REQUEST.</p></div>
      <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"><ExternalLink size={14}/> Open sheet</a>
    </div>
    <ol className="my-4 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
      <li>Open the Google Sheet, then choose <strong>Extensions → Apps Script</strong>.</li>
      <li>Replace the editor contents with the script below and click Save.</li>
      <li>Select <code>installTrigger</code> at the top and click Run once.</li>
      <li>Review Google permissions and authorize. Return to the sheet and test by changing a request Status.</li>
    </ol>
    <div className="mb-2 flex justify-end"><button type="button" onClick={copyScript} className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white">{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copied' : 'Copy Apps Script'}</button></div>
    <textarea readOnly value={script} aria-label="Client sheet Apps Script" className="h-72 w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-xs leading-5 text-white outline-none" />
    <p className="mt-2 text-xs text-[var(--muted)]">The script contains the webhook secret. Only share it with trusted sheet editors; regenerate the secret if it is exposed.</p>
  </section>;
}
