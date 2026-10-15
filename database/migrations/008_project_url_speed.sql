-- Apply after 007. No existing requests or projects are removed.
alter table public.projects add column if not exists google_sheet_gid bigint;

-- Aggregate project counts in Postgres instead of reading all request records in pages.
create or replace function public.project_request_status_counts()
returns table (project_id uuid, requests bigint, live bigint, pending bigint, rejected bigint)
language sql stable security definer set search_path = public
as $$
  select r.project_id,
    count(*) as requests,
    count(*) filter (where r.status = 'Live') as live,
    count(*) filter (where r.status = 'Request shared') as pending,
    count(*) filter (where r.status = 'Rejected') as rejected
  from public.requests r
  where r.deleted_at is null
  group by r.project_id;
$$;

create or replace function public.project_site_status_counts(p_project_id uuid)
returns table (total bigint, live bigint, pending bigint, rejected bigint)
language sql stable security definer set search_path = public
as $$
  select count(*) as total,
    count(*) filter (where s.status = 'Live') as live,
    count(*) filter (where s.status = 'Request shared') as pending,
    count(*) filter (where s.status = 'Rejected') as rejected
  from public.project_sites s
  where s.project_id = p_project_id and s.archived_at is null;
$$;

revoke all on function public.project_request_status_counts() from public, anon, authenticated;
revoke all on function public.project_site_status_counts(uuid) from public, anon, authenticated;
grant execute on function public.project_request_status_counts() to service_role;
grant execute on function public.project_site_status_counts(uuid) to service_role;

create index if not exists idx_project_sites_visible_latest
on public.project_sites (project_id, created_at desc)
where archived_at is null;
create index if not exists idx_requests_active_project_status
on public.requests (project_id, status)
where deleted_at is null;

-- Sheet webhooks must be scoped to a spreadsheet. Many custom Sheets have the
-- same default tab name ("Sheet1"); tab + row alone must never identify a project.
-- NULL sheet id means the legacy shared Guest Post Anchor script.
create or replace function public.find_request_from_sheet_scoped(
  p_tab text, p_website text, p_anchor text, p_row integer, p_sheet_id text
)
returns table(request_id uuid, match_type text)
language sql stable security definer set search_path = public
as $$
  with normalized as (
    select regexp_replace(lower(coalesce(p_website, '')), '[^a-z0-9]', '', 'g') as website_key,
           regexp_replace(lower(coalesce(p_anchor, '')), '[^a-z0-9]', '', 'g') as anchor_key
  ), matches as (
    select r.id,
           case when regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key
                  and regexp_replace(lower(coalesce(r.anchor, '')), '[^a-z0-9]', '', 'g') = n.anchor_key
                then 1 else 2 end as priority
    from public.requests r
    join public.projects p on p.id = r.project_id
    cross join normalized n
    where r.deleted_at is null and r.team_tab = p_tab
      and (
        (p_sheet_id is null and p.sheet_source = 'guest_post_anchor')
        or (p_sheet_id is not null and p.sheet_source = 'custom_sheet' and p.google_sheet_id = p_sheet_id)
      )
      and (
        (length(n.website_key) > 0 and length(n.anchor_key) > 0
         and regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key
         and regexp_replace(lower(coalesce(r.anchor, '')), '[^a-z0-9]', '', 'g') = n.anchor_key)
        or (p_sheet_id is null and p_row is not null and r.team_row = p_row)
      )
  )
  select m.id, case when m.priority = 1 then 'site_anchor' else 'row_fallback' end
  from matches m order by m.priority, m.id limit 1;
$$;
revoke all on function public.find_request_from_sheet_scoped(text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.find_request_from_sheet_scoped(text,text,text,integer,text) to service_role;
