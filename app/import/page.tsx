import ImportForm from '@/components/app/import-form';
import TeamSheetImport from '@/components/app/team-sheet-import';
import OutreachCsvDownload from '@/components/app/outreach-csv-download';
import { getProjects } from '@/services/projects';
import { getRecentImports } from '@/services/sites';
import { karachiDateString } from '@/lib/date';

export default async function Import() {
  const [projects, imports] = await Promise.all([getProjects(), getRecentImports()]);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Imports & Exports</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Bring legacy team-sheet rows into the tracker, import project-site files, or export today&apos;s Outreach OS bulk-add CSV.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <TeamSheetImport />
        <OutreachCsvDownload defaultDate={karachiDateString()} />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Import project sites from CSV / XLSX</h2>
        <ImportForm projects={projects} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-[var(--muted)]">Recent file imports</h2>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <tr><th className="p-3">File</th><th className="p-3">Project</th><th className="p-3">Rows</th><th className="p-3">When</th></tr>
          </thead>
          <tbody>
            {imports.map((i: any) => (
              <tr key={i.id} className="border-t border-[var(--border)]/70">
                <td className="p-3 text-[var(--text)]">{i.file_name}</td>
                <td className="p-3 text-[var(--muted)]">{i.projects?.name ?? '—'}</td>
                <td className="p-3 text-[var(--muted)]">{i.rows_imported}</td>
                <td className="p-3 text-[var(--muted)]">{new Date(i.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {imports.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[var(--muted)]">No file imports yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
