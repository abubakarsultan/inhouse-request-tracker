import { getProjectBySlug } from '@/services/projects';
import { getProjectSites } from '@/services/sites';
import StatusBadge from '@/components/status-badge';
import StatusControl from '@/components/app/status-control';
import Link from 'next/link';
import { UploadCloud } from 'lucide-react';

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  const sites = await getProjectSites(project.id);
  const liveCount = sites.filter((site: any) => site.status === 'Live').length;
  const pendingCount = sites.filter((site: any) => site.status === 'Request shared').length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{project.name}</h1>
          <p className="text-sm text-[var(--muted)]">Outreach OS: {project.outreach_project_name || project.name} · Team tab: {project.guest_post_tab_name || '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${project.sync_enabled ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.sync_enabled ? 'Sync on' : 'Sync off'}</span>
          <Link href={`/import?project=${project.id}`} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--canvas)]">
            <UploadCloud size={15} /> Import sites
          </Link>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-white p-4"><p className="text-2xl font-bold">{sites.length}</p><p className="text-xs text-[var(--muted)]">Project rows</p></div>
        <div className="rounded-xl border border-[#c9e7d0] bg-[#e6f4ea] p-4"><p className="text-2xl font-bold text-[#188038]">{liveCount}</p><p className="text-xs text-[#188038]">Live</p></div>
        <div className="rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-4"><p className="text-2xl font-bold text-[#b06000]">{pendingCount}</p><p className="text-xs text-[#b06000]">Request shared</p></div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="p-4">Website</th><th className="p-4">Opportunity</th><th className="p-4">Anchor</th><th className="p-4">DR</th><th className="p-4">Traffic</th><th className="p-4">Status</th><th className="p-4">Note</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site: any) => (
              <tr key={site.id} className="border-t border-[var(--border)]/70">
                <td className="p-4 font-medium text-[var(--text)]">{site.website}</td>
                <td className="p-4 text-[var(--muted)]">{site.opportunity || '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.anchor || '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.dr ?? '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.traffic ?? '—'}</td>
                <td className="p-4">
                  {site.request_id ? <StatusControl id={site.request_id} status={site.status || 'Request shared'} /> : <div><StatusBadge status={site.status || 'Request shared'} /><p className="mt-1 text-[10px] text-[var(--muted)]">Imported / unlinked row</p></div>}
                </td>
                <td className="max-w-xs truncate p-4 text-[var(--muted)]" title={site.note}>{site.note || '—'}</td>
              </tr>
            ))}
            {sites.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-[var(--muted)]">No sites yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
