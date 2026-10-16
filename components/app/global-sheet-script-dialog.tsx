'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Copy, FileCode2 } from 'lucide-react';

export default function GlobalSheetScriptDialog({ snippet, webhookUrl }: { snippet: string; webhookUrl: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return <Dialog>
    <DialogTrigger asChild><Button variant="outline"><FileCode2 size={15}/> View Apps Script</Button></DialogTrigger>
    <DialogContent title="Guest Post Anchor Apps Script" className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">Use this global script for the Guest Post Anchor workbook. Project-specific scripts are available inside each project.</p>
        <Button type="button" variant="outline" onClick={copy}><Copy size={14}/>{copied ? 'Copied' : 'Copy Script'}</Button>
      </div>
      <textarea readOnly value={snippet} className="h-[460px] w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-xs leading-5 text-white outline-none" />
      <p className="mt-2 text-xs text-[var(--muted)]">Webhook URL: <span className="font-mono">{webhookUrl}</span></p>
    </DialogContent>
  </Dialog>;
}
