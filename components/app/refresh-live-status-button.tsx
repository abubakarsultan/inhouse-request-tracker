'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { refreshStatusesFromTeamSheet, type RefreshSheetStatusReport } from '@/services/google-sheet-sync';
import { formatKarachiDateTime } from '@/lib/date';

export default function RefreshLiveStatusButton({
  lastRefresh,
}: {
  lastRefresh: { createdAt: string; updated: number; checked: number } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<RefreshSheetStatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await refreshStatusesFromTeamSheet();
        setReport(result);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Refresh failed');
      }
    });
  }

  const label = report
    ? `Last refresh: ${formatKarachiDateTime(report.refreshedAt)} · ${report.updated} updated`
    : lastRefresh
      ? `Last refresh: ${formatKarachiDateTime(lastRefresh.createdAt)} · ${lastRefresh.updated} updated`
      : 'Last refresh: not run yet';

  return (
    <div className="text-right">
      <button type="button" onClick={run} disabled={pending} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--canvas)] disabled:opacity-50">
        <RefreshCw size={15} className={pending ? 'animate-spin' : ''} /> {pending ? 'Refreshing…' : 'Refresh live status'}
      </button>
      <p className="mt-1 text-[11px] text-[var(--muted)]">{label}</p>
      {report && (report.failed > 0 || report.invalidStatuses > 0) && (
        <p className="mt-1 max-w-md text-[11px] text-[#c5221f]">{report.failed} failed · {report.invalidStatuses} invalid status · {report.repairedRows} row(s) repaired</p>
      )}
      {error && <p className="mt-1 max-w-md text-[11px] text-[#c5221f]">{error}</p>}
    </div>
  );
}
