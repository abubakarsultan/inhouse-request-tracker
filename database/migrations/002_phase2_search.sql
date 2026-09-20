-- Phase 2 search helper. Re-runnable.
-- Normalization mirrors the Apps Script norm_ helper: lowercase and keep a-z/0-9 only.

create or replace function search_requests(p_query text, p_limit integer default 101)
returns table(
  id uuid,
  project_id uuid,
  client text,
  project_slug text,
  sub_project text,
  approved_site text,
  anchor text,
  assign_to text,
  status text,
  target_url text,
  created_at timestamptz,
  sync_state text
)
language sql
stable
set search_path = public
as $$
  with q as (
    select regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g') as key
  )
  select
    r.id,
    r.project_id,
    p.name as client,
    p.slug as project_slug,
    r.sub_project,
    r.approved_site,
    r.anchor,
    r.assign_to,
    r.status,
    r.target_url,
    r.created_at,
    r.sync_state
  from requests r
  join projects p on p.id = r.project_id
  cross join q
  where length(q.key) >= 2
    and regexp_replace(
      lower(concat_ws(' | ', p.name, r.sub_project, r.approved_site, r.anchor, r.assign_to, r.status, r.target_url)),
      '[^a-z0-9]', '', 'g'
    ) like '%' || q.key || '%'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 101));
$$;
