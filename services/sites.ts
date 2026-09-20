'use server';

import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase-server';
import { SITE_IMPORT_HEADERS } from '@/lib/validators';
import { revalidatePath } from 'next/cache';

export async function getProjectSites(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_sites')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

type ImportResult = { rowsImported: number; errors: string[] };

// Existing importer is retained in Phase 1. Phase 4 will add the optional
// team-sheet push checkbox and finish the two-status import vocabulary pass.
export async function importSitesFromFile(formData: FormData): Promise<ImportResult> {
  const supabase = await createClient();

  const projectId = String(formData.get('project_id') ?? '');
  const file = formData.get('file') as File | null;
  if (!projectId) return { rowsImported: 0, errors: ['Select a project first.'] };
  if (!file || file.size === 0) return { rowsImported: 0, errors: ['Choose a CSV or XLSX file.'] };
  const fileName = file.name;

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const errors: string[] = [];
  if (rows.length === 0) {
    errors.push('The file has no data rows.');
    await supabase.from('imports').insert({ project_id: projectId, file_name: fileName, uploaded_by: null, rows_imported: 0, errors });
    return { rowsImported: 0, errors };
  }

  const headerKeys = Object.keys(rows[0]);
  const missing = SITE_IMPORT_HEADERS.filter((header) => !headerKeys.includes(header));
  if (missing.length) {
    errors.push(`Missing required column(s): ${missing.join(', ')}`);
    await supabase.from('imports').insert({ project_id: projectId, file_name: fileName, uploaded_by: null, rows_imported: 0, errors });
    return { rowsImported: 0, errors };
  }

  const toInsert = rows.flatMap((row: Record<string, unknown>, index: number) => {
    const website = String(row.Website ?? '').trim();
    if (!website) {
      errors.push(`Row ${index + 2}: "Website" is empty - skipped.`);
      return [];
    }
    return [{
      project_id: projectId,
      request_id: null,
      website,
      opportunity: String(row.Opportunity ?? ''),
      anchor: String(row.Anchor ?? ''),
      dr: row.DR !== '' ? Number(row.DR) : null,
      traffic: row.Traffic !== '' ? Number(row.Traffic) : null,
      status: String(row.Status ?? 'Request shared') || 'Request shared',
      note: String(row.Note ?? ''),
      team_row: null,
    }];
  });

  if (toInsert.length) {
    const { error } = await supabase.from('project_sites').insert(toInsert);
    if (error) errors.push(error.message);
  }

  await supabase.from('imports').insert({
    project_id: projectId,
    file_name: fileName,
    uploaded_by: null,
    rows_imported: toInsert.length,
    errors: errors.length ? errors : null,
  });

  revalidatePath('/projects');
  revalidatePath('/import');
  return { rowsImported: toInsert.length, errors };
}

export async function getRecentImports() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('imports')
    .select('*, projects(name)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}
