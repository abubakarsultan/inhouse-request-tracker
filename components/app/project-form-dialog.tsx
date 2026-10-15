'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Copy, Check, Trash2 } from 'lucide-react';
import { createProject, updateProject } from '@/services/projects';
import { DEFAULT_COLUMN_MAPPING, PROJECT_CATEGORIES, SHEET_DATA_FIELDS, normalizeColumnMapping, type ColumnMapping } from '@/lib/project-sheet';
import { buildGoogleSheetUrl } from '@/lib/google-sheet-url';
import type { ProjectInput } from '@/lib/validators';

type Project = Omit<ProjectInput, 'sheet_url'> & {
  id: string; google_sheet_id?: string | null; google_sheet_gid?: number | null;
  sheet_name?: string | null; guest_post_tab_name?: string | null;
};

export default function ProjectFormDialog({ project, serviceAccountEmail }: { project?: Project; serviceAccountEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(project?.category ?? 'Inhouse');
  const [sheetSource, setSheetSource] = useState(project?.sheet_source ?? 'custom_sheet');
  const [columns, setColumns] = useState<ColumnMapping[]>(() => normalizeColumnMapping(project?.column_mapping ?? DEFAULT_COLUMN_MAPPING));
  const [sheetUrl, setSheetUrl] = useState(project?.google_sheet_id ? buildGoogleSheetUrl(project.google_sheet_id, project.google_sheet_gid) : '');
  const router = useRouter();
  const isEdit = Boolean(project);

  async function copyEmail() {
    if (!serviceAccountEmail) return;
    try { await navigator.clipboard.writeText(serviceAccountEmail); setCopied(true); }
    catch { setError('Copy failed. Select the email above and copy it manually.'); }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sheetSource === 'custom_sheet' && !sheetUrl.trim()) { setError('Paste the Google Sheet URL first.'); return; }
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get('name') ?? ''),
      outreach_project_name: String(form.get('outreach_project_name') ?? '') || null,
      category,
      sheet_source: sheetSource,
      sheet_url: sheetSource === 'custom_sheet' ? sheetUrl.trim() : null,
      guest_post_tab_name: sheetSource === 'guest_post_anchor' ? String(form.get('guest_post_tab_name') ?? '') || null : null,
      column_mapping: columns,
      sync_enabled: form.get('sync_enabled') === 'on',
    } as ProjectInput;
    try {
      if (isEdit) await updateProject(project!.id, input);
      else await createProject(input);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the project.');
    } finally { setPending(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null); setCopied(false); } }}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--text)]" title="Edit project" aria-label={`Edit ${project?.name}`}><Pencil size={15}/></button>
        ) : (<Button><Plus size={16}/> Add Project</Button>)}
      </DialogTrigger>
      <DialogContent title={isEdit ? 'Edit project' : 'Add project'} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor={`name-${project?.id || 'new'}`}>Project name</Label><Input id={`name-${project?.id || 'new'}`} name="name" defaultValue={project?.name} required placeholder="e.g. Get Pro Links" /></div>
            <div><Label>Category</Label><select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm">{PROJECT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-4">
            <div><h3 className="font-semibold">Connect Google Sheet</h3><p className="mt-1 text-xs text-[var(--muted)]">Paste the Sheet URL only. Sheet ID, title, tab and column headings are detected automatically.</p></div>
            <div><Label>Sheet source</Label><select value={sheetSource} onChange={(e) => setSheetSource(e.target.value as typeof sheetSource)} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="custom_sheet">Google Sheet URL</option><option value="guest_post_anchor">Existing shared Guest Post Anchor Sheet</option></select></div>
            {sheetSource === 'custom_sheet' ? (
              <div><Label htmlFor={`sheet-url-${project?.id || 'new'}`}>Google Sheet URL</Label><Input id={`sheet-url-${project?.id || 'new'}`} type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} required placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" /><p className="mt-1 text-xs text-[var(--muted)]">Copy the URL while viewing the correct tab. Its tab ID is detected from #gid= in the link.</p></div>
            ) : (
              <div><Label htmlFor={`team-tab-${project?.id || 'new'}`}>Guest Post Anchor tab name</Label><Input id={`team-tab-${project?.id || 'new'}`} name="guest_post_tab_name" defaultValue={project?.guest_post_tab_name ?? ''} required placeholder="Existing tab name in the shared team sheet" /></div>
            )}
          </div>

          <div className="rounded-xl border border-[#b8d7f8] bg-[var(--card)] p-4">
            <h3 className="text-sm font-semibold">Give this email Editor access</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">In the Google Sheet, click <strong>Share</strong>, add the service account below as <strong>Editor</strong>, then save the project.</p>
            {serviceAccountEmail ? (
              <div className="mt-3 flex items-center gap-2"><Input readOnly value={serviceAccountEmail} aria-label="Google service account email" /><Button type="button" variant="outline" onClick={copyEmail}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copied' : 'Copy'}</Button></div>
            ) : <p className="mt-2 text-sm font-medium text-[#c5221f]">Service account is not configured yet. Ask the administrator to configure GOOGLE_SERVICE_ACCOUNT_JSON in Vercel.</p>}
          </div>

          <details className="rounded-xl border border-[var(--border)] p-4">
            <summary className="cursor-pointer text-sm font-semibold">Advanced settings {isEdit ? '& column mapping' : '(optional)'}</summary>
            <div className="mt-4 space-y-4">
              <div><Label htmlFor={`outreach-${project?.id || 'new'}`}>Outreach OS client name</Label><Input id={`outreach-${project?.id || 'new'}`} name="outreach_project_name" defaultValue={project?.outreach_project_name ?? ''} placeholder="Defaults to project name" /></div>
              {isEdit && <div><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Column mapping</h4><Button type="button" variant="outline" disabled={columns.length >= 26} onClick={() => setColumns((items) => [...items, { column: String.fromCharCode(65 + items.length), heading: `Column ${String.fromCharCode(65 + items.length)}`, field: 'blank' }])}><Plus size={14}/> Column</Button></div><p className="mb-2 mt-1 text-xs text-[var(--muted)]">Only edit this if your existing sheet uses unusual headings. Changing the Sheet URL resets mapping to the new sheet's headings.</p><div className="max-h-64 space-y-2 overflow-y-auto">{columns.map((column, index) => <div key={`${index}`} className="grid items-end gap-2 rounded-lg bg-[var(--canvas)] p-2 sm:grid-cols-[66px_1fr_1fr_32px]"><div><Label>Column</Label><Input value={column.column} onChange={(e) => setColumns((items) => items.map((item, i) => i === index ? { ...item, column: e.target.value.toUpperCase() } : item))}/></div><div><Label>Heading</Label><Input value={column.heading} onChange={(e) => setColumns((items) => items.map((item, i) => i === index ? { ...item, heading: e.target.value } : item))}/></div><div><Label>App data</Label><select value={column.field} onChange={(e) => setColumns((items) => items.map((item, i) => i === index ? { ...item, field: e.target.value as typeof item.field } : item))} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs">{SHEET_DATA_FIELDS.map((field) => <option value={field.value} key={field.value}>{field.label}</option>)}</select></div><button type="button" title="Remove column" onClick={() => setColumns((items) => items.filter((_, i) => i !== index))} className="mb-1 rounded-md p-1.5 text-[var(--muted)]"><Trash2 size={16}/></button></div>)}</div></div>}
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]"><input type="checkbox" name="sync_enabled" defaultChecked={project ? project.sync_enabled : true} />Enable Google Sheet sync</label>
          {error && <p role="alert" className="rounded-lg bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</p>}
          <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? 'Checking Sheet & saving…' : isEdit ? 'Save changes' : 'Create project'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
