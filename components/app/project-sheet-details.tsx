'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ExternalLink, FileCode2, Sheet, Copy } from 'lucide-react';
import { normalizeColumnMapping } from '@/lib/project-sheet';
import { buildGoogleSheetUrl } from '@/lib/google-sheet-url';

type Props = {
  project: any;
  teamSheetId?: string | null;
  appScript: string;
};

export default function ProjectSheetDetails({ project, teamSheetId, appScript }: Props) {
  const [copied, setCopied] = useState(false);
  const sheetId = project.google_sheet_id || teamSheetId || '';
  const sheetUrl = sheetId ? buildGoogleSheetUrl(sheetId, project.sheet_source === 'custom_sheet' ? project.google_sheet_gid : null) : '';
  const mapping = normalizeColumnMapping(project.column_mapping);

  async function copyScript() {
    await navigator.clipboard.writeText(appScript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <div className="flex flex-wrap items-center gap-2">
    {sheetUrl && <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium hover:bg-[var(--canvas)]"><Sheet size={15}/> Open Sheet <ExternalLink size={13}/></a>}
    <Dialog>
      <DialogTrigger asChild><Button variant="outline"><FileCode2 size={15}/> Sheet Details & Apps Script</Button></DialogTrigger>
      <DialogContent title="Sheet details & Apps Script" className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Source" value={project.sheet_source === 'custom_sheet' ? 'Custom Google Sheet' : 'Guest Post Anchor'} />
          <Info label="Sheet" value={project.sheet_name || (project.sheet_source === 'custom_sheet' ? 'Custom sheet' : 'Guest Post Anchor')} />
          <Info label="Tab" value={project.guest_post_tab_name || 'Not configured'} />
          <Info label="Sync" value={project.sync_enabled ? 'Enabled' : 'Disabled'} />
        </div>

        <div>
          <h3 className="mb-2 font-semibold">Column mapping</h3>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm"><thead className="bg-[var(--canvas)] text-left text-xs uppercase text-[var(--muted)]"><tr><th className="p-3">Column</th><th className="p-3">Heading</th><th className="p-3">Data source</th></tr></thead><tbody>{mapping.map((item) => <tr key={item.column} className="border-t border-[var(--border)]"><td className="p-3 font-semibold">{item.column}</td><td className="p-3">{item.heading}</td><td className="p-3 text-[var(--muted)]">{item.field}</td></tr>)}</tbody></table>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Apps Script</h3><p className="text-xs text-[var(--muted)]">Generated for this project's tab and column mapping.</p></div><Button type="button" variant="outline" onClick={copyScript}><Copy size={14}/>{copied ? 'Copied' : 'Copy Apps Script'}</Button></div>
          <textarea readOnly value={appScript} className="h-[420px] w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-xs leading-5 text-white outline-none" />
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[var(--canvas)] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p><p className="mt-1 truncate text-sm font-semibold" title={value}>{value}</p></div>;
}
