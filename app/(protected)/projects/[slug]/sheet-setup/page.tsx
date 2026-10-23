import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, ExternalLink, FileCode2, Sheet } from 'lucide-react';
import { requireActiveProfile } from '@/lib/auth';
import { getProjectBySlug } from '@/services/projects';
import { buildGoogleSheetUrl } from '@/lib/google-sheet-url';
import { buildProjectTriggerSnippet } from '@/lib/sheet-webhook';
import { getServiceAccountEmail } from '@/lib/google-sheet-setup';
import ProjectSheetSetupInstructions from '@/components/app/project-sheet-setup-instructions';
import ProjectSheetRecovery from '@/components/app/project-sheet-recovery';

export default async function ProjectSheetSetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const profile = await requireActiveProfile();
  // Generated webhook code and integration setup details are admin-only.
  if (profile.role !== 'admin') redirect('/projects');
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  const sharedWorkbook = project.sheet_source === 'guest_post_anchor';
  const sheetId: string | null = project.google_sheet_id || (sharedWorkbook ? process.env.TEAM_SHEET_ID || null : null);
  const sheetUrl = sheetId ? buildGoogleSheetUrl(sheetId, project.google_sheet_gid) : null;
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'YOUR-VERCEL-DOMAIN';
  const proto = requestHeaders.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || `${proto}://${host}`;
  const script = sharedWorkbook ? null : buildProjectTriggerSnippet(siteOrigin, project);
  const creationError = project.sheet_setup_state === 'error' || project.tab_setup_state === 'error';
  const creationPending = project.sheet_setup_state === 'pending' || project.tab_setup_state === 'pending';
  const accessVerified = !sharedWorkbook && project.sheet_setup_state === 'connected';

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-12">
      <Link href="/projects" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] transition hover:bg-[var(--brand-soft)] hover:text-[var(--brand-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"><ArrowLeft size={15} /> Back to Projects</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#e6f4ea] px-3 py-1 text-xs font-semibold text-[#137333]"><CheckCircle2 size={14} /> Project saved</div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Google Sheet Setup</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Finish the Google Sheet connection for <strong>{project.name}</strong>. Follow the instructions below.</p>
        </div>
        <Link href={`/projects/${project.slug}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium transition hover:bg-[var(--canvas)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]">Open Project <ArrowRight size={15}/></Link>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#e6f4ea] p-3 text-[#137333]"><Sheet size={23}/></div>
            <div><h2 className="font-semibold">{project.sheet_name || (sharedWorkbook ? 'Guest Post Anchor' : project.name)}</h2><p className="text-xs text-[var(--muted)]">Tab: {project.guest_post_tab_name || 'Not configured'}</p></div>
          </div>
          {sheetUrl ? <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]" title="Open Google Sheet in a new tab"><ExternalLink size={16}/> Open Google Sheet</a> : <span className="rounded-lg bg-[#fef7e0] px-3 py-2 text-xs font-medium text-[#785000]">No Sheet link available</span>}
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--canvas)] p-3"><CheckCircle2 size={17} className="text-[#137333]"/><span>Project record saved</span></div>
          <div className="flex items-center gap-2 rounded-lg bg-[var(--canvas)] p-3">{sheetUrl ? <CheckCircle2 size={17} className="text-[#137333]"/> : <Clock3 size={17} className="text-[#b06000]"/>}<span>{sheetUrl ? 'Sheet link available' : 'Sheet connection pending'}</span></div>
          <div className="flex items-center gap-2 rounded-lg bg-[var(--canvas)] p-3">{sharedWorkbook ? <CheckCircle2 size={17} className="text-[#137333]"/> : <Clock3 size={17} className="text-[#b06000]"/>}<span>{sharedWorkbook ? 'Shared trigger workflow' : 'Manual edit-trigger setup'}</span></div>
        </div>
        {accessVerified && <p className="mt-3 text-xs text-[#137333]">Service account Editor access was verified during Sheet setup. This does not verify the edit trigger.</p>}
        {creationPending && <p role="status" className="mt-3 rounded-lg bg-[#fef7e0] p-3 text-sm text-[#785000]">The spreadsheet setup is still pending. Use Retry setup if needed before testing sync.</p>}
        {creationError && <p role="alert" className="mt-3 rounded-lg bg-[#fce8e6] p-3 text-sm text-[#b3261e]">Sheet setup reported an error: {project.sheet_setup_error || project.tab_setup_error || 'Check the configuration and retry.'}</p>}
        {(creationError || creationPending || !sheetUrl) && <div className="mt-3"><ProjectSheetRecovery projectId={project.id} hasSheet={Boolean(project.google_sheet_id)} canCreateSheet={!sharedWorkbook} setupState={project.sheet_setup_state} tabSetupState={project.tab_setup_state}/></div>}
      </section>

      {sharedWorkbook ? (
        <section className="rounded-2xl border border-[#f3dfad] bg-[#fef7e0] p-5">
          <div className="flex items-center gap-2"><CheckCircle2 size={19} className="text-[#785000]"/><h2 className="font-semibold text-[#785000]">Shared Guest Post Anchor workflow</h2></div>
          <p className="mt-2 text-sm text-[#785000]">This project uses the existing Guest Post Anchor workbook. Its workbook-level Apps Script should handle the project's tab. <strong>Do not install a second project-specific trigger</strong>—it can create duplicate status updates.</p>
          <p className="mt-2 text-sm text-[#785000]">Open the Sheet and confirm that the new tab is present. Ask your administrator to verify the existing workbook trigger if status changes do not appear in the app.</p>
        </section>
      ) : (
        <ProjectSheetSetupInstructions appScript={script || ''} sheetUrl={sheetUrl} serviceAccountEmail={getServiceAccountEmail()} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><FileCode2 size={16}/> You can reopen Sheet Details from your project at any time.</div>
        <Link href={`/projects/${project.slug}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]">Go to Project <ArrowRight size={15}/></Link>
      </div>
    </div>
  );
}
