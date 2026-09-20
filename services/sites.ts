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

export type TeamSheetImportReport = {
  rowsRead: number;
  added: number;
  skipped: number;
  errors: string[];
  projects: Array<{ project: string; tab: string | null; rowsRead: number; added: number; skipped: number; state: 'ok' | 'skipped' | 'failed'; detail?: string }>;
};

function importTupleKey(projectId: string, website: string, anchor: string) {
  return `${projectId}\u0000${website.trim().toLowerCase()}\u0000${anchor.trim().toLowerCase()}`;
}

function parseSheetMetric(value: string | number | null) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export async function importFromTeamSheet(): Promise<TeamSheetImportReport> {
  const { readTeamSheetProjectRows } = await import('@/services/google-sheet-sync');
  const supabase = await createClient();
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id,name,guest_post_tab_name')
    .order('name');
  if (projectsError) throw new Error(`Could not load projects: ${projectsError.message}`);

  const existing: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: existingError } = await supabase
      .from('project_sites')
      .select('project_id,website,anchor')
      .range(from, from + 999);
    if (existingError) throw new Error(`Could not load existing project sites: ${existingError.message}`);
    existing.push(...(page ?? []));
    if ((page ?? []).length < 1000) break;
  }

  const known = new Set(existing.map((row: any) => importTupleKey(String(row.project_id), String(row.website ?? ''), String(row.anchor ?? ''))));
  const report: TeamSheetImportReport = { rowsRead: 0, added: 0, skipped: 0, errors: [], projects: [] };

  for (const project of projects ?? []) {
    const read = await readTeamSheetProjectRows(project as any);
    const projectReport = {
      project: String(project.name),
      tab: project.guest_post_tab_name ? String(project.guest_post_tab_name) : null,
      rowsRead: read.rows.length,
      added: 0,
      skipped: 0,
      state: read.state,
      detail: read.state === 'ok' ? undefined : read.reason,
    } as TeamSheetImportReport['projects'][number];
    report.rowsRead += read.rows.length;

    if (read.state !== 'ok') {
      if (read.state === 'failed') report.errors.push(`${project.name}: ${read.reason}`);
      report.projects.push(projectReport);
      continue;
    }

    const toInsert: any[] = [];
    for (const row of read.rows) {
      if (!row.website) {
        const message = `${project.name} row ${row.teamRow}: Website is empty; row was not imported.`;
        report.errors.push(message);
        projectReport.skipped += 1;
        report.skipped += 1;
        continue;
      }

      const key = importTupleKey(String(project.id), row.website, row.anchor);
      if (known.has(key)) {
        projectReport.skipped += 1;
        report.skipped += 1;
        continue;
      }

      known.add(key);
      toInsert.push({
        project_id: project.id,
        request_id: null,
        website: row.website,
        opportunity: row.opportunity || null,
        anchor: row.anchor || null,
        dr: parseSheetMetric(row.dr),
        traffic: parseSheetMetric(row.traffic),
        status: row.status === 'Live' ? 'Live' : 'Request shared',
        note: row.note || null,
        team_row: row.teamRow,
      });
    }

    if (toInsert.length) {
      const { error } = await supabase.from('project_sites').insert(toInsert);
      if (error) {
        report.errors.push(`${project.name}: ${error.message}`);
        projectReport.state = 'failed';
        projectReport.detail = error.message;
      } else {
        projectReport.added = toInsert.length;
        report.added += toInsert.length;
      }
    }
    report.projects.push(projectReport);
  }

  revalidatePath('/projects');
  revalidatePath('/import');
  revalidatePath('/site-check');
  return report;
}
