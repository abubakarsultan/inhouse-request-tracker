'use server';

import { createClient } from '@/lib/supabase-server';
import { adminClient } from '@/lib/supabase-admin';
import { extractHost } from '@/lib/domain';
import { requireActiveUserForAction } from '@/lib/auth';

export type SiteCheckMatch = {
  projectId: string;
  project: string;
  projectSlug: string;
  trackerOnly: boolean;
  status: string;
  anchor: string;
};

export type SiteCheckProject = {
  projectId: string;
  project: string;
  projectSlug: string;
  trackerOnly: boolean;
};

function canonicalStatus(value: string | null | undefined) {
  return value === 'Live' ? 'Live' : value === 'Rejected' ? 'Rejected' : 'Request shared';
}

export type SiteCheckResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      input: string;
      host: string;
      used: SiteCheckMatch[];
      notUsed: SiteCheckProject[];
      usedProjectCount: number;
      matchCount: number;
      notUsedCount: number;
    };

export type ProjectSiteUsageResult =
  | { ok: false; reason: string }
  | { ok: true; projectId: string; host: string; used: boolean; matches: Array<{ status: string; anchor: string; assignTo: string | null; source: string }> };

export async function checkSiteInProject(projectId: string, rawInput: string, excludeRequestId?: string | null): Promise<ProjectSiteUsageResult> {
  await requireActiveUserForAction();
  const host = extractHost(rawInput);
  if (!host) return { ok: false, reason: 'Enter a valid website or domain.' };
  if (!projectId) return { ok: false, reason: 'Select a project first.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('find_project_domain_usage', {
    p_project_id: projectId,
    p_approved_site: rawInput,
    p_exclude_request_id: excludeRequestId ?? null,
  });
  if (error) throw new Error(`Could not check project usage: ${error.message}`);
  const matches = (data ?? []).map((row: any) => ({
    status: String(row.status ?? 'Request shared'),
    anchor: String(row.anchor ?? ''),
    assignTo: row.assign_to ? String(row.assign_to) : null,
    source: String(row.source ?? ''),
  }));
  return { ok: true, projectId, host, used: matches.length > 0, matches };
}

export async function scanSiteAcrossProjects(rawInput: string): Promise<SiteCheckResult> {
  await requireActiveUserForAction();
  const host = extractHost(rawInput);
  if (!host) return { ok: false, reason: 'Enter a valid website or domain.' };

  const supabase = await createClient();
  const [{ data: projects, error: projectsError }, { data: matches, error: matchesError }] = await Promise.all([
    adminClient.from('projects').select('id,name,slug,sheet_source,guest_post_tab_name,google_sheet_id,sheet_tab_name').order('name'),
    adminClient.rpc('scan_project_sites_by_host', { p_host: host }),
  ]);
  if (projectsError) throw new Error(`Could not load projects: ${projectsError.message}`);
  if (matchesError) throw new Error(`Could not scan project sites: ${matchesError.message}`);

  const used: SiteCheckMatch[] = (matches ?? []).map((row: any) => ({
    projectId: String(row.project_id),
    project: String(row.project_name),
    projectSlug: String(row.project_slug),
    trackerOnly: String(row.sheet_source ?? '') === 'none',
    status: canonicalStatus(String(row.status ?? '')),
    anchor: String(row.anchor ?? ''),
  }));
  const usedProjectIds = new Set(used.map((row) => row.projectId));
  const notUsed: SiteCheckProject[] = (projects ?? [])
    .filter((project: any) => !usedProjectIds.has(String(project.id)))
    .map((project: any) => ({
      projectId: String(project.id),
      project: String(project.name),
      projectSlug: String(project.slug),
      trackerOnly: String(project.sheet_source ?? '') === 'none',
    }));

  return {
    ok: true,
    input: rawInput.trim(),
    host,
    used,
    notUsed,
    usedProjectCount: usedProjectIds.size,
    matchCount: used.length,
    notUsedCount: notUsed.length,
  };
}
