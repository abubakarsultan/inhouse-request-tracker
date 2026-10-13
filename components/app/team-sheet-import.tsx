'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { importFromTeamSheet, type TeamSheetImportReport } from '@/services/sites';

export default function TeamSheetImport() {
  const router = useRouter();
  const [report, setReport] = useState<TeamSheetImportReport | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function run() {
    setError('');
    startTransition(async () => {
      try {
        const result = await importFromTeamSheet();
        setReport(result);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Team-sheet import failed');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--text)]">Import from team sheet</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Reads A2:G from every mapped project tab. Safe to run repeatedly; existing project + website + anchor rows are skipped.</p>
      <Button type="button" className="mt-4" onClick={run} disabled={pending}>{pending ? 'Importing…' : 'Run team-sheet import'}</Button>
      {error && <p className="mt-3 rounded-lg bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</p>}
      {report && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Rows read', report.rowsRead], ['Added', report.added], ['Skipped', report.skipped], ['Errors', report.errors.length]].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-[var(--canvas)] p-3"><p className="text-xl font-bold text-[var(--text)]">{value}</p><p className="text-xs text-[var(--muted)]">{label}</p></div>
            ))}
          </div>
          {report.errors.length > 0 && <div className="rounded-lg bg-[#fce8e6] p-3 text-xs text-[#c5221f]">{report.errors.map((item) => <p key={item}>{item}</p>)}</div>}
          <details className="text-sm text-[var(--muted)]">
            <summary className="cursor-pointer font-medium text-[var(--text)]">Per-project report</summary>
            <div className="mt-2 space-y-1">
              {report.projects.map((project) => <p key={project.project}><span className="font-medium">{project.project}</span>: {project.rowsRead} read · {project.added} added · {project.skipped} skipped{project.detail ? ` · ${project.detail}` : ''}</p>)}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
