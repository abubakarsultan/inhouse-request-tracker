import Link from 'next/link';
import { getRequests } from '@/services/requests';
import { getProjects } from '@/services/projects';
import StatusControl from '@/components/app/status-control';
import StatusBadge from '@/components/status-badge';
import RequestActions from '@/components/app/request-actions';
import { Plus } from 'lucide-react';
import { redirect } from 'next/navigation';
import DeadlineCell from '@/components/deadline-cell';
import { karachiDateString } from '@/lib/date';
import { requireActiveProfile } from '@/lib/auth';
import { BulkRequestPanel, VerifyRequestButton } from '@/components/app/operations-actions';
import {getRequestLinkChecks} from '@/services/operations';
import { getMissingRequestFields } from '@/lib/request-completeness';

export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string; project?: string; page?: string; incomplete?: string }> }) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') redirect('/my-requests');

  const { status, project, page: pageParam, incomplete } = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.isSafeInteger(Number(pageParam)) ? Number(pageParam || 1) : 1));
  const pageUrl = (target: number) => { const params = new URLSearchParams(); if (status) params.set('status', status); if (project) params.set('project', project); if (incomplete === '1') params.set('incomplete','1'); params.set('page', String(target)); return `/requests?${params.toString()}`; };
  const today = karachiDateString();
  const [{ rows, total }, projects] = await Promise.all([getRequests({ status, project_id: project, incomplete: incomplete === '1' }, page), getProjects()]);
  const checks = await getRequestLinkChecks(rows.map(row=>row.id));
  const checkMap=new Map(checks.map(row=>[row.request_id,row]));

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-[var(--text)]">All Requests</h1><p className="mt-1 text-sm text-[var(--muted)]">Company-wide new requests and imported Guest Post Anchor history.</p></div>
        <Link href="/requests/new" className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"><Plus size={16} /> New Request</Link>
      </div>

      <form className="mb-5 flex flex-wrap gap-3"><label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm"><input type="checkbox" name="incomplete" value="1" defaultChecked={incomplete === '1'} /> Incomplete only</label>
        <select name="project" defaultValue={project ?? ''} className="h-10 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"><option value="">All projects</option>{projects.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="status" defaultValue={status ?? ''} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"><option value="">All statuses</option>{['Request shared', 'Live', 'Rejected'].map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <button className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--muted)] hover:bg-[var(--canvas)]">Filter</button>
      </form>

      <BulkRequestPanel rows={rows.map(r=>({id:r.id,approved_site:r.approved_site,status:r.status}))}/>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--muted)]">Showing {rows.length ? (page - 1) * 50 + 1 : 0}–{Math.min(page * 50, total)} of {total} requests</p><div className="flex gap-2">{page > 1 && <Link href={pageUrl(page - 1)} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">Previous</Link>}{page * 50 < total && <Link href={pageUrl(page + 1)} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">Next</Link>}</div></div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Project</th><th className="p-3">Approved Site</th><th className="p-3">Anchor</th><th className="p-3">Assign To</th><th className="p-3">Created By</th><th className="p-3">Deadline</th><th className="p-3">Status / completeness</th><th className="p-3">Sync</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.id} className="border-t border-[var(--border)]/70 align-top">
                <td className="p-3 font-medium text-[var(--text)]">{row.projects ? <Link href={`/projects/${row.projects.slug}`} className="hover:text-[var(--brand)]">{row.projects.name}</Link> : '—'}{row.source !== 'app' && <span className="ml-2 rounded-full bg-[#e8f0fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#174ea6]">Imported</span>}</td>
                <td className="max-w-52 truncate p-3 text-[var(--muted)]" title={row.approved_site}>{row.approved_site}</td>
                <td className="max-w-52 truncate p-3 text-[var(--muted)]" title={row.anchor}>{row.anchor || '—'}</td>
                <td className="p-3 text-[var(--muted)]">{row.assign_to || 'Unassigned'}</td>
                <td className="max-w-48 truncate p-3 text-xs text-[var(--muted)]" title={row.created_by_email || row.created_by_name || ''}>{row.created_by_email || row.created_by_name || '—'}</td>
                <td className="p-3"><DeadlineCell deadline={row.deadline} status={row.status} today={today} /></td>
                <td className="p-3"><div className="flex flex-wrap gap-1.5"><StatusControl id={row.id} status={row.status} syncState={row.sync_state} />{row.sheet_flag === 'Removed' && <span title="Google Sheet status is Removed; the app status is preserved." className="rounded-full bg-[#fce8e6] px-2 py-1 text-[10px] font-bold text-[#b3261e]">Removed in sheet</span>}{getMissingRequestFields(row,row.projects).length>0&&<span title={`Missing: ${getMissingRequestFields(row,row.projects).join(', ')}`} className="rounded-full bg-[#fef7e0] px-2 py-1 text-[10px] font-bold text-[#8a6200]">Incomplete</span>}</div></td>
                <td className="p-3">{row.sync_state === 'failed' ? <div><StatusBadge status={row.status} failedSync /><p className="mt-1 max-w-48 text-xs text-[#c5221f]">{row.sync_error || 'Sheet sync failed'}</p></div> : <span className="text-xs text-[var(--muted)]">{row.sync_state === 'synced' ? `${row.team_tab || 'Team sheet'} · row ${row.team_row ?? '—'}` : 'Saved here only'}</span>}</td>
                <td className="p-3"><RequestActions id={row.id} syncState={row.sync_state} />{row.status === 'Live' && <div className="mt-2"><span title={checkMap.get(row.id)?.detail||'Not yet checked'} className="text-[10px] text-[var(--muted)]">Link check: {checkMap.get(row.id)?.result||'not checked'}</span><VerifyRequestButton id={row.id}/></div>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--muted)]">No requests match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
