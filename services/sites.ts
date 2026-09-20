'use server';

import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase-server';
import { SITE_IMPORT_HEADERS } from '@/lib/validators';
import { revalidatePath } from 'next/cache';
import { normalizeImportedSiteStatus } from '@/lib/sheet-webhook';
import { appendProjectSiteToTeamSheet, type ProjectSiteSheetRecord } from '@/services/google-sheet-sync';
import { requireAdminForAction } from '@/lib/auth';

export async function getProjectSites(projectId: string) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_sites')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type ImportResult = {
  rowsImported: number;
  rowsSynced: number;
  rowsSkippedSync: number;
  rowsFailedSync: number;
  errors: string[];
};

function parseOptionalInteger(value: unknown, label: string, rowNumber: number, errors: string[]) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed)) {
    errors.push(`Row ${rowNumber}: ${label} "${String(value)}" is not numeric; saved blank.`);
    return null;
  }
  return Math.trunc(parsed);
}

export async function importSitesFromFile(formData: FormData): Promise<ImportResult> {
  const admin = await requireAdminForAction();
  const supabase = await createClient();

  const projectId = String(formData.get('project_id') ?? '');
  const pushToTeamSheet = String(formData.get('push_to_team_sheet') ?? '') === 'on';
  const file = formData.get('file') as File | null;
  const emptyResult = (): ImportResult => ({ rowsImported: 0, rowsSynced: 0, rowsSkippedSync: 0, rowsFailedSync: 0, errors: [] });
  if (!projectId) return { ...emptyResult(), errors: ['Select a project first.'] };
  if (!file || file.size === 0) return { ...emptyResult(), errors: ['Choose a CSV or XLSX file.'] };
  const fileName = file.name;

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id,name,guest_post_tab_name,sync_enabled')
    .eq('id', projectId)
    .single();
  if (projectError || !project) return { ...emptyResult(), errors: [projectError?.message ?? 'Project not found.'] };

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const result = emptyResult();
  if (rows.length === 0) {
    result.errors.push('The file has no data rows.');
    await supabase.from('imports').insert({ project_id: projectId, file_name: fileName, uploaded_by: admin.id, rows_imported: 0, errors: result.errors });
    return result;
  }

  const headerKeys = Object.keys(rows[0]);
  const missing = SITE_IMPORT_HEADERS.filter((header) => !headerKeys.includes(header));
  if (missing.length) {
    result.errors.push(`Missing required column(s): ${missing.join(', ')}`);
    await supabase.from('imports').insert({ project_id: projectId, file_name: fileName, uploaded_by: admin.id, rows_imported: 0, errors: result.errors });
    return result;
  }

  const toInsert = rows.flatMap((row: Record<string, unknown>, index: number) => {
    const rowNumber = index + 2;
    const website = String(row.Website ?? '').trim();
    if (!website) {
      result.errors.push(`Row ${rowNumber}: "Website" is empty - skipped.`);
      return [];
    }
    const rawStatus = String(row.Status ?? '').trim();
    const status = normalizeImportedSiteStatus(rawStatus);
    if (rawStatus && rawStatus.toLowerCase() !== 'live' && rawStatus.toLowerCase() !== 'request shared') {
      result.errors.push(`Row ${rowNumber}: unsupported status "${rawStatus}" mapped to "Request shared".`);
    }
    return [{
      project_id: projectId,
      request_id: null,
      website,
      opportunity: String(row.Opportunity ?? '').trim() || null,
      anchor: String(row.Anchor ?? '').trim() || null,
      dr: parseOptionalInteger(row.DR, 'DR', rowNumber, result.errors),
      traffic: parseOptionalInteger(row.Traffic, 'Traffic', rowNumber, result.errors),
      status,
      note: String(row.Note ?? '').trim() || null,
      team_row: null,
      created_by_user_id: admin.id,
      created_by_email: admin.email,
    }];
  });

  let inserted: any[] = [];
  if (toInsert.length) {
    const { data, error } = await supabase.from('project_sites').insert(toInsert).select('*');
    if (error) result.errors.push(error.message);
    else inserted = data ?? [];
  }
  result.rowsImported = inserted.length;

  if (pushToTeamSheet && inserted.length) {
    for (const row of inserted) {
      const sync = await appendProjectSiteToTeamSheet(project as any, row as ProjectSiteSheetRecord);
      if (sync.state === 'synced') {
        result.rowsSynced += 1;
        if (sync.row) await supabase.from('project_sites').update({ team_row: sync.row }).eq('id', row.id);
      } else if (sync.state === 'skipped') {
        result.rowsSkippedSync += 1;
      } else {
        result.rowsFailedSync += 1;
        result.errors.push(`${row.website}: ${sync.error ?? sync.text}`);
      }
    }
  }

  await supabase.from('imports').insert({
    project_id: projectId,
    file_name: fileName,
    uploaded_by: admin.id,
    rows_imported: result.rowsImported,
    errors: result.errors.length ? result.errors : null,
  });

  revalidatePath('/projects');
  revalidatePath('/import');
  revalidatePath('/site-check');
  return result;
}

export async function getRecentImports() {
  await requireAdminForAction();
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
  await requireAdminForAction();
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
  const { data: mappedUsers, error: usersError } = await supabase.from('users').select('id,sheet_name').not('sheet_name', 'is', null);
  if (usersError) throw new Error(`Could not load team mappings: ${usersError.message}`);
  const ownerByName = new Map((mappedUsers ?? []).map((user: any) => [String(user.sheet_name ?? '').trim().toLowerCase(), String(user.id)]));
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
        owner_user_id: ownerByName.get(String(row.note ?? '').trim().toLowerCase()) ?? null,
        created_by_email: row.createdByEmail || null,
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
