import Link from 'next/link';
import { Suspense } from 'react';
import { requireActiveProfile } from '@/lib/auth';
import { getProjectBySlug, getProjectCounts, getProjectCategories } from '@/services/projects';
import { getProjectSites } from '@/services/sites';
import StatusBadge from '@/components/status-badge';
import StatusControl from '@/components/app/status-control';
<<<<<<< HEAD
import ProjectSheetSettingsDialog from '@/components/app/project-sheet-settings-dialog';
import ProjectFormDialog from '@/components/app/project-form-dialog';
import ProjectToggleActive from '@/components/app/project-toggle-active';
import Pagination from '@/components/app/pagination';
import DeadlineCell from '@/components/deadline-cell';
import { UploadCloud, Search } from 'lucide-react';
import { karachiDateString } from '@/lib/date';

function ProjectLoading() {
  return <div className="space-y-4 animate-pulse"><div className="h-28 rounded-2xl bg-[var(--card)]" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 rounded-xl bg-[var(--card)]" />)}</div><div className="h-[460px] rounded-2xl bg-[var(--card)]" /></div>;
}

function sourceOf(project: any): 'guest_post_anchor' | 'own_sheet' | 'none' {
  const source = String(project.sheet_source ?? '').trim();
  if (source === 'guest_post_anchor' || source === 'own_sheet' || source === 'none') return source;
  if (project.google_sheet_id) return 'own_sheet';
  if (project.guest_post_tab_name) return 'guest_post_anchor';
  return 'none';
}

