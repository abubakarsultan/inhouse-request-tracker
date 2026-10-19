export type IncompleteRequest = { placement_page?: unknown; target_url?: unknown; anchor?: unknown; assign_to?: unknown; deadline?: unknown; dr?: unknown; traffic?: unknown };
export type CompletenessProject = { column_mapping?: unknown };
function present(value: unknown) { return value !== null && value !== undefined && String(value).trim() !== ''; }
export function getMissingRequestFields(request: IncompleteRequest, project?: CompletenessProject | null): string[] {
  const missing: string[] = [];
  if (!present(request.placement_page)) missing.push('Placement page');
  if (!present(request.target_url)) missing.push('Target URL');
  if (!present(request.anchor)) missing.push('Anchor');
  if (!present(request.assign_to)) missing.push('Assignee');
  if (!present(request.deadline)) missing.push('Deadline');
  const mapping = Array.isArray(project?.column_mapping) ? project!.column_mapping as Array<{heading?:unknown;field?:unknown}> : [];
  const includes = (field: string, heading: string) => mapping.some(item => String(item.field || '').toLowerCase() === field || String(item.heading || '').trim().toLowerCase() === heading.toLowerCase());
  if (includes('dr','DR') && !present(request.dr)) missing.push('DR');
  if (includes('traffic','Traffic') && !present(request.traffic)) missing.push('Traffic');
  return missing;
}
