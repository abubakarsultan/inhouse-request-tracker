import Link from 'next/link';
import RelinkHealthButton from '@/components/app/relink-health-button';
import { runHealthCheck } from '@/services/health';
import { formatKarachiDateTime } from '@/lib/date';
import { requireAdminProfile } from '@/lib/auth';

export default async function HealthPage() {
  await requireAdminProfile();
  let result;
  try {
    result = await runHealthCheck();
  } catch (caught) {
    return (
      <div className="space-y-4">
        <div><h1 className="text-2xl font-bold text-[var(--text)]">Health Check</h1><p className="mt-1 text-sm text-[var(--muted)]">Read-only request-to-sheet linkage scan.</p></div>
        <div className="rounded-2xl border border-[#f4b7b2] bg-[var(--card)] p-5 text-sm text-[#c5221f]">{caught instanceof Error ? caught.message : 'Health check failed.'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Health Check</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Scans stored team rows and project-site linkage. Nothing is auto-fixed.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"><p className="text-3xl font-bold text-[var(--text)]">{result.requestsChecked}</p><p className="text-sm text-[var(--muted)]">Requests checked</p></div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"><p className={`text-3xl font-bold ${result.problems.length ? 'text-[#c5221f]' : 'text-[#188038]'}`}>{result.problems.length}</p><p className="text-sm text-[var(--muted)]">Problems</p></div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"><p className="text-sm font-semibold text-[var(--text)]">Checked at</p><p className="mt-2 text-sm text-[var(--muted)]">{formatKarachiDateTime(result.checkedAt)}</p></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold text-[var(--text)]">Problems</h2><p className="text-xs text-[var(--muted)]">Re-link only repairs stored team row numbers after verifying website + anchor.</p></div>
        {result.problems.length === 0 ? (
          <p className="p-6 text-sm text-[#188038]">No linkage problems found.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {result.problems.map((problem, index) => (
              <div key={`${problem.requestId}-${problem.problemType}-${index}`} className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#fce8e6] px-2 py-0.5 text-[11px] font-semibold text-[#c5221f]">{problem.problemType.replaceAll('_', ' ')}</span><span className="text-xs text-[var(--muted)]">{problem.project}</span></div>
                  <p className="mt-2 font-medium text-[var(--text)]">{problem.website}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{problem.details}</p>
                  <div className="mt-2 flex gap-3 text-xs"><Link href="/requests" className="text-[var(--brand)] hover:underline">Open requests</Link>{problem.projectSlug && <Link href={`/projects/${problem.projectSlug}`} className="text-[var(--brand)] hover:underline">Open project</Link>}</div>
                </div>
                {problem.canRelink && <RelinkHealthButton requestId={problem.requestId} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
