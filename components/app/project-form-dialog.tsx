'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil } from 'lucide-react';
import { createProject, updateProject } from '@/services/projects';
import type { ProjectInput } from '@/lib/validators';

type Project = ProjectInput & { id: string; category_id?: string | null; google_sheet_id?: string | null; sheet_share_emails?: string[] | null; sheet_column_config?: Record<string, string> | null };
type CategoryOption = { id: string; name: string; sheet_mode: 'team_sheet_tab' | 'own_sheet' };

export default function ProjectFormDialog({ project, categories = [], serviceAccountEmail }: { project?: Project; categories?: CategoryOption[]; serviceAccountEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(project?.category_id ?? categories.find((item) => item.name.toLowerCase() === 'inhouse')?.id ?? '');
  const [connectionMode, setConnectionMode] = useState<'existing' | 'create' | 'none'>(project?.google_sheet_id ? 'existing' : 'none');
  const router = useRouter();
  const isEdit = Boolean(project);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const input: ProjectInput = {
      name: String(form.get('name') ?? ''),
      outreach_project_name: String(form.get('outreach_project_name') ?? '') || null,
      guest_post_tab_name: categories.find((item) => item.id === String(form.get('category_id') ?? ''))?.sheet_mode === 'team_sheet_tab' ? (String(form.get('guest_post_tab_name') ?? '') || null) : null,
      sync_enabled: categories.find((item) => item.id === String(form.get('category_id') ?? ''))?.sheet_mode === 'own_sheet' ? connectionMode !== 'none' : form.get('sync_enabled') === 'on',
      category_id: String(form.get('category_id') ?? '') || undefined,
      sheet_tab_name: categories.find((item) => item.id === String(form.get('category_id') ?? ''))?.sheet_mode === 'own_sheet' ? (String(form.get('sheet_tab_name') ?? '') || 'Live Link') : (String(form.get('guest_post_tab_name') ?? '') || null),
      sheet_connection_mode: connectionMode,
      sheet_url: String(form.get('sheet_url') ?? '') || null,
      sheet_share_emails: String(form.get('sheet_share_emails') ?? '').split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean),
      include_dr_traffic: form.get('include_dr_traffic') === 'on',
      google_sheet_id: project?.google_sheet_id ?? null,
    };
    try {
      if (isEdit && project?.category_id && input.category_id && project.category_id !== input.category_id && !window.confirm('Changing category will not move, rename, or delete any existing sheet data. Continue?')) { setPending(false); return; }
      if (isEdit && project?.sheet_tab_name && input.sheet_tab_name && project.sheet_tab_name !== input.sheet_tab_name && !window.confirm('Changing the saved tab name will not rename or move the existing Google Sheet tab automatically. Continue and update only the project mapping?')) { setPending(false); return; }
      if (isEdit) await updateProject(project!.id, input);
      else {
        const result = await createProject(input);
        if (result?.warning) window.alert(result.warning);
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--text)]" title="Edit"><Pencil size={15} /></button>
        ) : (
          <Button><Plus size={16} /> Add Project</Button>
        )}
      </DialogTrigger>
      <DialogContent title={isEdit ? 'Edit project' : 'New project'}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" defaultValue={project?.name} required placeholder="e.g. Get Pro Links" />
          </div>
          <div>
            <Label htmlFor="outreach_project_name">Outreach OS client name</Label>
            <Input id="outreach_project_name" name="outreach_project_name" defaultValue={project?.outreach_project_name ?? ''} placeholder="Defaults to project name" />
          </div>
          <div>
            <Label htmlFor="category_id">Category</Label>
            <select id="category_id" name="category_id" required value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm">
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.sheet_mode === 'own_sheet' ? 'own sheet' : 'team sheet tab'})</option>)}
            </select>
          </div>
          {categories.find((item) => item.id === selectedCategoryId)?.sheet_mode === 'own_sheet' ? <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
            <p className="text-sm font-semibold">Own Google Sheet connection</p>
            <Label htmlFor="sheet_connection_mode">Connection option</Label>
            <select id="sheet_connection_mode" value={connectionMode} onChange={(event) => setConnectionMode(event.target.value as typeof connectionMode)} className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="existing">Link existing Google Sheet</option><option value="create">Create new Google Sheet</option><option value="none">No sheet (tool only)</option></select>
            {connectionMode !== 'none' && <><div><Label htmlFor="sheet_url">Google Sheet URL {connectionMode === 'existing' ? '(required)' : '(not needed for new sheet)'}</Label><Input id="sheet_url" name="sheet_url" defaultValue={project?.google_sheet_id ? `https://docs.google.com/spreadsheets/d/${project.google_sheet_id}/edit` : ''} placeholder="https://docs.google.com/spreadsheets/d/..." /></div><div><Label htmlFor="sheet_tab_name">Tab name</Label><Input id="sheet_tab_name" name="sheet_tab_name" defaultValue={project?.sheet_tab_name || 'Live Link'} required /></div><div><Label htmlFor="sheet_share_emails">Share with emails (one per line or comma-separated)</Label><textarea id="sheet_share_emails" name="sheet_share_emails" defaultValue={(project?.sheet_share_emails ?? []).join('\n')} rows={3} placeholder="client@example.com" className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm" /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="include_dr_traffic" defaultChecked={Boolean(project?.sheet_column_config?.dr)} /> Include DR &amp; Traffic columns</label><p className="text-xs text-[var(--muted)]">Share existing sheets with this service account as Editor. New files are owned by the service account. Enable Google Drive API in Google Cloud before creating new sheets.</p>{serviceAccountEmail && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--canvas)] p-2 text-xs"><code className="break-all">{serviceAccountEmail}</code><button type="button" onClick={() => navigator.clipboard.writeText(serviceAccountEmail)} className="rounded border border-[var(--border)] px-2 py-1">Copy email</button></div>}</>}
          </div> : <><div><Label htmlFor="guest_post_tab_name">Team-sheet tab name</Label><Input id="guest_post_tab_name" name="guest_post_tab_name" defaultValue={project?.guest_post_tab_name ?? ''} placeholder="Defaults to project name" /></div><label className="flex items-center gap-2 pt-1 text-sm text-[var(--muted)]"><input type="checkbox" name="sync_enabled" defaultChecked={project ? project.sync_enabled : true} className="h-4 w-4 rounded border-[var(--border)]" /> Enable Google Sheet mirror for this project</label></>}
          {error && <p className="text-sm text-[#c5221f]">{error}</p>}
          <div className="flex justify-end pt-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
