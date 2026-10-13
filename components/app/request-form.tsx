'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { createRequest, retryRequestSync, type CreateRequestResult } from '@/services/requests';
import { REQUEST_PRIORITIES, REQUEST_STATUSES, looksLikeHttpUrl } from '@/lib/validators';

type Project = { id: string; name: string };
type SiteHint = { loading: boolean; used: boolean; matches: Array<{ status: string; anchor: string; assignTo: string | null }>; error?: string };

type Props = {
  projects: Project[];
  assignToSuggestions: string[];
  sharedWithSuggestions: string[];
  currentUser: { role: 'admin' | 'member'; sheetName: string; email: string };
};

export default function RequestForm({ projects, assignToSuggestions, sharedWithSuggestions, currentUser }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<CreateRequestResult, { saved: true }> | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [approvedSite, setApprovedSite] = useState('');
  const [projectId, setProjectId] = useState('');
  const [siteHint, setSiteHint] = useState<SiteHint | null>(null);
  const currentProjectName = useMemo(() => projects.find((project) => project.id === projectId)?.name ?? '', [projects, projectId]);

  useEffect(() => {
    const value = approvedSite.trim();
    if (!value || !projectId) { setSiteHint(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSiteHint({ loading: true, used: false, matches: [] });
      try {
        const response = await fetch(`/api/site-check?q=${encodeURIComponent(value)}&project=${encodeURIComponent(projectId)}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json() as { ok?: boolean; reason?: string; used?: boolean; matches?: Array<{ status: string; anchor: string; assignTo: string | null }> };
        if (!body.ok) {
          setSiteHint({ loading: false, used: false, matches: [], error: body.reason || 'Could not check this site.' });
          return;
        }
        setSiteHint({ loading: false, used: Boolean(body.used), matches: body.matches ?? [] });
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') setSiteHint({ loading: false, used: false, matches: [], error: 'Site check unavailable.' });
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [approvedSite, projectId]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (siteHint?.used) {
      setError(`This website is already used in ${currentProjectName || 'this project'}. One project can use a website only once.`);
      return;
    }
    setPending(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await createRequest({
        project_id: String(data.get('project_id') ?? ''),
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
        created_by_name: currentUser.sheetName || null,
      });
      setResult(response);
      form.reset();
      setTargetUrl('');
      setApprovedSite('');
      setProjectId('');
      setSiteHint(null);
    } catch (caught) {
      const issue = caught as { issues?: { message?: string }[]; message?: string };
      setError(issue?.issues?.[0]?.message ?? issue?.message ?? 'Could not create request');
    } finally {
      setPending(false);
    }
  }

  async function retrySync() {
    if (!result) return;
    setPending(true);
    try {
      const sync = await retryRequestSync(result.summary.requestId);
      setResult({ ...result, sync });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Retry failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-4xl space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
      {error && <div className="rounded-xl border border-[#f5b5b1] bg-[#fce8e6] p-4 text-sm text-[#c5221f]">{error}</div>}
      {result && (
        <div className={`rounded-xl border p-4 text-sm ${result.sync.state === 'failed' ? 'border-[#f5b5b1] bg-[#fce8e6] text-[#8a1c16]' : result.sync.state === 'skipped' ? 'border-[var(--border)] bg-[var(--canvas)] text-[var(--muted)]' : 'border-[#b7dfbf] bg-[#e6f4ea] text-[#188038]'}`}>
          <p className="font-semibold">Request saved</p>
          <p className="mt-1">{result.sync.text}</p>
          {result.summary.targetUrlWarning && <p className="mt-2 text-[#b06000]">⚠ {result.summary.targetUrlWarning}</p>}
          {result.sync.state === 'failed' && <Button type="button" variant="secondary" className="mt-3" onClick={retrySync} disabled={pending}>Retry sync</Button>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="project_id">Client / Project *</Label>
          <Select id="project_id" name="project_id" required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="" disabled>Select a project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
        </div>
        <div><Label htmlFor="sub_project">Sub Project</Label><Input id="sub_project" name="sub_project" placeholder="optional" /></div>
        <div className="sm:col-span-2">
          <Label htmlFor="target_url">Target URL *</Label>
          <Input id="target_url" name="target_url" required value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://client-site.com/page" />
          {targetUrl && !looksLikeHttpUrl(targetUrl) && <p className="mt-1 text-xs text-[#b06000]">This does not look like a complete http/https URL. You can still save it.</p>}
        </div>
        <div><Label htmlFor="anchor">Anchor *</Label><Input id="anchor" name="anchor" required placeholder="anchor text" /></div>
        <div>
          <Label htmlFor="approved_site">Approved Site Domain *</Label>
          <Input id="approved_site" name="approved_site" required value={approvedSite} onChange={(event) => setApprovedSite(event.target.value)} placeholder="partner-site.com" />
          {!projectId && approvedSite && <p className="mt-1 text-xs text-[var(--muted)]">Select a project to check whether this website is available.</p>}
          {siteHint?.loading && <p className="mt-1 text-xs text-[var(--muted)]">Checking this project…</p>}
          {siteHint && !siteHint.loading && !siteHint.error && siteHint.used && (
            <div className="mt-1 rounded-lg bg-[#fce8e6] px-2.5 py-2 text-xs text-[#c5221f]">
              <strong>Already used in {currentProjectName || 'this project'}.</strong> {siteHint.matches[0]?.assignTo ? `Owner: ${siteHint.matches[0].assignTo}. ` : ''}Status: {siteHint.matches[0]?.status || 'existing'}.
              <div className="mt-1 font-medium">This project cannot use the same website twice.</div>
            </div>
          )}
          {siteHint && !siteHint.loading && !siteHint.error && !siteHint.used && <p className="mt-1 text-xs font-medium text-[#188038]">Available for this project ✓</p>}
          {siteHint?.error && <p className="mt-1 text-xs text-[var(--muted)]">{siteHint.error}</p>}
        </div>
        <div className="sm:col-span-2"><Label htmlFor="placement_page">Placement Page</Label><Input id="placement_page" name="placement_page" placeholder="optional" /></div>
        <div>
          <Label htmlFor="shared_with">Shared With</Label>
          <Input id="shared_with" name="shared_with" list="shared-with-options" placeholder="partner contact / email" />
          <datalist id="shared-with-options">{sharedWithSuggestions.map((value) => <option key={value} value={value} />)}</datalist>
        </div>
        <div>
          <Label htmlFor="assign_to">Assign To</Label>
          {currentUser.role === 'member' ? (
            <><Input id="assign_to" name="assign_to" value={currentUser.sheetName} readOnly /><p className="mt-1 text-xs text-[var(--muted)]">Automatically assigned to your approved Guest Post Anchor name.</p></>
          ) : (
            <Select id="assign_to" name="assign_to" defaultValue={currentUser.sheetName || assignToSuggestions[0] || ''} required>
              <option value="" disabled>Select team member</option>
              {assignToSuggestions.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          )}
        </div>
        <div><Label htmlFor="priority">Priority</Label><Select id="priority" name="priority" defaultValue="Medium">{REQUEST_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</Select></div>
        <div><Label htmlFor="deadline">Deadline</Label><Input id="deadline" name="deadline" type="date" /></div>
        <div><Label htmlFor="status">Status</Label><Select id="status" name="status" defaultValue="Request shared">{REQUEST_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</Select></div>
      </div>
      <Button type="submit" disabled={pending || Boolean(siteHint?.used)}>{pending ? 'Saving…' : siteHint?.used ? 'Website already used' : 'Save Request'}</Button>
    </form>
  );
}
