'use server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/session';
import { SITE_IMPORT_HEADERS } from '@/lib/validators';
import { revalidatePath } from 'next/cache';

export async function getProjectSites(projectId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_sites')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Updates a project_sites row's status. If the row is linked to a request
 * (request_id), this delegates to setRequestStatus (6.2) — the single
 * place status is ever written — so the request, the sheet, and the log
 * all stay in sync. A site with no linked request (e.g. imported directly,
 * never turned into a request) just updates its own row.
 */
export async function updateSiteStatus(id: string, projectId: string, status: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: site, error } = await supabase.from('project_sites').select('request_id').eq('id', id).single();
  if (error) throw error;

  if (site.request_id) {
    const { setRequestStatus } = await import('@/services/requests');
    await setRequestStatus(site.request_id, status as any);
  } else {
    const { error: updErr } = await supabase.from('project_sites').update({ status }).eq('id', id);
    if (updErr) throw updErr;
  }
  revalidatePath(`/projects`);
}

type ImportResult = { rowsImported: number; errors: string[] };

// Accepts the <form>'s FormData directly (project_id + file fields) and
// imports the file into project_sites. Validates the required header
// row before touching the database. Using FormData (rather than passing
// a raw buffer) is the officially supported way to send a File into a
// Next.js Server Action.
export async function importSitesFromFile(formData: FormData): Promise<ImportResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const projectId = String(formData.get('project_id') ?? '');
  const file = formData.get('file') as File | null;
  if (!projectId) return { rowsImported: 0, errors: ['Select a project first.'] };
  if (!file || file.size === 0) return { rowsImported: 0, errors: ['Choose a CSV or XLSX file.'] };
  const fileName = file.name;

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  const errors: string[] = [];
  if (rows.length === 0) {
    errors.push('The file has no data rows.');
    await supabase.from('imports').insert({ project_id: projectId, file_name: fileName, uploaded_by: user.id, rows_imported: 0, errors });
    return { rowsImported: 0, errors };
  }

  const headerKeys = Object.keys(rows[0]);
  const missing = SITE_IMPORT_HEADERS.filter((h) => !headerKeys.includes(h));
  if (missing.length) {
    errors.push(`Missing required column(s): ${missing.join(', ')}`);
    await supabase.from('imports').insert({ project_id: projectId, file_name: fileName, uploaded_by: user.id, rows_imported: 0, errors });
    return { rowsImported: 0, errors };
  }

  const toInsert = rows
    .map((r, i) => {
      const website = String(r['Website'] ?? '').trim();
      if (!website) {
        errors.push(`Row ${i + 2}: "Website" is empty — skipped.`);
        return null;
      }
      return {
        project_id: projectId,
        website,
        opportunity: String(r['Opportunity'] ?? ''),
        anchor: String(r['Anchor'] ?? ''),
        dr: r['DR'] !== '' ? Number(r['DR']) : null,
        traffic: r['Traffic'] !== '' ? Number(r['Traffic']) : null,
        status: String(r['Status'] ?? 'Pending'),
        note: String(r['Note'] ?? ''),
        created_by: user.id,
      };
    })
    .filter(Boolean) as any[];

  if (toInsert.length) {
    const { error } = await supabase.from('project_sites').insert(toInsert);
    if (error) errors.push(error.message);
  }

  await supabase.from('imports').insert({
    project_id: projectId,
    file_name: fileName,
    uploaded_by: user.id,
    rows_imported: toInsert.length,
    errors: errors.length ? errors : null,
  });

  revalidatePath('/projects');
  revalidatePath('/import');
  return { rowsImported: toInsert.length, errors };
}

export async function getRecentImports() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('imports')
    .select('*, projects(name)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}
