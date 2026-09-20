import Link from 'next/link';
import { getProjects } from '@/services/projects';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import ProjectToggleActive from '@/components/app/project-toggle-active';

export default async function Projects({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const projects = await getProjects(q);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Project records replace the old hard-coded NAME_MAP. The global TEAM_SHEET_ID is used for every project.</p>
        </div>
        <ProjectFormDialog />
      </div>

      <form className="mb-5">
        <input name="q" defaultValue={q} placeholder="Search projects…" className="h-10 w-full max-w-sm rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
      </form>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <tr><th className="p-4">Name</th><th className="p-4">Outreach OS name</th><th className="p-4">Team tab</th><th className="p-4">Sync</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {projects.map((project: any) => (
              <tr key={project.id} className="border-t border-[var(--border)]/70 hover:bg-[var(--canvas)]/60">
                <td className="p-4 font-medium text-[var(--text)]"><Link href={`/projects/${project.slug}`} className="hover:text-[var(--brand)]">{project.name}</Link></td>
                <td className="p-4 text-[var(--muted)]">{project.outreach_project_name || project.name}</td>
                <td className="p-4 text-[var(--muted)]">{project.guest_post_tab_name || '—'}</td>
                <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${project.sync_enabled ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.sync_enabled ? 'On' : 'Off'}</span></td>
                <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${project.active ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.active ? 'Active' : 'Disabled'}</span></td>
                <td className="p-4"><div className="flex justify-end gap-1"><ProjectFormDialog project={project} /><ProjectToggleActive id={project.id} active={project.active} /></div></td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-[var(--muted)]">No projects found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
