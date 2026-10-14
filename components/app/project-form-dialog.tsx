'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { createProject, updateProject } from '@/services/projects';
import { DEFAULT_COLUMN_MAPPING, PROJECT_CATEGORIES, SHEET_DATA_FIELDS, normalizeColumnMapping, type ColumnMapping } from '@/lib/project-sheet';
import type { ProjectInput } from '@/lib/validators';

type Project = ProjectInput & { id: string };

export default function ProjectFormDialog({ project }: { project?: Project }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(project?.category ?? 'Inhouse');
  const [sheetSource, setSheetSource] = useState(project?.sheet_source ?? 'guest_post_anchor');
  const [columns, setColumns] = useState<ColumnMapping[]>(() => normalizeColumnMapping(project?.column_mapping ?? DEFAULT_COLUMN_MAPPING));
  const router = useRouter();
  const isEdit = Boolean(project);

  const canAdd = columns.length < 26;
  const nextColumn = useMemo(() => String.fromCharCode(65 + columns.length), [columns.length]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get('name') ?? ''),
      outreach_project_name: String(form.get('outreach_project_name') ?? '') || null,
      category,
      sheet_source: sheetSource,
      google_sheet_id: String(form.get('google_sheet_id') ?? '') || null,
      sheet_name: String(form.get('sheet_name') ?? '') || null,
      guest_post_tab_name: String(form.get('guest_post_tab_name') ?? '') || null,
      column_mapping: columns,
      sync_enabled: form.get('sync_enabled') === 'on',
    } as ProjectInput;
    try {
      if (isEdit) await updateProject(project!.id, input);
      else await createProject(input);
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
          <button className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--text)]" title="Edit project"><Pencil size={15} /></button>
        ) : (
          <Button><Plus size={16} /> Add Project</Button>
        )}
      </DialogTrigger>
      <DialogContent title={isEdit ? 'Edit project' : 'Add project'} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="name">Project name</Label><Input id="name" name="name" defaultValue={project?.name} required placeholder="e.g. Get Pro Links" /></div>
            <div><Label htmlFor="outreach_project_name">Outreach OS client name</Label><Input id="outreach_project_name" name="outreach_project_name" defaultValue={project?.outreach_project_name ?? ''} placeholder="Defaults to project name" /></div>
            <div>
              <Label>Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm">
                {PROJECT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <Label>Sheet source</Label>
              <select value={sheetSource} onChange={(e) => setSheetSource(e.target.value as any)} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm">
                <option value="guest_post_anchor">Guest Post Anchor Sheet</option>
                <option value="custom_sheet">Custom / New Google Sheet</option>
              </select>
            </div>
            {sheetSource === 'custom_sheet' && <>
              <div><Label htmlFor="google_sheet_id">Google Sheet ID</Label><Input id="google_sheet_id" name="google_sheet_id" defaultValue={project?.google_sheet_id ?? ''} placeholder="ID from Google Sheet URL" /></div>
              <div><Label htmlFor="sheet_name">Sheet display name</Label><Input id="sheet_name" name="sheet_name" defaultValue={project?.sheet_name ?? ''} placeholder="e.g. Client Outreach Sheet" /></div>
            </>}
            <div className="sm:col-span-2"><Label htmlFor="guest_post_tab_name">Sheet tab name</Label><Input id="guest_post_tab_name" name="guest_post_tab_name" defaultValue={project?.guest_post_tab_name ?? ''} placeholder="Exact tab name used for this project" /></div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--canvas)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-semibold">Sheet columns & data mapping</h3><p className="mt-1 text-xs text-[var(--muted)]">Choose each column heading and what the tool should write underneath it.</p></div>
              <Button type="button" variant="outline" disabled={!canAdd} onClick={() => setColumns((items) => [...items, { column: nextColumn, heading: `Column ${nextColumn}`, field: 'blank' }])}><Plus size={14}/> Add column</Button>
            </div>
            <div className="mt-4 space-y-2">
              {columns.map((column, index) => (
                <div key={`${column.column}-${index}`} className="grid items-end gap-2 rounded-xl bg-[var(--card)] p-3 sm:grid-cols-[70px_1fr_1fr_42px]">
                  <div><Label>Column</Label><Input value={column.column} onChange={(e) => setColumns((items) => items.map((x,i) => i === index ? {...x,column:e.target.value.toUpperCase()} : x))} /></div>
                  <div><Label>Heading</Label><Input value={column.heading} onChange={(e) => setColumns((items) => items.map((x,i) => i === index ? {...x,heading:e.target.value} : x))} /></div>
                  <div><Label>What goes under it?</Label><select value={column.field} onChange={(e) => setColumns((items) => items.map((x,i) => i === index ? {...x,field:e.target.value as any} : x))} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm">{SHEET_DATA_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}</select></div>
                  <button type="button" title="Remove column" onClick={() => setColumns((items) => items.filter((_,i) => i !== index))} className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[#fce8e6] hover:text-[#c5221f]"><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--muted)]"><input type="checkbox" name="sync_enabled" defaultChecked={project ? project.sync_enabled : true} className="h-4 w-4 rounded border-[var(--border)]" />Enable Google Sheet sync for this project</label>
          {error && <p className="text-sm text-[#c5221f]">{error}</p>}
          <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
