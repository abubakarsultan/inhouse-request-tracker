'use client';

import { useState } from 'react';
import { Check, Clipboard, Code2, ExternalLink } from 'lucide-react';
import { buildInstallableTriggerSnippet } from '@/lib/sheet-webhook';
import { Button } from '@/components/ui/button';

export default function SettingsScriptPanel() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const script = open ? buildInstallableTriggerSnippet(window.location.origin) : '';

  async function copy() {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><h2 className="font-semibold text-[var(--text)]">Guest Post Anchor Sheet sync</h2><p className="mt-1 text-xs text-[var(--muted)]">The Apps Script is hidden by default. Reveal it only when you need to install or repair the Sheet trigger.</p></div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}><Code2 size={14} /> {open ? 'Hide Apps Script' : 'View Apps Script'}</Button>
      </div>
      {open && <div className="border-t border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--muted)]">This is an installable trigger. Run <code>installTrigger</code> once in the Guest Post Anchor spreadsheet.</p><Button type="button" size="sm" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy Script'}</Button></div>
        <ol className="my-3 list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]"><li>Open Guest Post Anchor and choose Extensions - Apps Script.</li><li>Paste this script, save it, and run <code>installTrigger</code> once.</li><li>Authorize Google and test a Status change.</li></ol>
        <textarea readOnly value={script} aria-label="Guest Post Anchor Apps Script" className="h-80 w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-[11px] leading-5 text-white outline-none" />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]"><span>Webhook: {window.location.origin}/api/sheet-webhook</span><a href="https://script.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--brand)] hover:underline">Open Apps Script <ExternalLink size={12} /></a></div>
      </div>}
    </section>
  );
}
