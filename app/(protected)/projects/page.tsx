import Link from 'next/link';
import { getProjectsWithCounts, getProjectCategories } from '@/services/projects';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import ProjectToggleActive from '@/components/app/project-toggle-active';
import ProjectCategoryManager from '@/components/app/project-category-manager';
import { ArrowRight, Database, Link2, Clock, XCircle } from 'lucide-react';
import { requireActiveProfile } from '@/lib/auth';
import { getServiceAccountEmail } from '@/services/google-sheet-sync';

export default async function Projects({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const profile = await requireActiveProfile();
  const { q, category } = await searchParams;
  const serviceAccountEmail = getServiceAccountEmail();
  const [allProjects, categories, allCategories] = await Promise.all([getProjectsWithCounts(q), getProjectCategories(true), getProjectCategories(false)]);
  const projects = category ? allProjects.filter((project: any) => String(project.category_id) === category) : allProjects;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Each card is a database-backed client mapping to its team-sheet tab.</p>
        </div>
        {profile.role === 'admin' && <ProjectFormDialog categories={categories as any} serviceAccountEmail={serviceAccountEmail} />}
      </div>

      {profile.role === 'admin' && <ProjectCategoryManager categories={allCategories as any} />}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/projects" className={`rounded-full border px-3 py-1.5 text-sm ${!category ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-dark)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>All ({allProjects.length})</Link>
        {categories.map((item: any) => <Link key={item.id} href={`/projects?category=${item.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full border px-3 py-1.5 text-sm ${category === item.id ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-dark)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>{item.name} ({allProjects.filter((project: any) => project.category_id === item.id).length})</Link>)}
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
                <p className="mt-1 truncate text-xs text-[var(--muted)]" title={project.guest_post_tab_name || ''}>{project.category?.name || 'Inhouse'} · Sheet tab: {project.sheet_tab_name || project.guest_post_tab_name || '—'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">{profile.role === 'admin' && <><ProjectFormDialog project={project} categories={categories as any} serviceAccountEmail={serviceAccountEmail} /><ProjectToggleActive id={project.id} active={project.active} /></>}</div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-[var(--canvas)] p-3"><Database size={15} className="text-[var(--brand)]" /><p className="mt-2 text-2xl font-bold">{project.counts.requests}</p><p className="text-[11px] text-[var(--muted)]">Requests</p></div>
              <div className="rounded-xl bg-[#e6f4ea] p-3"><Link2 size={15} className="text-[#188038]" /><p className="mt-2 text-2xl font-bold text-[#188038]">{project.counts.live}</p><p className="text-[11px] text-[#188038]">Live</p></div>
              <div className="rounded-xl bg-[#fef7e0] p-3"><Clock size={15} className="text-[#b06000]" /><p className="mt-2 text-2xl font-bold text-[#b06000]">{project.counts.pending}</p><p className="text-[11px] text-[#b06000]">Pending</p></div>
              <div className="rounded-xl bg-[#fce8e6] p-3"><XCircle size={15} className="text-[#c5221f]" /><p className="mt-2 text-2xl font-bold text-[#c5221f]">{project.counts.rejected}</p><p className="text-[11px] text-[#c5221f]">Rejected</p></div>
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
