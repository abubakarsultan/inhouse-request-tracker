'use server';

import { adminClient } from '@/lib/supabase-admin';
import { readTeamSheetProjectRows, verifyRequestTeamRow, type TeamSheetReadResult } from '@/services/google-sheet-sync';
import { revalidatePath } from 'next/cache';
import { normalizeForDuplicate } from '@/lib/validators';
import { requireAdminForAction } from '@/lib/auth';

export type HealthProblem = {
  requestId: string;
  project: string;
  projectSlug: string | null;
  website: string;
  problemType: 'missing_project_site' | 'project_site_mismatch' | 'team_row_mismatch' | 'team_row_missing' | 'sheet_check_failed';
  details: string;
  checkedAt: string;
  canRelink: boolean;
};

export type HealthCheckResult = {
  checkedAt: string;
  requestsChecked: number;
  problems: HealthProblem[];
};

export async function runHealthCheck(): Promise<HealthCheckResult> {
  await requireAdminForAction();
  const checkedAt = new Date().toISOString();
  const requests: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await adminClient
      .from('requests')
      .select('id,project_id,approved_site,anchor,team_tab,team_row,projects(name,slug),project_sites(id,project_id,request_id,website,anchor,team_row)')
      .not('team_tab', 'is', null)
      .not('team_row', 'is', null)
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    requests.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }

  const tabCache = new Map<string, TeamSheetReadResult>();
  async function readTab(tab: string) {
    const cached = tabCache.get(tab);
    if (cached) return cached;
    const read = await readTeamSheetProjectRows({ id: tab, name: tab, guest_post_tab_name: tab });
    tabCache.set(tab, read);
    return read;
  }

  const problems: HealthProblem[] = [];
  for (const request of requests) {
    const project = Array.isArray(request.projects) ? request.projects[0] : request.projects;
    const site = Array.isArray(request.project_sites) ? request.project_sites[0] : request.project_sites;
    const base = {
      requestId: String(request.id),
      project: String(project?.name ?? 'Unknown project'),
      projectSlug: project?.slug ? String(project.slug) : null,
      website: String(request.approved_site ?? ''),
      checkedAt,
    };

    if (!site) {
      problems.push({ ...base, problemType: 'missing_project_site', details: 'Request has no linked project_sites row.', canRelink: false });
    } else {
      const mismatches: string[] = [];
      if (String(site.project_id) !== String(request.project_id)) mismatches.push('project_id');
      if (String(site.request_id) !== String(request.id)) mismatches.push('request_id');
      if (normalizeForDuplicate(site.website) !== normalizeForDuplicate(request.approved_site)) mismatches.push('website');
      if (normalizeForDuplicate(site.anchor) !== normalizeForDuplicate(request.anchor)) mismatches.push('anchor');
      if (mismatches.length) {
        problems.push({ ...base, problemType: 'project_site_mismatch', details: `Linked project_sites row differs on: ${mismatches.join(', ')}.`, canRelink: false });
      }
    }

    const tab = String(request.team_tab ?? '').trim();
    const read = await readTab(tab);
    if (read.state !== 'ok') {
      problems.push({ ...base, problemType: 'sheet_check_failed', details: read.reason, canRelink: true });
      continue;
    }

    const websiteKey = normalizeForDuplicate(request.approved_site);
    const anchorKey = normalizeForDuplicate(request.anchor);
    const matches = (row: (typeof read.rows)[number]) =>
      normalizeForDuplicate(row.website) === websiteKey && normalizeForDuplicate(row.anchor) === anchorKey;
    const storedRow = read.rows.find((row) => row.teamRow === Number(request.team_row));
    const verifiedRow = storedRow && matches(storedRow) ? storedRow : read.rows.find(matches);

    if (!verifiedRow) {
      problems.push({ ...base, problemType: 'sheet_check_failed', details: `No row in "${tab}" matches both website "${request.approved_site}" and anchor "${request.anchor}".`, canRelink: true });
    } else if (verifiedRow.teamRow !== Number(request.team_row)) {
      problems.push({ ...base, problemType: 'team_row_mismatch', details: `Stored row ${request.team_row}; matching row is ${verifiedRow.teamRow}.`, canRelink: true });
    } else if (site && Number(site.team_row) !== Number(request.team_row)) {
      problems.push({ ...base, problemType: 'team_row_missing', details: `Request row is ${request.team_row}, but linked project_sites row stores ${site.team_row ?? 'no row'}.`, canRelink: true });
    }
  }

  return { checkedAt, requestsChecked: requests.length, problems };
}

export async function relinkHealthRequest(requestId: string) {
  await requireAdminForAction();
  const { data: request, error } = await adminClient
    .from('requests')
    .select('id,approved_site,anchor,team_tab,team_row,project_sites(id)')
    .eq('id', requestId)
    .single();
  if (error || !request) throw new Error(error?.message ?? 'Request not found');
  const site = Array.isArray(request.project_sites) ? request.project_sites[0] : request.project_sites;
  const verified = await verifyRequestTeamRow({
    id: String(request.id),
    approved_site: String(request.approved_site ?? ''),
    anchor: String(request.anchor ?? ''),
    team_tab: request.team_tab ? String(request.team_tab) : null,
    team_row: request.team_row == null ? null : Number(request.team_row),
    project_site_id: site?.id ? String(site.id) : null,
  }, true);
  if (verified.state === 'failed') return { ok: false, text: verified.reason };

  await adminClient.from('requests').update({ team_row: verified.row, sync_state: 'synced', sync_error: null }).eq('id', requestId);
  if (site?.id) await adminClient.from('project_sites').update({ team_row: verified.row }).eq('id', site.id);
  revalidatePath('/health');
  revalidatePath('/dashboard');
  return { ok: true, text: verified.repaired ? `Re-linked to row ${verified.row}.` : `Row ${verified.row} is already correct.` };
}
