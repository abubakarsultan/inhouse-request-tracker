import { getProjectBySlug } from '@/services/projects';
import { getProjectSites, getProjectSiteCounts } from '@/services/sites';
import StatusBadge from '@/components/status-badge';
import StatusControl from '@/components/app/status-control';
import Link from 'next/link';
import { UploadCloud } from 'lucide-react';
import { headers } from 'next/headers';
import ProjectSheetDetails from '@/components/app/project-sheet-details';
import { buildProjectTriggerSnippet } from '@/lib/sheet-webhook';
import { requireActiveProfile } from '@/lib/auth';
import { normalizeColumnMapping, SHEET_DATA_FIELDS } from '@/lib/project-sheet';

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const profile = await requireActiveProfile();
  const isAdmin = profile.role === 'admin';
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Math.min(100000, Number.isSafeInteger(Number(pageParam)) ? Number(pageParam || 1) : 1));
  const project = await getProjectBySlug(slug);
  const [sites, counts] = await Promise.all([getProjectSites(project.id, page), getProjectSiteCounts(project.id)]);
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'YOUR-VERCEL-DOMAIN';
  const proto = requestHeaders.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const siteUrl = `${proto}://${host}`;
  const appScript = buildProjectTriggerSnippet(siteUrl, project);
  const mapping = normalizeColumnMapping(project.column_mapping);


  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{project.name}</h1>
          <p className="text-sm text-[var(--muted)]">{project.category || 'Inhouse'} · Outreach OS: {project.outreach_project_name || project.name} · Tab: {project.guest_post_tab_name || '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${project.sync_enabled ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{project.sync_enabled ? 'Sync on' : 'Sync off'}</span>
          {isAdmin && <><ProjectSheetDetails project={project} teamSheetId={process.env.TEAM_SHEET_ID || null} appScript={appScript} /><Link href={`/import?project=${project.id}`} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--canvas)]"><UploadCloud size={15} /> Import sites</Link></>}
        </div>
      </div>

      {counts.statsUnavailable && (
        <div role="alert" className="mb-5 rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-4 text-sm text-[#785000]">
          Project counts are running in compatibility mode. For faster statistics, run
          <code className="mx-1">database/migrations/008_project_url_speed.sql</code>
          in Supabase SQL Editor. Your existing project rows are unchanged.
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-3 font-semibold">Project Overview & Google Sheet</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-xs text-[var(--muted)]">Category</p><p className="font-medium">{project.category || 'Inhouse'}</p></div>
          <div><p className="text-xs text-[var(--muted)]">Outreach OS</p><p className="font-medium">{project.outreach_project_name || project.name}</p></div>
          <div><p className="text-xs text-[var(--muted)]">Sheet source</p><p className="font-medium">{project.sheet_source === 'guest_post_anchor' ? 'Guest Post Anchor' : project.sheet_name || 'Custom Google Sheet'}</p></div>
          <div><p className="text-xs text-[var(--muted)]">Project / Sheet status</p><p className="font-medium">{project.active ? 'Active' : 'Disabled'} · {project.sync_enabled ? 'Sync enabled' : 'Sync off'}</p><p className="text-xs text-[var(--muted)]">Tab: {project.guest_post_tab_name || 'Unmapped'}</p></div>
        </div>
        <details className="mt-4 border-t border-[var(--border)] pt-3">
          <summary className="cursor-pointer text-sm font-semibold">View Column Mapping ({mapping.length} columns)</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-[var(--muted)]"><th className="p-2">Column</th><th className="p-2">Heading</th><th className="p-2">Data</th></tr></thead><tbody>{mapping.map((item) => <tr key={item.column} className="border-t border-[var(--border)]"><td className="p-2 font-semibold">{item.column}</td><td className="p-2">{item.heading}</td><td className="p-2">{SHEET_DATA_FIELDS.find((option) => option.value === item.field)?.label || item.field}{item.field === 'static' ? `: ${item.static_value || ''}` : ''}</td></tr>)}</tbody></table></div>
        </details>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><p className="text-2xl font-bold">{counts.total ?? '—'}</p><p className="text-xs text-[var(--muted)]">Project rows</p></div>
        <div className="rounded-xl border border-[#c9e7d0] bg-[#e6f4ea] p-4"><p className="text-2xl font-bold text-[#188038]">{counts.live ?? '—'}</p><p className="text-xs text-[#188038]">Live</p></div>
        <div className="rounded-xl border border-[#f3dfad] bg-[#fef7e0] p-4"><p className="text-2xl font-bold text-[#b06000]">{counts.pending ?? '—'}</p><p className="text-xs text-[#b06000]">Request shared</p></div>
        <div className="rounded-xl border border-[#f5b5b1] bg-[#fce8e6] p-4"><p className="text-2xl font-bold text-[#c5221f]">{counts.rejected ?? '—'}</p><p className="text-xs text-[#c5221f]">Rejected</p></div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--muted)]">Showing {sites.length ? (page - 1) * 100 + 1 : 0}–{counts.total == null ? ((page - 1) * 100 + sites.length) : Math.min(page * 100, counts.total)} of {counts.total ?? 'unknown'} project rows</p><div className="flex gap-2">{page > 1 && <Link href={`/projects/${project.slug}?page=${page - 1}`} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">Previous</Link>}{(counts.total == null ? sites.length === 100 : page * 100 < counts.total) && <Link href={`/projects/${project.slug}?page=${page + 1}`} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">Next</Link>}</div></div>

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
                <td className="p-4 font-medium text-[var(--text)]">{site.website}</td>
                <td className="p-4 text-[var(--muted)]">{site.opportunity || '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.anchor || '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.dr ?? '—'}</td>
                <td className="p-4 text-[var(--muted)]">{site.traffic ?? '—'}</td>
                <td className="p-4">
                  {isAdmin && site.request_id ? <StatusControl id={site.request_id} status={site.status || 'Request shared'} /> : <div><StatusBadge status={site.status || 'Request shared'} />{!site.request_id && <p className="mt-1 text-[10px] text-[var(--muted)]">Unlinked row</p>}</div>}
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
