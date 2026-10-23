'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ExternalLink, FileCode2, Sheet, Copy } from 'lucide-react';
import { normalizeColumnMapping, SHEET_DATA_FIELDS } from '@/lib/project-sheet';
import { buildGoogleSheetUrl } from '@/lib/google-sheet-url';

type Props = {
  project: any;
  teamSheetId?: string | null;
  appScript: string;
  compact?: boolean;
  serviceAccountEmail?: string | null;
};

export default function ProjectSheetDetails({ project, teamSheetId, appScript, compact = false, serviceAccountEmail = null }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const sheetId = project.sheet_source === 'custom_sheet' ? (project.google_sheet_id || '') : (project.google_sheet_id || teamSheetId || '');
  const sheetUrl = sheetId ? buildGoogleSheetUrl(sheetId, project.google_sheet_gid) : '';
  const mapping = normalizeColumnMapping(project.column_mapping);

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(appScript);
      setCopyError(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopyError('Automatic copy failed. Select and copy the code below.');
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    {!compact && sheetUrl && <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium hover:bg-[var(--canvas)]"><Sheet size={15}/> Open Sheet <ExternalLink size={13}/></a>}
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size={compact ? 'icon' : 'default'} aria-label={compact ? 'Sheet details and Apps Script' : undefined} title={compact ? 'Sheet details and Apps Script' : undefined} className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"><FileCode2 size={15}/>{!compact && 'Sheet Details & Apps Script'}</Button></DialogTrigger>
      <DialogContent title="Sheet details & Apps Script" className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Source" value={project.sheet_source === 'custom_sheet' ? 'Custom Google Sheet' : 'Guest Post Anchor'} />
          <Info label="Sheet" value={project.sheet_name || (project.sheet_source === 'custom_sheet' ? 'Custom sheet' : 'Guest Post Anchor')} />
          <Info label="Tab" value={project.guest_post_tab_name || 'Not configured'} />
          <Info label="Sync" value={project.sync_enabled ? 'Enabled' : 'Disabled'} />
        </div>

        {project.sheet_source === 'custom_sheet' && <div className="rounded-xl border border-[var(--border)] p-3 text-sm"><p><strong>Drive owner:</strong> {project.sheet_owner_email || 'Connect Google Drive to confirm owner email.'}</p><p className={"mt-1 text-xs " + (project.sheet_setup_state === 'connected' ? 'text-[#137333]' : 'text-[#b06000]')}><strong>Service account:</strong> {serviceAccountEmail || 'Not configured'} · {project.sheet_setup_state === 'connected' ? 'added as Editor and verified' : 'access not yet verified; use Retry setup / Repair access'}</p></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Spreadsheet ID: <code>{sheetId || 'Not configured'}</code></div>{sheetUrl && <a target="_blank" rel="noreferrer" href={sheetUrl} className="inline-flex items-center gap-1 text-sm text-[var(--brand)]">Open Sheet <ExternalLink size={14}/></a>}</div>
        <div>
          <h3 className="mb-2 font-semibold">Column mapping</h3>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm"><thead className="bg-[var(--canvas)] text-left text-xs uppercase text-[var(--muted)]"><tr><th className="p-3">Column</th><th className="p-3">Heading</th><th className="p-3">Data source</th></tr></thead><tbody>{mapping.map((item) => <tr key={item.column} className="border-t border-[var(--border)]"><td className="p-3 font-semibold">{item.column}</td><td className="p-3">{item.heading}</td><td className="p-3 text-[var(--muted)]">{SHEET_DATA_FIELDS.find((option) => option.value === item.field)?.label || item.field}{item.field === 'static' ? `: ${item.static_value || ''}` : ''}</td></tr>)}</tbody></table>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Apps Script</h3><p className="text-xs text-[var(--muted)]">Generated for this project's tab and column mapping.</p></div><Button type="button" variant="outline" onClick={copyScript}><Copy size={14}/>{copied ? 'Copied' : 'Copy Apps Script'}</Button></div>
          {copyError && <p role="alert" className="mb-2 text-sm text-red-600">{copyError}</p>}
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]"><li>In Google Sheets, open Extensions → Apps Script.</li><li>Paste this script and replace the <code>SHEET_WEBHOOK_SECRET</code> placeholder with the configured Vercel secret. Keep it private.</li><li>Save, select the generated <code>installProjectTrigger_...</code> function, run it once, and approve Google's authorization prompt.</li></ol><p className="mb-3 text-xs text-[var(--muted)]">The edit trigger is not installed automatically. A spreadsheet owner must authorize it once.</p>
          {project.sheet_source === 'guest_post_anchor' && <p className="mb-3 rounded-lg border border-[#f3dfad] bg-[#fef7e0] p-3 text-xs text-[#785000]">Shared Guest Post Anchor already uses its workbook-level status trigger. This snippet is a project-specific reference; do not install it alongside the shared trigger or duplicate webhook calls may result.</p>}
          <textarea readOnly value={appScript} className="h-[420px] w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-xs leading-5 text-white outline-none" />
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[var(--canvas)] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p><p className="mt-1 truncate text-sm font-semibold" title={value}>{value}</p></div>;
}
