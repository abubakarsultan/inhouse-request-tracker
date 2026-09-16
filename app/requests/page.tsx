import Link from 'next/link';
import { getRequests } from '@/services/requests';
import { getProjects } from '@/services/projects';
import StatusControl from '@/components/app/status-control';
import { Plus } from 'lucide-react';

export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string; project?: string }> }) {
  const { status, project } = await searchParams;
  const [rows, projects] = await Promise.all([
    getRequests({ status, project_id: project }),
    getProjects(),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Requests</h1>
        <Link href="/requests/new" className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus size={16} /> New Request
        </Link>
      </div>

      <form className="mb-5 flex flex-wrap gap-3">
        <select name="project" defaultValue={project ?? ''} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">All projects</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ''} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">All statuses</option>
          {['Request Shared', 'Live', 'Removed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">Filter</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-4">Project</th>
              <th className="p-4">Approved Site</th>
              <th className="p-4">Anchor</th>
              <th className="p-4">Priority</th>
              <th className="p-4">Assigned To</th>
              <th className="p-4">Deadline</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-4 font-medium text-slate-800">
                  {r.projects ? <Link href={`/projects/${r.projects.slug}`} className="hover:text-indigo-600">{r.projects.name}</Link> : '—'}
                </td>
                <td className="p-4 text-slate-500">{r.approved_site}</td>
                <td className="p-4 text-slate-500">{r.anchor}</td>
                <td className="p-4 text-slate-500">{r.priority}</td>
                <td className="p-4 text-slate-500">{r.assignee?.name ?? r.assignee?.email ?? 'Unassigned'}</td>
                <td className="p-4 text-slate-500">{r.deadline ?? '—'}</td>
                <td className="p-4"><StatusControl id={r.id} status={r.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">No requests match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
