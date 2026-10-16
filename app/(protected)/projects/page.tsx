import Link from 'next/link';
import { getProjectsWithCounts } from '@/services/projects';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import ProjectToggleActive from '@/components/app/project-toggle-active';
import { ArrowRight, Database, Link2, Clock, XCircle, Sheet } from 'lucide-react';
import { requireActiveProfile } from '@/lib/auth';
import { PROJECT_CATEGORIES } from '@/lib/project-sheet';
import { getServiceAccountEmail } from '@/lib/google-sheet-setup';
import ProjectSheetDetails from '@/components/app/project-sheet-details';
import { buildProjectTriggerSnippet } from '@/lib/sheet-webhook';
import { headers } from 'next/headers';

export default async function Projects({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const profile = await requireActiveProfile();
  const isAdmin = profile.role === 'admin';
  const { q, category } = await searchParams;
  const { projects, statsUnavailable } = await getProjectsWithCounts(q);
  const serviceAccountEmail = getServiceAccountEmail();
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'YOUR-VERCEL-DOMAIN';
  const proto = requestHeaders.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const siteUrl = `${proto}://${host}`;
  const activeCategory = PROJECT_CATEGORIES.includes(category as any) ? category! : 'Inhouse';
  const visibleProjects = projects.filter((project: any) => (project.category || 'Inhouse') === activeCategory);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Projects are grouped by workflow, with Sheet configuration kept inside each project.</p>
        </div>
        {isAdmin && <ProjectFormDialog serviceAccountEmail={serviceAccountEmail} />}
      </div>

      {statsUnavailable && (
        <div role="alert" className="mb-5 rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-4 text-sm text-[#785000]">
          <strong>Project statistics temporarily unavailable.</strong> Your projects can still be viewed. Admins can create and edit projects.
          To restore request counts, run <code>database/migrations/008_project_url_speed.sql</code> in the Supabase SQL Editor
          and reload this page. No existing data will be deleted.
        </div>
      )}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {PROJECT_CATEGORIES.map((item) => {
            const count = projects.filter((project: any) => (project.category || 'Inhouse') === item).length;
            const params = new URLSearchParams(); if (q) params.set('q', q); params.set('category', item);
            return <Link key={item} href={`/projects?${params.toString()}`} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeCategory === item ? 'bg-[var(--brand)] text-white shadow-sm' : 'border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--canvas)]'}`}>{item} <span className="ml-1 text-xs opacity-80">{count}</span></Link>;
          })}
        </div>
        <form><input type="hidden" name="category" value={activeCategory} /><input name="q" defaultValue={q} placeholder="Search projects…" className="h-10 w-full min-w-72 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" /></form>
      </div>

      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{activeCategory}</h2><span className="text-xs text-[var(--muted)]">{visibleProjects.length} projects</span></div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleProjects.map((project: any) => (
          <article key={project.id} className="flex min-h-64 flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="truncate text-lg font-bold text-[var(--text)]" title={project.name}>{project.name}</h2><p className="mt-1 truncate text-xs text-[var(--muted)]" title={project.guest_post_tab_name || ''}>{project.sheet_source === 'custom_sheet' ? (project.sheet_name || 'Custom Google Sheet') : 'Guest Post Anchor'} · Tab: {project.guest_post_tab_name || 'No tab mapped'}</p></div>
              {isAdmin && <div className="flex shrink-0 items-center gap-1"><ProjectFormDialog project={project} serviceAccountEmail={serviceAccountEmail} /><ProjectToggleActive id={project.id} active={project.active} /></div>}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-[var(--canvas)] p-3"><Database size={15} className="text-[var(--brand)]" /><p className="mt-2 text-2xl font-bold">{project.counts.requests ?? '—'}</p><p className="text-[11px] text-[var(--muted)]">Requests</p></div>
              <div className="rounded-xl bg-[#e6f4ea] p-3"><Link2 size={15} className="text-[#188038]" /><p className="mt-2 text-2xl font-bold text-[#188038]">{project.counts.live ?? '—'}</p><p className="text-[11px] text-[#188038]">Live</p></div>
              <div className="rounded-xl bg-[#fef7e0] p-3"><Clock size={15} className="text-[#b06000]" /><p className="mt-2 text-2xl font-bold text-[#b06000]">{project.counts.pending ?? '—'}</p><p className="text-[11px] text-[#b06000]">Pending</p></div>
              <div className="rounded-xl bg-[#fce8e6] p-3"><XCircle size={15} className="text-[#c5221f]" /><p className="mt-2 text-2xl font-bold text-[#c5221f]">{project.counts.rejected ?? '—'}</p><p className="text-[11px] text-[#c5221f]">Rejected</p></div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--canvas)] px-2.5 py-1 font-medium">{project.category || 'Inhouse'}</span><span className="rounded-full bg-[var(--canvas)] px-2.5 py-1 font-medium">{project.sheet_source === 'guest_post_anchor' || project.google_sheet_id ? 'Sheet configured' : 'Sheet not configured'}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${project.sync_enabled ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}><Sheet size={12}/>{project.sync_enabled ? 'Sync enabled' : 'Sync off'}</span>
              <span className={`rounded-full px-2.5 py-1 font-medium ${project.active ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.active ? 'Active' : 'Disabled'}</span>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5"><Link href={`/projects/${project.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]">Open Project <ArrowRight size={15} /></Link>{isAdmin && <ProjectSheetDetails compact project={project} teamSheetId={process.env.TEAM_SHEET_ID || null} appScript={buildProjectTriggerSnippet(siteUrl, project)} />}</div>
          </article>
        ))}
      </div>

      {visibleProjects.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center text-[var(--muted)]">No {activeCategory} projects found.</div>}
    </div>
  );
}
