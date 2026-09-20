'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { importSitesFromFile, type ImportResult } from '@/services/sites';
import { SITE_IMPORT_HEADERS } from '@/lib/validators';
import { UploadCloud } from 'lucide-react';

export default function ImportForm({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    setFatalError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await importSitesFromFile(formData);
      setResult(res);
      if (res.rowsImported > 0) router.refresh();
    } catch (caught) {
      setFatalError(caught instanceof Error ? caught.message : 'Import failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <div>
        <Label htmlFor="project_id">Project *</Label>
        <Select id="project_id" name="project_id" required defaultValue="">
          <option value="" disabled>Select a project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="file">CSV / XLSX file *</Label>
        <input id="file" name="file" type="file" accept=".csv,.xlsx,.xls" required className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--canvas)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--text)] hover:file:bg-[var(--brand-soft)]" />
        <p className="mt-1.5 text-xs text-[var(--muted)]">Required columns: {SITE_IMPORT_HEADERS.join(', ')}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Status is normalized to exactly <strong>Request shared</strong> or <strong>Live</strong>.</p>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-3 text-sm text-[var(--text)]">
        <input type="checkbox" name="push_to_team_sheet" className="mt-0.5 h-4 w-4" />
        <span><strong>Push imported rows to team sheet</strong><span className="mt-0.5 block text-xs text-[var(--muted)]">Optional and off by default. Rows are saved in the database first; Sheet failures never remove imported data.</span></span>
      </label>
      <Button type="submit" disabled={pending}>
        <UploadCloud size={16} /> {pending ? 'Importing…' : 'Import'}
      </Button>
      {fatalError && <p className="rounded-lg bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{fatalError}</p>}
      {result && (
        <div className="rounded-lg bg-[var(--canvas)] p-3 text-sm">
          <p className="font-medium text-[var(--text)]">{result.rowsImported} row(s) imported.</p>
          {(result.rowsSynced > 0 || result.rowsSkippedSync > 0 || result.rowsFailedSync > 0) && <p className="mt-1 text-xs text-[var(--muted)]">Sheet: {result.rowsSynced} synced · {result.rowsSkippedSync} skipped · {result.rowsFailedSync} failed</p>}
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[#c5221f]">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
