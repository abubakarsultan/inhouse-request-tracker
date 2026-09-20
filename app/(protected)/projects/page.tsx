import Link from 'next/link';
import { getProjectsWithCounts } from '@/services/projects';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import ProjectToggleActive from '@/components/app/project-toggle-active';
import { ArrowRight, Database, Link2, Clock } from 'lucide-react';
import { requireAdminProfile } from '@/lib/auth';

export default async function Projects({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminProfile();
  const { q } = await searchParams;
  const projects = await getProjectsWithCounts(q);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Each card is a database-backed client mapping to its team-sheet tab.</p>
        </div>
        <ProjectFormDialog />
      </div>

      <form className="mb-5">
        <input name="q" defaultValue={q} placeholder="Search projects…" className="h-10 w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project: any) => (
          <article key={project.id} className="flex min-h-64 flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-[var(--text)]" title={project.name}>{project.name}</h2>
                <p className="mt-1 truncate text-xs text-[var(--muted)]" title={project.guest_post_tab_name || ''}>Team tab: {project.guest_post_tab_name || '—'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1"><ProjectFormDialog project={project} /><ProjectToggleActive id={project.id} active={project.active} /></div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-[var(--canvas)] p-3"><Database size={15} className="text-[var(--brand)]" /><p className="mt-2 text-2xl font-bold">{project.counts.requests}</p><p className="text-[11px] text-[var(--muted)]">Requests</p></div>
              <div className="rounded-xl bg-[#e6f4ea] p-3"><Link2 size={15} className="text-[#188038]" /><p className="mt-2 text-2xl font-bold text-[#188038]">{project.counts.live}</p><p className="text-[11px] text-[#188038]">Live</p></div>
              <div className="rounded-xl bg-[#fef7e0] p-3"><Clock size={15} className="text-[#b06000]" /><p className="mt-2 text-2xl font-bold text-[#b06000]">{project.counts.pending}</p><p className="text-[11px] text-[#b06000]">Pending</p></div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 font-medium ${project.sync_enabled ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.sync_enabled ? 'Sync on' : 'Sync off'}</span>
              <span className={`rounded-full px-2.5 py-1 font-medium ${project.active ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.active ? 'Active' : 'Disabled'}</span>
            </div>

            <div className="mt-auto pt-5">
              <Link href={`/projects/${project.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]">Open <ArrowRight size={15} /></Link>
            </div>
          </article>
        ))}
      </div>

      {projects.length === 0 && <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-[var(--muted)]">No projects found.</div>}
    </div>
  );
}
