import ImportForm from '@/components/app/import-form';
import { getProjects } from '@/services/projects';
import { getRecentImports } from '@/services/sites';

export default async function Import() {
  const [projects, imports] = await Promise.all([getProjects(), getRecentImports()]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Import</h1>
      <ImportForm projects={projects} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">Recent imports</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <tr><th className="p-3">File</th><th className="p-3">Project</th><th className="p-3">Rows</th><th className="p-3">When</th></tr>
          </thead>
          <tbody>
            {imports.map((i: any) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="p-3">{i.file_name}</td>
                <td className="p-3 text-slate-500">{i.projects?.name ?? '—'}</td>
                <td className="p-3 text-slate-500">{i.rows_imported}</td>
                <td className="p-3 text-slate-400">{new Date(i.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {imports.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No imports yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
