'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FolderKanban, Link2, Search, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import ProjectToggleActive from '@/components/app/project-toggle-active';
import { Button } from '@/components/ui/button';

type Category = { id: string; name: string; slug: string; sheet_mode: 'team_sheet_tab' | 'own_sheet'; active: boolean };
type Project = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  category_id: string;
  category: Category | null;
  sheet_source?: 'guest_post_anchor' | 'own_sheet' | 'none' | null;
  guest_post_tab_name?: string | null;
  sheet_tab_name?: string | null;
  google_sheet_id?: string | null;
  sync_enabled: boolean;
  outreach_project_name?: string | null;
  counts: { requests: number; live: number; pending: number; rejected: number };
};

const categoryOrder = ['inhouse', 'client', 'onpage', 'others'];
const categoryDescriptions: Record<string, string> = {
  inhouse: 'Projects that use the central Guest Post Anchor workflow.',
  client: 'Client-specific projects and their own tracking sheets.',
  onpage: 'On-page and website optimization projects.',
  others: 'Projects that do not fit the other categories.',
};

function sheetLabel(project: Project) {
  if (project.sheet_source === 'guest_post_anchor') return `Guest Post Anchor${project.guest_post_tab_name ? ` · ${project.guest_post_tab_name}` : ''}`;
  if (project.sheet_source === 'own_sheet') return `Own Google Sheet${project.sheet_tab_name ? ` · ${project.sheet_tab_name}` : ''}`;
  return 'Tool only';
}

export default function ProjectsBrowser({ projects, categories }: { projects: Project[]; categories: Category[] }) {
  const router = useRouter();
  const [category, setCategory] = useState('inhouse');
  const [query, setQuery] = useState('');

  const orderedCategories = useMemo(() => categoryOrder
    .map((slug) => categories.find((item) => item.slug === slug))
    .filter(Boolean) as Category[], [categories]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (category && project.category?.slug !== category) return false;
      if (!normalized) return true;
      return [project.name, project.outreach_project_name, project.guest_post_tab_name, project.sheet_tab_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [projects, category, query]);

  function categoryCount(slug: string) {
    return projects.filter((project) => project.category?.slug === slug).length;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-dark)]"><Search size={18} /></div>
          <div className="min-w-0 flex-1">
            <label htmlFor="project-search" className="sr-only">Search projects</label>
            <input id="project-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, Outreach OS names or sheet tabs..." className="h-10 w-full border-0 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[#9aa0a6]" />
          </div>
        </div>
        <ProjectFormDialog categories={orderedCategories} onSaved={() => router.refresh()} />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 sm:grid-cols-4">
        {orderedCategories.map((item) => {
          const active = category === item.slug;
          return (
            <button key={item.id} type="button" onClick={() => setCategory(item.slug)} className={`rounded-xl px-3 py-3 text-left transition ${active ? 'bg-[var(--brand-soft)] text-[var(--brand-dark)] shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--canvas)]'}`}>
              <span className="block text-sm font-semibold">{item.name}</span>
              <span className="mt-0.5 block text-xs opacity-80">{categoryCount(item.slug)} project{categoryCount(item.slug) === 1 ? '' : 's'}</span>
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">{orderedCategories.find((item) => item.slug === category)?.name ?? 'Projects'}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{categoryDescriptions[category] ?? 'Manage projects and their request sources.'}</p>
          </div>
          <p className="text-xs text-[var(--muted)]">Showing {visibleProjects.length} of {categoryCount(category)}</p>
        </div>

        {visibleProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
            <FolderKanban className="mx-auto text-[var(--muted)]" size={28} />
            <p className="mt-3 font-semibold text-[var(--text)]">No projects found</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Try another search or create a new project.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {visibleProjects.map((project) => (
              <article key={project.id} className={`group rounded-2xl border bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${project.active ? 'border-[var(--border)]' : 'border-[#f0c36d] opacity-80'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-dark)]"><FolderKanban size={17} /></span>
                      <h3 className="truncate font-bold text-[var(--text)]" title={project.name}>{project.name}</h3>
                    </div>
                    <p className="mt-2 truncate text-xs text-[var(--muted)]" title={project.outreach_project_name ?? project.name}>Outreach OS: {project.outreach_project_name ?? project.name}</p>
                  </div>
                  <ProjectToggleActive id={project.id} active={project.active} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-[var(--canvas)] p-3"><p className="text-xl font-bold text-[var(--text)]">{project.counts.requests}</p><p className="text-[11px] text-[var(--muted)]">Requests</p></div>
                  <div className="rounded-xl bg-[#e6f4ea] p-3"><p className="text-xl font-bold text-[#188038]">{project.counts.live}</p><p className="text-[11px] text-[#188038]">Live</p></div>
                  <div className="rounded-xl bg-[#fef7e0] p-3"><p className="text-xl font-bold text-[#b06000]">{project.counts.pending}</p><p className="text-[11px] text-[#b06000]">Pending</p></div>
                </div>

                <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg bg-[var(--canvas)] px-3 py-2 text-xs text-[var(--muted)]">
                  <Link2 size={14} className="shrink-0 text-[var(--brand)]" />
                  <span className="truncate" title={sheetLabel(project)}>{sheetLabel(project)}</span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
                  <ProjectFormDialog
                    categories={orderedCategories}
                    project={project}
                    trigger={<Button type="button" variant="ghost" size="sm"><Settings2 size={14} /> Edit</Button>}
                    onSaved={() => router.refresh()}
                  />
                  <Link href={`/projects/${project.slug}`} className="inline-flex items-center rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--brand-dark)]">Open project <span className="ml-1">→</span></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
