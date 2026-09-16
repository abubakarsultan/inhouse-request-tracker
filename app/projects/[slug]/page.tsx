import { getProjectBySlug } from '@/services/projects';
import { getProjectSites } from '@/services/sites';
import { Badge } from '@/components/ui/badge';
import SiteStatusSelect from '@/components/app/site-status-select';
import Link from 'next/link';
import { UploadCloud } from 'lucide-react';

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  const sites = await getProjectSites(project.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-400">
            Outreach OS: {project.outreach_project_name || '—'} · Guest Post tab: {project.guest_post_tab_name || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {project.sync_enabled ? <Badge tone="indigo">Sync on</Badge> : <Badge>Sync off</Badge>}
          <Link href={`/import?project=${project.id}`} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <UploadCloud size={15} /> Import sites
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-4">Website</th>
              <th className="p-4">Opportunity</th>
              <th className="p-4">Anchor</th>
              <th className="p-4">DR</th>
              <th className="p-4">Traffic</th>
              <th className="p-4">Status</th>
              <th className="p-4">Note</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s: any) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-4 font-medium text-slate-800">{s.website}</td>
                <td className="p-4 text-slate-500">{s.opportunity || '—'}</td>
                <td className="p-4 text-slate-500">{s.anchor || '—'}</td>
                <td className="p-4 text-slate-500">{s.dr ?? '—'}</td>
                <td className="p-4 text-slate-500">{s.traffic ?? '—'}</td>
                <td className="p-4"><SiteStatusSelect id={s.id} projectId={project.id} status={s.status} /></td>
                <td className="p-4 max-w-xs truncate text-slate-500" title={s.note}>{s.note || '—'}</td>
              </tr>
            ))}
            {sites.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">No sites yet — import a CSV/XLSX to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
