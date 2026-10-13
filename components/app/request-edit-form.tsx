'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { REQUEST_PRIORITIES, REQUEST_STATUSES } from '@/lib/validators';
import { updateRequest } from '@/services/requests';

type RequestData = {
  id: string; project_id: string; sub_project: string | null; target_url: string; anchor: string; approved_site: string;
  placement_page: string | null; shared_with: string | null; priority: string; assign_to: string | null; deadline: string | null; status: string;
  source?: string; projects?: { name?: string } | { name?: string }[] | null;
};

export default function RequestEditForm({ request, assignToSuggestions, currentUser }: { request: RequestData; assignToSuggestions: string[]; currentUser: { role: 'admin' | 'member'; sheetName: string } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [site, setSite] = useState(request.approved_site);
  const [siteHint, setSiteHint] = useState<{ loading: boolean; used: boolean; detail?: string; error?: string } | null>(null);
  const projectName = Array.isArray(request.projects) ? request.projects[0]?.name : request.projects?.name;

  useEffect(() => {
    const value = site.trim();
    if (!value) { setSiteHint(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSiteHint({ loading: true, used: false });
      try {
        const response = await fetch(`/api/site-check?q=${encodeURIComponent(value)}&project=${encodeURIComponent(request.project_id)}&exclude=${encodeURIComponent(request.id)}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json() as { ok?: boolean; used?: boolean; reason?: string; matches?: Array<{ status: string; assignTo: string | null }> };
        if (!body.ok) return setSiteHint({ loading: false, used: false, error: body.reason || 'Check failed.' });
        setSiteHint({ loading: false, used: Boolean(body.used), detail: body.matches?.[0] ? `${body.matches[0].assignTo || 'Existing owner'} · ${body.matches[0].status}` : undefined });
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') setSiteHint({ loading: false, used: false, error: 'Site check unavailable.' });
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [site, request.id, request.project_id]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (siteHint?.used) { setError('This website is already used by another request in this project.'); return; }
    const data = new FormData(event.currentTarget);
    setError(null); setSuccess(null);
    startTransition(async () => {
      try {
        const result = await updateRequest(request.id, {
          project_id: request.project_id,
          sub_project: String(data.get('sub_project') ?? '') || null,
          target_url: String(data.get('target_url') ?? ''),
          anchor: String(data.get('anchor') ?? ''),
          approved_site: String(data.get('approved_site') ?? ''),
          placement_page: String(data.get('placement_page') ?? '') || null,
          shared_with: String(data.get('shared_with') ?? '') || null,
          priority: String(data.get('priority') ?? 'Medium') as any,
          assign_to: String(data.get('assign_to') ?? '') || null,
          deadline: String(data.get('deadline') ?? '') || null,
          status: String(data.get('status') ?? 'Request shared') as any,
        });
        setSuccess(result.sync.text || 'Request updated.');
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update request.');
      }
    });
  }

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
      {error && <div className="rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</div>}
      {success && <div className="rounded-xl bg-[#e6f4ea] p-3 text-sm text-[#188038]">{success}</div>}
      <div className="rounded-xl bg-[var(--canvas)] p-3 text-sm"><strong>Project:</strong> {projectName || '—'} <span className="text-xs text-[var(--muted)]">(locked after creation to keep Sheet row mapping safe)</span></div>
      {request.source === 'team_sheet' && !request.target_url && <div className="rounded-xl bg-[#e8f0fe] p-3 text-xs text-[#174ea6]">Imported from Guest Post Anchor. The old sheet did not contain a Target URL, so you can add it now if known.</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="sub_project">Sub Project</Label><Input id="sub_project" name="sub_project" defaultValue={request.sub_project || ''} /></div>
        <div><Label htmlFor="target_url">Target URL</Label><Input id="target_url" name="target_url" defaultValue={request.target_url || ''} placeholder={request.source === 'team_sheet' ? 'Not available from old sheet' : 'https://...'} /></div>
        <div><Label htmlFor="anchor">Anchor *</Label><Input id="anchor" name="anchor" required defaultValue={request.anchor} /></div>
        <div>
          <Label htmlFor="approved_site">Approved Site Domain *</Label>
          <Input id="approved_site" name="approved_site" required value={site} onChange={(event) => setSite(event.target.value)} />
          {siteHint?.loading && <p className="mt-1 text-xs text-[var(--muted)]">Checking this project…</p>}
          {siteHint && !siteHint.loading && siteHint.used && <p className="mt-1 text-xs font-medium text-[#c5221f]">Already used by another request in this project{siteHint.detail ? `: ${siteHint.detail}` : ''}.</p>}
          {siteHint && !siteHint.loading && !siteHint.used && !siteHint.error && <p className="mt-1 text-xs text-[#188038]">Available for this project ✓</p>}
        </div>
        <div><Label htmlFor="placement_page">Placement Page</Label><Input id="placement_page" name="placement_page" defaultValue={request.placement_page || ''} /></div>
        <div><Label htmlFor="shared_with">Shared With</Label><Input id="shared_with" name="shared_with" defaultValue={request.shared_with || ''} /></div>
        <div>
          <Label htmlFor="assign_to">Assign To</Label>
          {currentUser.role === 'member' ? <Input id="assign_to" name="assign_to" readOnly value={currentUser.sheetName} /> : <Select id="assign_to" name="assign_to" defaultValue={request.assign_to || currentUser.sheetName} required>{assignToSuggestions.map((value) => <option key={value} value={value}>{value}</option>)}</Select>}
        </div>
        <div><Label htmlFor="priority">Priority</Label><Select id="priority" name="priority" defaultValue={request.priority}>{REQUEST_PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div>
        <div><Label htmlFor="deadline">Deadline</Label><Input id="deadline" name="deadline" type="date" defaultValue={request.deadline ? String(request.deadline).slice(0, 10) : ''} /></div>
        <div><Label htmlFor="status">Status</Label><Select id="status" name="status" defaultValue={request.status}>{REQUEST_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div>
      </div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || Boolean(siteHint?.used)}>{pending ? 'Saving…' : 'Save Changes'}</Button><Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button></div>
    </form>
  );
}
