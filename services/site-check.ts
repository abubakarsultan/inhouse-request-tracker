'use server';

import { createClient } from '@/lib/supabase-server';
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
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id,name,slug,guest_post_tab_name')
    .order('name');
  if (projectsError) throw new Error(`Could not load projects: ${projectsError.message}`);

  const sites: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: sitesError } = await supabase
      .from('project_sites')
      .select('id,project_id,request_id,website,anchor,status')
      .is('archived_at', null)
      .range(from, from + 999);
    if (sitesError) throw new Error(`Could not scan project sites: ${sitesError.message}`);
    sites.push(...(page ?? []));
    if ((page ?? []).length < 1000) break;
  }

  const matchingSites = sites.filter((site: any) => extractHost(site.website) === host);
  const requestIds = [...new Set(matchingSites.map((site: any) => site.request_id).filter(Boolean))];
  const requestStatus = new Map<string, string>();

  if (requestIds.length) {
    for (let index = 0; index < requestIds.length; index += 200) {
      const batch = requestIds.slice(index, index + 200);
      const { data: requests, error: requestError } = await supabase
        .from('requests')
        .select('id,status')
        .in('id', batch);
      if (requestError) throw new Error(`Could not load linked request statuses: ${requestError.message}`);
      for (const request of requests ?? []) requestStatus.set(String(request.id), String(request.status));
    }
  }

  const used: SiteCheckMatch[] = [];
  const usedProjectIds = new Set<string>();
  const projectMap = new Map<string, any>((projects ?? []).map((project: any) => [String(project.id), project]));

  for (const site of matchingSites as any[]) {
    const project = projectMap.get(String(site.project_id));
    if (!project) continue;
    usedProjectIds.add(String(project.id));
    used.push({
      projectId: String(project.id),
      project: String(project.name),
      projectSlug: String(project.slug),
      trackerOnly: !String(project.guest_post_tab_name ?? '').trim(),
      status: site.request_id ? canonicalStatus(requestStatus.get(String(site.request_id)) ?? String(site.status ?? '')) : canonicalStatus(String(site.status ?? '')),
      anchor: String(site.anchor ?? ''),
    });
  }

  used.sort((a, b) => a.project.localeCompare(b.project) || a.anchor.localeCompare(b.anchor));
  const notUsed: SiteCheckProject[] = (projects ?? [])
    .filter((project: any) => !usedProjectIds.has(String(project.id)))
    .map((project: any) => ({
      projectId: String(project.id),
      project: String(project.name),
      projectSlug: String(project.slug),
      trackerOnly: !String(project.guest_post_tab_name ?? '').trim(),
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
