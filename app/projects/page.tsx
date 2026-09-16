import Link from 'next/link';
import { getProjects } from '@/services/projects';
import { getCurrentUser } from '@/lib/session';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import ProjectToggleActive from '@/components/app/project-toggle-active';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

export default async function Projects({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [projects, user] = await Promise.all([getProjects(q), getCurrentUser()]);
  const isAdmin = user?.role === 'admin';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        {isAdmin && <ProjectFormDialog />}
      </div>

      <form className="mb-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search projects…"
          className="h-10 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Outreach OS name</th>
              <th className="p-4">Guest Post tab</th>
              <th className="p-4">Sync</th>
              <th className="p-4">Status</th>
              {isAdmin && <th className="p-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {projects.map((p: any) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="p-4 font-medium text-slate-800">
                  <Link href={`/projects/${p.slug}`} className="hover:text-indigo-600">{p.name}</Link>
                </td>
                <td className="p-4 text-slate-500">{p.outreach_project_name || '—'}</td>
                <td className="p-4 text-slate-500">{p.guest_post_tab_name || '—'}</td>
                <td className="p-4">
                  {p.sync_enabled ? <Badge tone="indigo"><RefreshCw size={11} className="mr-1 inline" />On</Badge> : <Badge>Off</Badge>}
                </td>
                <td className="p-4">
                  <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'Active' : 'Disabled'}</Badge>
                </td>
                {isAdmin && (
                  <td className="p-4">
                    <div className="flex justify-end gap-1">
                      <ProjectFormDialog project={p} />
                      <ProjectToggleActive id={p.id} active={p.active} />
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {projects.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">No projects yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
