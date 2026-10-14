'use client';

import { useState } from 'react';
import { Check, Clipboard, ExternalLink, Settings2, ShieldCheck, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ensureProjectGuestPostTab, getProjectSheetSetup, testProjectSheetConnection } from '@/services/projects';

type Props = {
  projectId: string;
  projectName: string;
  source: 'guest_post_anchor' | 'own_sheet' | 'none';
  tabName: string | null;
  sheetUrl: string | null;
  canManage: boolean;
};

function sourceLabel(source: Props['source']) {
  if (source === 'guest_post_anchor') return 'Guest Post Anchor';
  if (source === 'own_sheet') return 'Own Google Sheet';
  return 'Tool only';
}

export default function ProjectSheetSettingsDialog({ projectId, projectName, source, tabName, sheetUrl, canManage }: Props) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [creatingTab, setCreatingTab] = useState(false);
  const [connection, setConnection] = useState<{ ok: boolean; detail: string; tabExists?: boolean } | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [copied, setCopied] = useState(false);

  async function testConnection() {
    setChecking(true);
    setConnection(null);
    try {
      const result = await testProjectSheetConnection(projectId);
      setConnection({ ok: result.ok, detail: result.detail, tabExists: result.tabExists });
    } catch (caught) {
      setConnection({ ok: false, detail: caught instanceof Error ? caught.message : 'Connection check failed.' });
    } finally {
      setChecking(false);
    }
  }

  async function createMissingTab() {
    setCreatingTab(true);
    try {
      await ensureProjectGuestPostTab(projectId);
      await testConnection();
    } catch (caught) {
      setConnection({ ok: false, detail: caught instanceof Error ? caught.message : 'Could not create the project tab.' });
    } finally {
      setCreatingTab(false);
    }
  }

  async function loadScript() {
    setLoadingScript(true);
    try {
      const result = await getProjectSheetSetup(projectId, window.location.origin);
      setScript(result.script);
    } catch (caught) {
      setConnection({ ok: false, detail: caught instanceof Error ? caught.message : 'Could not load Apps Script.' });
    } finally {
      setLoadingScript(false);
    }
  }

  async function copyScript() {
    if (!script) return;
    await navigator.clipboard.writeText(script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setConnection(null); setScript(null); setCopied(false); } }}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm"><Settings2 size={14} /> Sheet & Sync</Button>
      </DialogTrigger>
      <DialogContent title={`${projectName} - Sheet & Sync`} className="max-w-2xl">
        <div className="space-y-5">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--canvas)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Connection</p><h3 className="mt-1 text-base font-bold text-[var(--text)]">{sourceLabel(source)}</h3></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${source === 'none' ? 'bg-[var(--card)] text-[var(--muted)]' : 'bg-[#e8f0fe] text-[#174ea6]'}`}>{source === 'none' ? 'Tool only' : 'Configured'}</span>
            </div>
            {tabName && <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"><p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Tab</p><p className="mt-1 font-semibold text-[var(--text)]">{tabName}</p></div>}
            {source === 'none' && <p className="mt-3 text-sm text-[var(--muted)]">This project stores and tracks requests in INHOUSE REQUEST without a Google Sheet mirror.</p>}
          </section>

          {source !== 'none' && (
            <div className="flex flex-wrap gap-2">
              {sheetUrl && <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--canvas)]"><ExternalLink size={14} /> Open Sheet</a>}
              <Button type="button" variant="secondary" size="sm" onClick={testConnection} disabled={checking || creatingTab}><span className={checking ? 'animate-spin' : ''}><Settings2 size={14} /></span>{checking ? 'Checking...' : 'Test Connection'}</Button>
              {canManage && connection && !connection.ok && connection.tabExists === false && source === 'guest_post_anchor' && connection.detail.toLowerCase().includes('tab') && <Button type="button" variant="secondary" size="sm" onClick={createMissingTab} disabled={creatingTab}>{creatingTab ? 'Creating Tab...' : 'Create Missing Tab'}</Button>}
              {canManage && <Button type="button" variant="secondary" size="sm" onClick={loadScript} disabled={loadingScript}><ShieldCheck size={14} />{loadingScript ? 'Loading Script...' : script ? 'Refresh Apps Script' : 'View Apps Script'}</Button>}
            </div>
          )}

          {connection && <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${connection.ok ? 'border-[#b7dfbf] bg-[#e6f4ea] text-[#188038]' : 'border-[#f4b7b2] bg-[#fce8e6] text-[#c5221f]'}`}>{connection.ok ? <Check size={17} className="mt-0.5 shrink-0" /> : <XCircle size={17} className="mt-0.5 shrink-0" />}<span>{connection.detail}</span></div>}

          {script && canManage && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4">
                <div><h3 className="font-semibold text-[var(--text)]">Apps Script setup</h3><p className="mt-1 text-xs text-[var(--muted)]">Only an admin can reveal or copy this integration script.</p></div>
                <Button type="button" size="sm" onClick={copyScript}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy Script'}</Button>
              </div>
              <div className="p-4">
                <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]">
                  <li>Open the Google Sheet and choose Extensions - Apps Script.</li>
                  <li>Paste the script, save it, then run <code>installTrigger</code> once.</li>
                  <li>Authorize Google and test a Status change.</li>
                </ol>
                <textarea readOnly value={script} aria-label="Apps Script" className="h-72 w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-[11px] leading-5 text-white outline-none" />
              </div>
            </section>
          )}

          {source === 'guest_post_anchor' && <p className="text-xs text-[var(--muted)]">Guest Post Anchor projects use the central team spreadsheet. New requests are written to the selected project tab automatically. Status changes can sync back from the Sheet through the installable trigger.</p>}
          {source === 'own_sheet' && <p className="text-xs text-[var(--muted)]">Project-owned sheets use their configured headers and connection. Request edits and status changes stay linked to this project sheet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
