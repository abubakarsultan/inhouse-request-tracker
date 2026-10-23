import Link from 'next/link';
import { getProjectsWithCounts, getProjectCategories } from '@/services/projects';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import AdminRecordActions from '@/components/app/admin-record-actions';
import { ArrowRight, Database, Link2, Clock, XCircle, Sheet, ExternalLink } from 'lucide-react';
import { requireActiveProfile } from '@/lib/auth';
import ProjectCategoryManager from '@/components/app/project-category-manager';
import { getServiceAccountEmail } from '@/lib/google-sheet-setup';
import ProjectSheetDetails from '@/components/app/project-sheet-details';
import ProjectSheetRecovery from '@/components/app/project-sheet-recovery';
import { buildProjectTriggerSnippet } from '@/lib/sheet-webhook';
import { headers } from 'next/headers';
import { projectCategorySlug } from '@/lib/project-category-slugs';
import { buildGoogleSheetUrl } from '@/lib/google-sheet-url';

export default async function Projects({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; view?: string }> }) {
  const profile = await requireActiveProfile();
  const isAdmin = profile.role === 'admin';
  const { q, category, view } = await searchParams;
  const showArchived = isAdmin && view === 'archived';
  const [{ projects, statsUnavailable }, categories] = await Promise.all([getProjectsWithCounts(q), getProjectCategories()]);
  const selectableCategories = categories.filter(item => item.active);
  const serviceAccountEmail = getServiceAccountEmail();
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'YOUR-VERCEL-DOMAIN';
  const proto = requestHeaders.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || `${proto}://${host}`;
  const activeCategory = selectableCategories.some(item => item.name === category) ? category! : (selectableCategories.find(item => item.slug === 'inhouse')?.name || selectableCategories[0]?.name || 'Inhouse');
  const selectedCategory = selectableCategories.find(item => item.name === activeCategory);
  const matchesCategory = (project: any, tab: {id: string; slug: string}) => project.category_id === tab.id || projectCategorySlug(project.category || 'Inhouse') === tab.slug;
  const visibleProjects = selectedCategory ? projects.filter((project: any) => matchesCategory(project, selectedCategory) && Boolean(project.active) !== showArchived) : [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Projects are grouped by workflow, with Sheet configuration kept inside each project.</p>
        </div>
        {isAdmin && <ProjectFormDialog serviceAccountEmail={serviceAccountEmail} categories={selectableCategories} />}
      </div>

      {isAdmin && <details className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card)]"><summary className="cursor-pointer p-3 text-sm font-semibold hover:bg-[var(--brand-soft)]">Manage project categories (admin)</summary><div className="p-3"><ProjectCategoryManager categories={categories}/></div></details>}

      {statsUnavailable && (
        <div role="alert" className="mb-5 rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-4 text-sm text-[#785000]">
          <strong>Project statistics temporarily unavailable.</strong> Your projects can still be viewed. Admins can create and edit projects.
          To restore request counts, run <code>database/migrations/008_project_url_speed.sql</code> in the Supabase SQL Editor
          and reload this page. No existing data will be deleted.
        </div>
      )}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {selectableCategories.map(({name: item}) => {
            const categoryRow = selectableCategories.find(entry => entry.name === item)!;
            const count = projects.filter((project: any) => matchesCategory(project, categoryRow) && Boolean(project.active)!==showArchived).length;
            const params = new URLSearchParams(); if (q) params.set('q', q); params.set('category', item);if(showArchived)params.set('view','archived');
            return <Link key={item} href={`/projects?${params.toString()}`} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeCategory === item ? 'bg-[var(--brand)] text-white shadow-sm' : 'border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--canvas)]'}`}>{item} <span className="ml-1 text-xs opacity-80">{count}</span></Link>;
          })}
        </div>
        <form><input type="hidden" name="category" value={activeCategory} />{showArchived&&<input type="hidden" name="view" value="archived"/>}<input name="q" defaultValue={q} placeholder="Search projects…" className="h-10 w-full min-w-72 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" /></form>
      </div>

      {isAdmin && <div className="mb-4 flex items-center gap-2"><Link href={`/projects?category=${encodeURIComponent(activeCategory)}`} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-[var(--brand-soft)] ${!showArchived?'border-[var(--brand)] text-[var(--brand)]':'border-[var(--border)]'}`}>Active projects</Link><Link href={`/projects?category=${encodeURIComponent(activeCategory)}&view=archived`} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-[var(--brand-soft)] ${showArchived?'border-[var(--brand)] text-[var(--brand)]':'border-[var(--border)]'}`}>Archived projects</Link></div>}
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{activeCategory}</h2><span className="text-xs text-[var(--muted)]">{visibleProjects.length} projects</span></div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleProjects.map((project: any) => (
          <article key={project.id} className="flex min-h-64 flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="truncate text-lg font-bold text-[var(--text)]" title={project.name}>{project.name}</h2><p className="mt-1 truncate text-xs text-[var(--muted)]" title={project.guest_post_tab_name || ''}>{project.sheet_source === 'custom_sheet' ? (project.sheet_name || 'Custom Google Sheet') : 'Guest Post Anchor'} · Tab: {project.guest_post_tab_name || 'No tab mapped'}</p></div>
              {isAdmin && <div className="flex shrink-0 items-center gap-1"><ProjectFormDialog project={project} serviceAccountEmail={serviceAccountEmail} categories={selectableCategories} /><AdminRecordActions kind="project" id={project.id} name={project.name} active={project.active} /></div>}
            </div>

            <div className="mt-4 grid grid-cols-4 divide-x divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--canvas)] py-3">
              <div className="min-w-0 px-2 text-center"><Database size={14} className="mx-auto text-[var(--muted)]"/><p className="mt-1 text-xl font-bold text-[var(--text)]">{project.counts.requests ?? '—'}</p><p className="text-[10px] text-[var(--muted)]">Requests</p></div>
              <div className="min-w-0 px-2 text-center"><Link2 size={14} className="mx-auto text-[#188038]"/><p className="mt-1 text-xl font-bold text-[#188038]">{project.counts.live ?? '—'}</p><p className="text-[10px] text-[var(--muted)]">Live</p></div>
              <div className="min-w-0 px-2 text-center"><Clock size={14} className="mx-auto text-[#b06000]"/><p className="mt-1 text-xl font-bold text-[#b06000]">{project.counts.pending ?? '—'}</p><p className="text-[10px] text-[var(--muted)]">Pending</p></div>
              <div className="min-w-0 px-2 text-center"><XCircle size={14} className="mx-auto text-[#c5221f]"/><p className="mt-1 text-xl font-bold text-[#c5221f]">{project.counts.rejected ?? '—'}</p><p className="text-[10px] text-[var(--muted)]">Rejected</p></div>
            </div>

            {(project.sheet_setup_state === 'pending' || project.sheet_setup_state === 'error' || project.tab_setup_state === 'pending' || project.tab_setup_state === 'error') && <div role="status" className={`mt-3 rounded-lg border p-3 text-xs ${project.sheet_setup_state === 'error' ? 'border-[#f2b8b5] bg-[#fce8e6] text-[#b3261e]' : 'border-[#f3dfad] bg-[#fef7e0] text-[#785000]'}`}><strong>Sheet setup {project.sheet_setup_state === 'error' || project.sheet_setup_state === 'pending' ? project.sheet_setup_state : `tab ${project.tab_setup_state}`}</strong>{(project.sheet_setup_error || project.tab_setup_error) && <p className="mt-1">{project.sheet_setup_error || project.tab_setup_error}</p>}</div>}
            <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--canvas)] px-2.5 py-1 font-medium">{project.category || 'Inhouse'}</span><span className="rounded-full bg-[var(--canvas)] px-2.5 py-1 font-medium">{project.sheet_source === 'guest_post_anchor' || project.google_sheet_id ? 'Sheet configured' : 'Sheet not configured'}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${project.sync_enabled ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}><Sheet size={12}/>{project.sync_enabled ? 'Sync enabled' : 'Sync off'}</span>
              <span className={`rounded-full px-2.5 py-1 font-medium ${project.active ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.active ? 'Active' : 'Archived'}</span>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
              <Link href={`/projects/${project.slug}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]" title={`Open ${project.name} project`}>
                Open Project <ArrowRight size={15} />
              </Link>
              {(project.google_sheet_id || (project.sheet_source === 'guest_post_anchor' && process.env.TEAM_SHEET_ID)) ? (
                <a href={buildGoogleSheetUrl(project.google_sheet_id || process.env.TEAM_SHEET_ID!, project.google_sheet_gid)} target="_blank" rel="noopener noreferrer" title={`Open ${project.name} Google Sheet in a new tab`} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text)] transition hover:border-[#7bbd95] hover:bg-[#e6f4ea] hover:text-[#137333] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
                  <Sheet size={15} className="text-[#188038]"/> Open Sheet <ExternalLink size={12}/>
                </a>
              ) : <span className="ml-auto text-xs text-[var(--muted)]" title="No Google Sheet has been connected yet">No Sheet</span>}
              {isAdmin && <>
                <ProjectSheetDetails compact project={project} teamSheetId={process.env.TEAM_SHEET_ID || null} appScript={buildProjectTriggerSnippet(siteUrl, project)} />
                <ProjectSheetRecovery projectId={project.id} hasSheet={Boolean(project.google_sheet_id)} canCreateSheet={project.sheet_source === 'custom_sheet'} setupState={project.sheet_setup_state} tabSetupState={project.tab_setup_state} />
              </>}
            </div>
          </article>
        ))}
      </div>

      {visibleProjects.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center text-[var(--muted)]">No {activeCategory} projects found.</div>}
    </div>
  );
}
