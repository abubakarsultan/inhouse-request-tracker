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

type Project = ProjectInput & { id: string };

export default function ProjectFormDialog({ project }: { project?: Project }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isEdit = Boolean(project);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const input: ProjectInput = {
      name: String(form.get('name') ?? ''),
      outreach_project_name: String(form.get('outreach_project_name') ?? '') || null,
      guest_post_tab_name: String(form.get('guest_post_tab_name') ?? '') || null,
      sync_enabled: form.get('sync_enabled') === 'on',
    };
    try {
      if (isEdit) await updateProject(project!.id, input);
      else await createProject(input);
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit">
            <Pencil size={15} />
          </button>
        ) : (
          <Button>
            <Plus size={16} /> Add Project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={isEdit ? 'Edit project' : 'New project'}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" defaultValue={project?.name} required placeholder="e.g. Get Pro Links" />
          </div>
          <div>
            <Label htmlFor="outreach_project_name">Outreach OS project name</Label>
            <Input id="outreach_project_name" name="outreach_project_name" defaultValue={project?.outreach_project_name ?? ''} placeholder="e.g. AIproductindex" />
          </div>
          <div>
            <Label htmlFor="guest_post_tab_name">Guest Post Anchor tab name</Label>
            <Input id="guest_post_tab_name" name="guest_post_tab_name" defaultValue={project?.guest_post_tab_name ?? ''} placeholder="e.g. AI Product Index Website" />
          </div>
          <p className="text-xs text-slate-400">
            All projects share one team spreadsheet (set via the TEAM_SHEET_ID env var) — no per-project sheet ID needed.
          </p>
          <label className="flex items-center gap-2 pt-1 text-sm text-slate-600">
            <input type="checkbox" name="sync_enabled" defaultChecked={project?.sync_enabled} className="h-4 w-4 rounded border-slate-300" />
            Enable two-way Google Sheet sync for this project
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
