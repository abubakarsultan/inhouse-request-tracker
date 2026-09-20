import Link from 'next/link';
import { getRequests } from '@/services/requests';
import { getProjects } from '@/services/projects';
import StatusControl from '@/components/app/status-control';
import StatusBadge from '@/components/status-badge';
import RequestActions from '@/components/app/request-actions';
import MemberWorkspaceView from '@/components/app/member-workspace-view';
import { getMemberWorkspace } from '@/services/member-workspace';
import { Plus } from 'lucide-react';
import DeadlineCell from '@/components/deadline-cell';
import { karachiDateString } from '@/lib/date';
import { requireActiveProfile } from '@/lib/auth';

export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string; project?: string }> }) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') {
    const data = await getMemberWorkspace();
    return (
      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-[var(--text)]">My Requests</h1><p className="mt-1 text-sm text-[var(--muted)]">Your new requests and imported Guest Post Anchor history in one place.</p></div><Link href="/requests/new" className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"><Plus size={16} /> New Request</Link></div>
        <MemberWorkspaceView data={data} />
      </div>
    );
  }

  const { status, project } = await searchParams;
  const today = karachiDateString();
  const [rows, projects] = await Promise.all([getRequests({ status, project_id: project }), getProjects()]);

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-[var(--text)]">All Requests</h1><p className="mt-1 text-sm text-[var(--muted)]">Company-wide new requests and imported Guest Post Anchor history.</p></div>
        <Link href="/requests/new" className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"><Plus size={16} /> New Request</Link>
      </div>

      <form className="mb-5 flex flex-wrap gap-3">
        <select name="project" defaultValue={project ?? ''} className="h-10 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"><option value="">All projects</option>{projects.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="status" defaultValue={status ?? ''} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"><option value="">All statuses</option>{['Request shared', 'Live', 'Rejected'].map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <button className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--muted)] hover:bg-[var(--canvas)]">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Project</th><th className="p-3">Approved Site</th><th className="p-3">Anchor</th><th className="p-3">Assign To</th><th className="p-3">Created By</th><th className="p-3">Deadline</th><th className="p-3">Status</th><th className="p-3">Sync</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.id} className="border-t border-[var(--border)]/70 align-top">
                <td className="p-3 font-medium text-[var(--text)]">{row.projects ? <Link href={`/projects/${row.projects.slug}`} className="hover:text-[var(--brand)]">{row.projects.name}</Link> : '—'}{row.source !== 'app' && <span className="ml-2 rounded-full bg-[#e8f0fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#174ea6]">Imported</span>}</td>
                <td className="max-w-52 truncate p-3 text-[var(--muted)]" title={row.approved_site}>{row.approved_site}</td>
                <td className="max-w-52 truncate p-3 text-[var(--muted)]" title={row.anchor}>{row.anchor || '—'}</td>
                <td className="p-3 text-[var(--muted)]">{row.assign_to || 'Unassigned'}</td>
                <td className="max-w-48 truncate p-3 text-xs text-[var(--muted)]" title={row.created_by_email || row.created_by_name || ''}>{row.created_by_email || row.created_by_name || '—'}</td>
                <td className="p-3"><DeadlineCell deadline={row.deadline} status={row.status} today={today} /></td>
                <td className="p-3"><StatusControl id={row.id} status={row.status} syncState={row.sync_state} /></td>
                <td className="p-3">{row.sync_state === 'failed' ? <div><StatusBadge status={row.status} failedSync /><p className="mt-1 max-w-48 text-xs text-[#c5221f]">{row.sync_error || 'Sheet sync failed'}</p></div> : <span className="text-xs text-[var(--muted)]">{row.sync_state === 'synced' ? `${row.team_tab || 'Team sheet'} · row ${row.team_row ?? '—'}` : 'Saved here only'}</span>}</td>
                <td className="p-3"><RequestActions id={row.id} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--muted)]">No requests match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
