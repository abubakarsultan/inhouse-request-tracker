import ImportForm from '@/components/app/import-form';
import { getProjects } from '@/services/projects';
import { getRecentImports } from '@/services/sites';

export default async function Import() {
  const [projects, imports] = await Promise.all([getProjects(), getRecentImports()]);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Import</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Import project-site rows from an existing CSV or XLSX file.</p>
      </div>
      <ImportForm projects={projects} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-[var(--muted)]">Recent imports</h2>
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
            {imports.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[var(--muted)]">No imports yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
