'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { createRequest } from '@/services/requests';

type Project = { id: string; name: string };
type Assignee = { id: string; name: string | null; email: string };

export default function RequestForm({ projects, users }: { projects: Project[]; users: Assignee[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await createRequest({
        project_id: String(form.get('project_id')),
        sub_project: String(form.get('sub_project') ?? '') || null,
        target_url: String(form.get('target_url') ?? ''),
        anchor: String(form.get('anchor') ?? ''),
        approved_site: String(form.get('approved_site') ?? ''),
        placement_page: String(form.get('placement_page') ?? '') || null,
        priority: (String(form.get('priority') ?? 'Medium') as any),
        assigned_to: String(form.get('assigned_to') ?? '') || null,
        deadline: String(form.get('deadline') ?? '') || null,
        shared_with: String(form.get('shared_with') ?? '') || null,
      });
      setDone(true);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err: any) {
      setError(err?.issues?.[0]?.message ?? err.message ?? 'Could not create request');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="project_id">Client / Project *</Label>
          <Select id="project_id" name="project_id" required defaultValue="">
            <option value="" disabled>Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sub_project">Sub Project</Label>
          <Input id="sub_project" name="sub_project" placeholder="optional" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="target_url">Target URL *</Label>
          <Input id="target_url" name="target_url" type="url" required placeholder="https://client-site.com/page" />
        </div>
        <div>
          <Label htmlFor="anchor">Anchor *</Label>
          <Input id="anchor" name="anchor" required placeholder="anchor text" />
        </div>
        <div>
          <Label htmlFor="approved_site">Approved Site Domain *</Label>
          <Input id="approved_site" name="approved_site" required placeholder="partner-site.com" />
        </div>
        <div>
          <Label htmlFor="placement_page">Placement Page</Label>
          <Input id="placement_page" name="placement_page" placeholder="optional" />
        </div>
        <div>
          <Label htmlFor="shared_with">Shared With</Label>
          <Input id="shared_with" name="shared_with" placeholder="partner contact / email" />
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue="Medium">
            {['Low', 'Medium', 'High', 'Urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="assigned_to">Assign To</Label>
          <Select id="assigned_to" name="assigned_to" defaultValue="">
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="deadline">Deadline</Label>
          <Input id="deadline" name="deadline" type="date" />
        </div>
      </div>
      <p className="text-xs text-slate-400">New requests always start at <b>Request Shared</b> — move them to Live/Removed from the Requests list.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && !error && <p className="text-sm text-emerald-600">Request created.</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create Request'}</Button>
    </form>
  );
}
