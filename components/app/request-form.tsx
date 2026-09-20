'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { createRequest, getDistinctAssignToValues, getDistinctSharedWithValues } from '@/services/requests';
import { useWhoAmI } from '@/lib/use-who-am-i';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '@/lib/validators';

type Project = { id: string; name: string };

export default function RequestForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const { name, setName } = useWhoAmI();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ client: string; date: string } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [assignToOptions, setAssignToOptions] = useState<string[]>([]);
  const [sharedWithOptions, setSharedWithOptions] = useState<string[]>([]);

  useEffect(() => {
    getDistinctAssignToValues().then(setAssignToOptions).catch(() => {});
    getDistinctSharedWithValues().then(setSharedWithOptions).catch(() => {});
  }, []);

  function buildInput(form: FormData, force: boolean) {
    return {
      project_id: String(form.get('project_id')),
      sub_project: String(form.get('sub_project') ?? '') || null,
      target_url: String(form.get('target_url') ?? ''),
      anchor: String(form.get('anchor') ?? ''),
      approved_site: String(form.get('approved_site') ?? ''),
      placement_page: String(form.get('placement_page') ?? '') || null,
      shared_with: String(form.get('shared_with') ?? '') || null,
      priority: String(form.get('priority') ?? 'Medium') as any,
      assign_to: String(form.get('assign_to') ?? '') || null,
      deadline: String(form.get('deadline') ?? '') || null,
      status: String(form.get('status') ?? 'Request shared') as any,
      created_by_name: name || null,
      force,
    };
  }

  async function submit(input: ReturnType<typeof buildInput>) {
    const result = await createRequest(input);
    setDone(result.sync.text);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setDuplicate(null);
    const form = new FormData(e.currentTarget);
    try {
      await submit(buildInput(form, false));
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err: any) {
      if (err?.code === 'DUPLICATE' && err?.duplicate) {
        setDuplicate({ client: err.duplicate.client, date: new Date(err.duplicate.date).toLocaleDateString() });
        setPendingFormData(form);
      } else {
        setError(err?.issues?.[0]?.message ?? err.message ?? 'Could not create request');
      }
    } finally {
      setPending(false);
    }
  }

  async function saveAnyway() {
    if (!pendingFormData) return;
    setPending(true);
    setError(null);
    try {
      await submit(buildInput(pendingFormData, true));
      setDuplicate(null);
      setPendingFormData(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Could not create request');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div>
        <Label htmlFor="who">Your name</Label>
        <Input id="who" value={name} onChange={(e) => setName(e.target.value)} placeholder="so we know who created this" />
      </div>

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
          <Input id="target_url" name="target_url" required placeholder="https://client-site.com/page" />
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
          <Label htmlFor="shared_with">Shared With (Contact Person)</Label>
          <Input id="shared_with" name="shared_with" list="shared-with-list" placeholder="partner contact / email" />
          <datalist id="shared-with-list">
            {sharedWithOptions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue="Medium">
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="assign_to">Assign To</Label>
          <Input id="assign_to" name="assign_to" list="assign-to-list" placeholder="type a name" />
          <datalist id="assign-to-list">
            {assignToOptions.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
        <div>
          <Label htmlFor="deadline">Deadline</Label>
          <Input id="deadline" name="deadline" type="date" />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue="Request shared">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      </div>

      {duplicate && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p>This approved site + anchor is already used — first added for <b>{duplicate.client}</b> on {duplicate.date}.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" onClick={saveAnyway} disabled={pending}>{pending ? 'Saving…' : 'Save anyway'}</Button>
            <button type="button" onClick={() => { setDuplicate(null); setPendingFormData(null); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && !error && !duplicate && <p className="text-sm text-emerald-600">{done}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create Request'}</Button>
    </form>
  );
}
