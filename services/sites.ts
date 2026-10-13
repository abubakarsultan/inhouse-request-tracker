'use server';

import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase-server';
import { SITE_IMPORT_HEADERS } from '@/lib/validators';
import { extractHost } from '@/lib/domain';
import { revalidatePath } from 'next/cache';
import { normalizeImportedSiteStatus } from '@/lib/sheet-webhook';
import { appendRequestToTeamSheet, type RequestSheetRecord } from '@/services/google-sheet-sync';
import { requireAdminForAction } from '@/lib/auth';

export async function getProjectSites(projectId: string) {
  await requireAdminForAction();
  const supabase = await createClient();
  const { data, error } = await supabase.from('project_sites').select('*').eq('project_id', projectId).is('archived_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type ImportResult = { rowsImported: number; rowsSynced: number; rowsSkippedSync: number; rowsFailedSync: number; errors: string[] };

function parseOptionalInteger(value: unknown, label: string, rowNumber: number, errors: string[]) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed)) { errors.push(`Row ${rowNumber}: ${label} "${String(value)}" is not numeric; saved blank.`); return null; }
  return Math.trunc(parsed);
}

function parseSheetMetric(value: string | number | null) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

async function loadKnownProjectDomains(supabase: Awaited<ReturnType<typeof createClient>>) {
  const known = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('requests').select('project_id,approved_site').is('deleted_at', null).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const host = extractHost(String(row.approved_site ?? ''));
      if (host) known.add(`${row.project_id}\u0000${host}`);
    }
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('project_sites').select('project_id,website,request_id').is('request_id', null).is('archived_at', null).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const host = extractHost(String(row.website ?? ''));
      if (host) known.add(`${row.project_id}\u0000${host}`);
    }
    if ((data ?? []).length < 1000) break;
  }
  return known;
}

async function loadOwnerMap(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.from('users').select('id,sheet_name').not('sheet_name', 'is', null);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((user: any) => [String(user.sheet_name ?? '').trim().toLowerCase(), String(user.id)]));
}

async function insertImportedRequest(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  project: any;
  website: string;
  opportunity: string | null;
  anchor: string;
  dr: number | null;
  traffic: number | null;
  status: 'Request shared' | 'Live' | 'Rejected';
  note: string | null;
  teamRow: number | null;
  createdByEmail: string | null;
  createdByUserId: string | null;
  ownerUserId: string | null;
  source: 'team_sheet' | 'file_import';
}) {
  const { supabase, project } = args;
  const { data: request, error: requestError } = await supabase.from('requests').insert({
    project_id: project.id,
    sub_project: null,
    target_url: '',
    anchor: args.anchor,
    approved_site: args.website,
    placement_page: args.opportunity,
    shared_with: null,
    priority: 'Medium',
    assign_to: args.note,
    deadline: null,
    status: args.status,
    initial_status: args.status,
    live_date: null,
    team_tab: args.source === 'team_sheet' ? project.guest_post_tab_name : null,
    team_row: args.teamRow,
    sync_state: args.source === 'team_sheet' && args.teamRow ? 'synced' : 'skipped',
    sync_error: null,
    created_by_name: args.note,
    assigned_user_id: args.ownerUserId,
    created_by_user_id: args.createdByUserId,
    created_by_email: args.createdByEmail,
    source: args.source,
  }).select('*').single();
  if (requestError || !request) throw new Error(requestError?.message ?? 'Could not create imported request.');

  const { data: site, error: siteError } = await supabase.from('project_sites').insert({
    project_id: project.id,
    request_id: request.id,
    website: args.website,
    opportunity: args.opportunity,
    anchor: args.anchor || null,
    dr: args.dr,
    traffic: args.traffic,
    status: args.status,
    note: args.note,
    team_row: args.teamRow,
    owner_user_id: args.ownerUserId,
    created_by_user_id: args.createdByUserId,
    created_by_email: args.createdByEmail,
    source: args.source,
  }).select('*').single();
  if (siteError || !site) {
    await supabase.from('requests').delete().eq('id', request.id);
    throw new Error(siteError?.message ?? 'Could not create linked project row.');
  }
  return { request, site };
}