async function ProjectData({ slug, q, status, page }: { slug: string; q?: string; status?: string; page: number }) {
  const profile = await requireActiveProfile();
  if (profile.role === 'member') { const { redirect } = await import('next/navigation'); redirect('/dashboard'); }
  const project = await getProjectBySlug(slug);
  const [sitePage, counts, categories] = await Promise.all([
    getProjectSites(project.id, { q, status, page, pageSize: 50 }),
    getProjectCounts(project.id),
    getProjectCategories(false),
  ]);
  const today = karachiDateString();
  const source = sourceOf(project);
  const sheetUrl = source === 'guest_post_anchor' && process.env.TEAM_SHEET_ID
    ? `https://docs.google.com/spreadsheets/d/${process.env.TEAM_SHEET_ID}/edit`
    : source === 'own_sheet' && project.google_sheet_id
      ? `https://docs.google.com/spreadsheets/d/${project.google_sheet_id}/edit`
      : null;
  const category = Array.isArray(project.project_categories) ? project.project_categories[0] : project.project_categories;
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (status) query.set('status', status);
  const buildHref = (nextPage: number) => `/projects/${project.slug}?${new URLSearchParams([...query.entries(), ['page', String(nextPage)]])}`;
=======
import Link from 'next/link';
import { UploadCloud } from 'lucide-react';
import { requireActiveProfile } from '@/lib/auth';
import { headers } from 'next/headers';
import { buildOwnSheetTriggerSnippet } from '@/lib/sheet-webhook';
import ClientSheetScript from '@/components/app/client-sheet-script';

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const profile = await requireActiveProfile();
  if (profile.role === 'member') { const { redirect } = await import('next/navigation'); redirect('/dashboard'); }
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  const sites = await getProjectSites(project.id);
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'YOUR-VERCEL-DOMAIN';
  const proto = requestHeaders.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const ownSheetScript = profile.role === 'admin' && project.google_sheet_id && project.sheet_tab_name && process.env.SHEET_WEBHOOK_SECRET
    ? buildOwnSheetTriggerSnippet(`${proto}://${host}`, process.env.SHEET_WEBHOOK_SECRET) : null;
  const ownSheetUrl = project.google_sheet_id ? `https://docs.google.com/spreadsheets/d/${project.google_sheet_id}/edit` : null;
  const liveCount = sites.filter((site: any) => site.status === 'Live').length;
  const pendingCount = sites.filter((site: any) => site.status === 'Request shared').length;
  const rejectedCount = sites.filter((site: any) => site.status === 'Rejected').length;
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Link href="/projects" className="text-xs font-medium text-[var(--brand)] hover:underline">Projects</Link><span className="text-xs text-[var(--muted)]">/</span><span className="text-xs text-[var(--muted)]">{category?.name ?? 'Project'}</span></div>
            <div className="mt-2 flex items-center gap-3"><h1 className="truncate text-2xl font-bold text-[var(--text)]">{project.name}</h1><ProjectToggleActive id={project.id} active={Boolean(project.active)} /></div>
            <p className="mt-1 text-sm text-[var(--muted)]">Outreach OS: {project.outreach_project_name || project.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectSheetSettingsDialog projectId={project.id} projectName={project.name} source={source} tabName={source === 'guest_post_anchor' ? (project.guest_post_tab_name || project.sheet_tab_name) : project.sheet_tab_name} sheetUrl={sheetUrl} canManage={profile.role === 'admin'} />
            {profile.role === 'admin' && <ProjectFormDialog categories={categories as any} project={project as any} trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--canvas)]">Edit Project</button>} />}
            {profile.role === 'admin' && <Link href={`/import?project=${project.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--canvas)]"><UploadCloud size={14} /> Import</Link>}
          </div>
        </div>
<<<<<<< HEAD
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 font-semibold text-[var(--brand-dark)]">{source === 'guest_post_anchor' ? 'Guest Post Anchor' : source === 'own_sheet' ? 'Own Google Sheet' : 'Tool only'}</span>
          {source !== 'none' && <span className="rounded-full bg-[var(--canvas)] px-2.5 py-1 text-[var(--muted)]">Tab: {source === 'guest_post_anchor' ? project.guest_post_tab_name || project.sheet_tab_name || 'Not set' : project.sheet_tab_name || 'Not set'}</span>}
          <span className={`rounded-full px-2.5 py-1 font-semibold ${project.sync_enabled ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.sync_enabled ? 'Sync on' : 'Sync off'}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><p className="text-2xl font-bold text-[var(--text)]">{counts.requests}</p><p className="text-xs text-[var(--muted)]">Requests</p></div>
        <div className="rounded-xl border border-[#c9e7d0] bg-[#e6f4ea] p-4"><p className="text-2xl font-bold text-[#188038]">{counts.live}</p><p className="text-xs text-[#188038]">Live</p></div>
        <div className="rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-4"><p className="text-2xl font-bold text-[#b06000]">{counts.pending}</p><p className="text-xs text-[#b06000]">Pending</p></div>
        <div className="rounded-xl border border-[#f5b5b1] bg-[#fce8e6] p-4"><p className="text-2xl font-bold text-[#c5221f]">{counts.rejected}</p><p className="text-xs text-[#c5221f]">Rejected</p></div>
      </div>

      <form className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_190px_auto]">
          <label className="relative block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input name="q" defaultValue={q ?? ''} placeholder="Search website, opportunity, anchor or note..." className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" /></label>
          <select name="status" defaultValue={status ?? ''} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="">All statuses</option>{['Request shared', 'Live', 'Rejected'].map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button className="h-10 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">Filter</button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3"><p className="text-sm font-semibold text-[var(--text)]">Project rows</p><p className="text-xs text-[var(--muted)]">{sitePage.total.toLocaleString()} total</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">Website</th><th className="p-3">Opportunity</th><th className="p-3">Anchor</th><th className="p-3">DR</th><th className="p-3">Traffic</th><th className="p-3">Status</th><th className="p-3">Owner</th><th className="p-3">Deadline</th></tr></thead>
            <tbody>
              {sitePage.rows.map((site: any) => (
                <tr key={site.id} className="border-t border-[var(--border)]/70 align-top">
                  <td className="max-w-64 p-3 font-medium text-[var(--text)]"><div className="truncate" title={site.website}>{site.website}</div>{site.sheet_flag === 'Removed' && <span className="mt-1 inline-flex rounded-full bg-[#fce8e6] px-2 py-0.5 text-[10px] font-bold text-[#c5221f]">Removed in sheet</span>}</td>
                  <td className="max-w-64 p-3 text-[var(--muted)]"><div className="truncate" title={site.opportunity}>{site.opportunity || '—'}</div></td>
                  <td className="max-w-56 p-3 text-[var(--muted)]"><div className="truncate" title={site.anchor}>{site.anchor || '—'}</div></td>
                  <td className="p-3 text-[var(--muted)]">{site.dr ?? '—'}</td>
                  <td className="p-3 text-[var(--muted)]">{site.traffic ?? '—'}</td>
                  <td className="p-3">{profile.role !== 'viewer' && site.request_id ? <StatusControl id={site.request_id} status={site.status || 'Request shared'} /> : <StatusBadge status={site.status || 'Request shared'} />}</td>
                  <td className="p-3 text-[var(--muted)]">{site.assign_to || site.note || 'Unassigned'}</td>
                  <td className="p-3">{site.request_id ? <DeadlineCell deadline={site.deadline} status={site.status} today={today} /> : '—'}</td>
                </tr>
              ))}
              {sitePage.rows.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-[var(--muted)]">No project rows match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={sitePage.page} totalPages={sitePage.totalPages} buildHref={buildHref} />
=======
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${project.sync_enabled ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.sync_enabled ? 'Sync on' : 'Sync off'}</span>
          {profile.role === 'admin' && <Link href={`/import?project=${project.id}`} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--canvas)]">
            <UploadCloud size={15} /> Import sites
          </Link>}
        </div>
      </div>

      {ownSheetScript && ownSheetUrl && <ClientSheetScript script={ownSheetScript} sheetUrl={ownSheetUrl} tabName={project.sheet_tab_name} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><p className="text-2xl font-bold">{sites.length}</p><p className="text-xs text-[var(--muted)]">Project rows</p></div>
        <div className="rounded-xl border border-[#c9e7d0] bg-[#e6f4ea] p-4"><p className="text-2xl font-bold text-[#188038]">{liveCount}</p><p className="text-xs text-[#188038]">Live</p></div>
        <div className="rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-4"><p className="text-2xl font-bold text-[#b06000]">{pendingCount}</p><p className="text-xs text-[#b06000]">Request shared</p></div>
        <div className="rounded-xl border border-[#f5b5b1] bg-[#fce8e6] p-4"><p className="text-2xl font-bold text-[#c5221f]">{rejectedCount}</p><p className="text-xs text-[#c5221f]">Rejected</p></div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="p-4">Website</th><th className="p-4">Opportunity</th><th className="p-4">Anchor</th><th className="p-4">DR</th><th className="p-4">Traffic</th><th className="p-4">Status</th><th className="p-4">Note</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site: any) => (
              <tr key={site.id} className="border-t border-[var(--border)]/70">
                <td className="p-4 font-medium text-[var(--text)]"><div>{site.website}</div>{(Array.isArray(site.requests) ? site.requests[0]?.sheet_flag : site.requests?.sheet_flag) === 'Removed' && <span className="mt-1 inline-flex rounded-full bg-[#fce8e6] px-2 py-0.5 text-[10px] font-bold text-[#c5221f]">Removed in sheet</span>}</td>
                <td className="p-4 text-[var(--muted)]">{site.opportunity || '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.anchor || '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.dr ?? '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.traffic ?? '—'}</td>
                <td className="p-4">
                  {profile.role !== 'viewer' && site.request_id ? <StatusControl id={site.request_id} status={site.status || 'Request shared'} /> : <div><StatusBadge status={site.status || 'Request shared'} /><p className="mt-1 text-[10px] text-[var(--muted)]">Unlinked row</p></div>}
                </td>
                <td className="max-w-xs truncate p-4 text-[var(--muted)]" title={site.note}>{site.note || '—'}</td>
              </tr>
            ))}
            {sites.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-[var(--muted)]">No sites yet.</td></tr>}
          </tbody>
        </table>
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
      </div>
    </div>
  );
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const { slug } = await params;
  const filters = await searchParams;
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  return <Suspense fallback={<ProjectLoading />}><ProjectData slug={slug} q={filters.q} status={filters.status} page={page} /></Suspense>;
}