export async function importSitesFromFile(formData: FormData): Promise<ImportResult> {
  const admin = await requireAdminForAction();
  const supabase = await createClient();
  const projectId = String(formData.get('project_id') ?? '');
  const pushToTeamSheet = String(formData.get('push_to_team_sheet') ?? '') === 'on';
  const file = formData.get('file') as File | null;
  const empty = (): ImportResult => ({ rowsImported: 0, rowsSynced: 0, rowsSkippedSync: 0, rowsFailedSync: 0, errors: [] });
  if (!projectId) return { ...empty(), errors: ['Select a project first.'] };
  if (!file || file.size === 0) return { ...empty(), errors: ['Choose a CSV or XLSX file.'] };

  const { data: project, error: projectError } = await supabase.from('projects').select('id,name,guest_post_tab_name,sync_enabled').eq('id', projectId).single();
  if (projectError || !project) return { ...empty(), errors: [projectError?.message ?? 'Project not found.'] };
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const result = empty();
  if (!rows.length) return { ...result, errors: ['The file has no data rows.'] };
  const missing = SITE_IMPORT_HEADERS.filter((header) => !Object.keys(rows[0]).includes(header));
  if (missing.length) return { ...result, errors: [`Missing required column(s): ${missing.join(', ')}`] };

  const known = await loadKnownProjectDomains(supabase);
  const owners = await loadOwnerMap(supabase);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const website = String(row.Website ?? '').trim();
    const host = extractHost(website);
    if (!website || !host) { result.errors.push(`Row ${rowNumber}: invalid Website - skipped.`); continue; }
    const domainKey = `${projectId}\u0000${host}`;
    if (known.has(domainKey)) { result.errors.push(`Row ${rowNumber}: ${website} is already used in ${project.name}; skipped because one project may use a website only once.`); continue; }
    const rawStatus = String(row.Status ?? '').trim();
    const status = normalizeImportedSiteStatus(rawStatus);
    if (rawStatus && !['live','request shared','request shared','rejected','reject'].includes(rawStatus.toLowerCase())) result.errors.push(`Row ${rowNumber}: unsupported status "${rawStatus}" mapped to "Request shared".`);
    const note = String(row.Note ?? '').trim() || null;
    try {
      const inserted = await insertImportedRequest({
        supabase, project, website,
        opportunity: String(row.Opportunity ?? '').trim() || null,
        anchor: String(row.Anchor ?? '').trim(),
        dr: parseOptionalInteger(row.DR, 'DR', rowNumber, result.errors),
        traffic: parseOptionalInteger(row.Traffic, 'Traffic', rowNumber, result.errors),
        status, note, teamRow: null,
        createdByEmail: admin.email, createdByUserId: admin.id,
        ownerUserId: note ? owners.get(note.toLowerCase()) ?? null : null,
        source: 'file_import',
      });
      known.add(domainKey); result.rowsImported += 1;
      if (pushToTeamSheet) {
        const record: RequestSheetRecord = { id: inserted.request.id, project_id: project.id, approved_site: website, placement_page: inserted.request.placement_page, anchor: inserted.request.anchor, assign_to: inserted.request.assign_to, status: inserted.request.status, team_tab: null, team_row: null, created_by_email: admin.email };
        const sync = await appendRequestToTeamSheet(project as any, record, inserted.site.id);
        await supabase.from('requests').update({ sync_state: sync.state, sync_error: sync.state === 'failed' ? sync.error ?? sync.text : null, ...(sync.tab ? { team_tab: sync.tab } : {}), ...(sync.row ? { team_row: sync.row } : {}) }).eq('id', inserted.request.id);
        if (sync.row) await supabase.from('project_sites').update({ team_row: sync.row }).eq('id', inserted.site.id);
        if (sync.state === 'synced') result.rowsSynced += 1; else if (sync.state === 'skipped') result.rowsSkippedSync += 1; else { result.rowsFailedSync += 1; result.errors.push(`${website}: ${sync.error ?? sync.text}`); }
      }
    } catch (error) { result.errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  await supabase.from('imports').insert({ project_id: projectId, file_name: file.name, uploaded_by: admin.id, rows_imported: result.rowsImported, errors: result.errors.length ? result.errors : null });
  for (const path of ['/projects','/requests','/dashboard','/my-requests','/import','/site-check']) revalidatePath(path);
  return result;
}

export async function getRecentImports() {
  await requireAdminForAction();
  const supabase = await createClient();
  const { data, error } = await supabase.from('imports').select('*, projects(name)').order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  return data;
}

export type TeamSheetImportReport = {
  rowsRead: number; added: number; skipped: number; errors: string[];
  projects: Array<{ project: string; tab: string | null; rowsRead: number; added: number; skipped: number; state: 'ok' | 'skipped' | 'failed'; detail?: string }>;
};

export async function importFromTeamSheet(): Promise<TeamSheetImportReport> {
  await requireAdminForAction();
  const { readTeamSheetProjectRows } = await import('@/services/google-sheet-sync');
  const supabase = await createClient();
  const { data: projects, error: projectsError } = await supabase.from('projects').select('id,name,guest_post_tab_name,sync_enabled').order('name');
  if (projectsError) throw new Error(`Could not load projects: ${projectsError.message}`);
  const known = await loadKnownProjectDomains(supabase);
  const owners = await loadOwnerMap(supabase);
  const report: TeamSheetImportReport = { rowsRead: 0, added: 0, skipped: 0, errors: [], projects: [] };

  for (const project of projects ?? []) {
    const read = await readTeamSheetProjectRows(project as any);
    const projectReport = { project: String(project.name), tab: project.guest_post_tab_name ? String(project.guest_post_tab_name) : null, rowsRead: read.rows.length, added: 0, skipped: 0, state: read.state, detail: read.state === 'ok' ? undefined : read.reason } as TeamSheetImportReport['projects'][number];
    report.rowsRead += read.rows.length;
    if (read.state !== 'ok') { if (read.state === 'failed') report.errors.push(`${project.name}: ${read.reason}`); report.projects.push(projectReport); continue; }

    for (const row of read.rows) {
      const host = extractHost(row.website);
      if (!row.website || !host) { report.errors.push(`${project.name} row ${row.teamRow}: Website is empty/invalid; skipped.`); projectReport.skipped += 1; report.skipped += 1; continue; }
      const key = `${project.id}\u0000${host}`;
      if (known.has(key)) { projectReport.skipped += 1; report.skipped += 1; continue; }
      const note = row.note || null;
      try {
        await insertImportedRequest({
          supabase, project, website: row.website, opportunity: row.opportunity || null, anchor: row.anchor || '', dr: parseSheetMetric(row.dr), traffic: parseSheetMetric(row.traffic),
          status: normalizeImportedSiteStatus(row.status), note, teamRow: row.teamRow,
          createdByEmail: row.createdByEmail || null, createdByUserId: null,
          ownerUserId: note ? owners.get(note.toLowerCase()) ?? null : null,
          source: 'team_sheet',
        });
        known.add(key); projectReport.added += 1; report.added += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        report.errors.push(`${project.name} row ${row.teamRow}: ${reason}`); projectReport.state = 'failed'; projectReport.detail = reason;
      }
    }
    report.projects.push(projectReport);
  }

  for (const path of ['/projects','/requests','/dashboard','/my-requests','/import','/site-check','/team']) revalidatePath(path);
  return report;
}
