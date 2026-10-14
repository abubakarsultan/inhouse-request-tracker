-- INHOUSE REQUEST 010: fixed project categories, explicit per-project sheet source,
-- paginated list RPCs, and lightweight team/project query support.
-- Safe to re-run.

-- The application now has exactly four visible project categories. Keep the
-- existing category table for backwards compatibility, but normalize the four
-- system categories and move any legacy/custom project assignment into Others.
insert into public.project_categories (name, slug, sort_order, sheet_mode, active)
values
  ('Inhouse', 'inhouse', 10, 'team_sheet_tab', true),
  ('Client', 'client', 20, 'own_sheet', true),
  ('On Page', 'onpage', 30, 'own_sheet', true),
  ('Others', 'others', 40, 'own_sheet', true)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    sheet_mode = excluded.sheet_mode,
    active = true,
    updated_at = now();

-- Legacy installations may have stored the old display name "Onpage".
update public.project_categories
set name = 'On Page', sort_order = 30, sheet_mode = 'own_sheet', active = true, updated_at = now()
where slug = 'onpage' and name <> 'On Page';

-- Projects should always belong to one of the four visible categories. Any
-- custom/legacy category remains in the table but its projects are moved to
-- Others so nothing disappears from the Projects screen.
update public.projects p
set category_id = c.id, updated_at = now()
from public.project_categories c
where c.slug = 'others'
  and (p.category_id is null or p.category_id not in (
    select id from public.project_categories where slug in ('inhouse', 'client', 'onpage', 'others')
  ));

-- Explicitly store where each project's Sheet data lives. This removes the
-- old implicit "category decides sheet" behavior while preserving legacy rows.
alter table public.projects add column if not exists sheet_source text;

do $$ begin
  alter table public.projects add constraint projects_sheet_source_check
    check (sheet_source in ('guest_post_anchor', 'own_sheet', 'none'));
exception when duplicate_object then null; end $$;

update public.projects
set sheet_source = case
  when coalesce(google_sheet_id, '') <> '' then 'own_sheet'
  when coalesce(guest_post_tab_name, '') <> '' then 'guest_post_anchor'
  else 'none'
end
where sheet_source is null;

alter table public.projects alter column sheet_source set default 'guest_post_anchor';
alter table public.projects alter column sheet_source set not null;

create index if not exists projects_category_source_active_idx
  on public.projects(category_id, sheet_source, active, name);

-- Project detail pages are paginated instead of loading an entire project's
-- history on every navigation.
create index if not exists project_sites_project_created_active_idx
  on public.project_sites(project_id, created_at desc)
  where archived_at is null;

create index if not exists requests_project_created_active_idx
  on public.requests(project_id, created_at desc)
  where deleted_at is null;

-- Fast, server-side All Requests page. Migration 008 adds the indexed
-- requests.search_document field used below.
create or replace function public.get_all_requests_page(
  p_query text default null,
  p_project_id uuid default null,
  p_status text default null,
  p_incomplete boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  project_id uuid,
  sub_project text,
  target_url text,
  anchor text,
  approved_site text,
  placement_page text,
  shared_with text,
  priority text,
  assign_to text,
  deadline date,
  status text,
  team_tab text,
  team_row integer,
  sync_state text,
  sync_error text,
  created_by_name text,
  created_by_email text,
  source text,
  sheet_flag text,
  created_at timestamptz,
  project_name text,
  project_slug text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g') as query_key
  )
  select r.id, r.project_id, r.sub_project, r.target_url, r.anchor, r.approved_site,
         r.placement_page, r.shared_with, r.priority, r.assign_to, r.deadline, r.status,
         r.team_tab, r.team_row, r.sync_state, r.sync_error, r.created_by_name,
         r.created_by_email, r.source, r.sheet_flag, r.created_at,
         p.name, p.slug, count(*) over() as total_count
  from requests r
  join projects p on p.id = r.project_id
  cross join params q
  where r.deleted_at is null
    and (p_project_id is null or r.project_id = p_project_id)
    and (coalesce(p_status, '') = '' or r.status = p_status)
    and (not p_incomplete or nullif(btrim(coalesce(r.placement_page, '')), '') is null
      or nullif(btrim(coalesce(r.target_url, '')), '') is null
      or nullif(btrim(coalesce(r.anchor, '')), '') is null
      or nullif(btrim(coalesce(r.assign_to, '')), '') is null
      or r.deadline is null)
    and (q.query_key = '' or r.search_document like '%' || q.query_key || '%')
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.get_all_requests_page(text, uuid, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.get_all_requests_page(text, uuid, text, boolean, integer, integer) to service_role;

create or replace function public.get_project_sites_page(
  p_project_id uuid,
  p_query text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  project_id uuid,
  request_id uuid,
  website text,
  opportunity text,
  anchor text,
  dr integer,
  traffic bigint,
  status text,
  note text,
  team_row integer,
  created_by_email text,
  created_at timestamptz,
  sheet_flag text,
  target_url text,
  assign_to text,
  deadline date,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      ps.id, ps.project_id, ps.request_id, ps.website, ps.opportunity, ps.anchor,
      ps.dr, ps.traffic, ps.status, ps.note, ps.team_row, ps.created_by_email, ps.created_at,
      r.sheet_flag, r.target_url, r.assign_to, r.deadline
    from project_sites ps
    left join requests r on r.id = ps.request_id
    where ps.project_id = p_project_id
      and ps.archived_at is null
      and (coalesce(p_status, '') = '' or ps.status = p_status)
      and (
        coalesce(p_query, '') = ''
        or lower(coalesce(ps.website, '') || ' ' || coalesce(ps.opportunity, '') || ' ' || coalesce(ps.anchor, '') || ' ' || coalesce(ps.note, '')) like '%' || lower(p_query) || '%'
      )
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.get_project_sites_page(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_project_sites_page(uuid, text, text, integer, integer) to service_role;

-- Team page counts are aggregated in Postgres instead of loading every request
-- into Node and filtering once per user.
create or replace function public.get_team_admin_request_summary(p_today date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select distinct u.id as user_id, r.id as request_id, r.status, r.deadline
    from users u
    join requests r on r.deleted_at is null
      and (
        r.assigned_user_id = u.id
        or (nullif(btrim(u.sheet_name), '') is not null and lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(u.sheet_name)))
      )
  ),
  counts as (
    select user_id,
      count(*)::integer as assigned,
      count(*) filter (where status = 'Live')::integer as live,
      count(*) filter (where status = 'Request shared')::integer as pending,
      count(*) filter (where status = 'Rejected')::integer as rejected,
      count(*) filter (where status = 'Request shared' and deadline is not null and deadline < p_today)::integer as overdue
    from matched
    group by user_id
  ),
  historical as (
    select btrim(assign_to) as name, count(*)::integer as rows
    from requests
    where deleted_at is null and assign_to is not null and btrim(assign_to) <> ''
    group by btrim(assign_to)
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_agg(to_jsonb(c)) from counts c), '[]'::jsonb),
    'historical', coalesce((select jsonb_agg(to_jsonb(h) order by h.rows desc, h.name asc) from historical h), '[]'::jsonb)
  );
$$;

revoke execute on function public.get_team_admin_request_summary(date) from public, anon, authenticated;
grant execute on function public.get_team_admin_request_summary(date) to service_role;

create index if not exists requests_shared_with_lower_idx
  on public.requests(lower(btrim(shared_with)))
  where deleted_at is null and shared_with is not null and btrim(shared_with) <> '';

create or replace function public.get_request_autocomplete_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'sharedWith', coalesce((select jsonb_agg(value order by value) from (select distinct btrim(shared_with) as value from requests where deleted_at is null and shared_with is not null and btrim(shared_with) <> '') x), '[]'::jsonb),
    'assignTo', coalesce((select jsonb_agg(name order by name) from team_names where active = true), '[]'::jsonb)
  );
$$;

revoke execute on function public.get_request_autocomplete_options() from public, anon, authenticated;
grant execute on function public.get_request_autocomplete_options() to service_role;

create or replace function public.normalize_project_site_host(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select split_part(
    split_part(
      split_part(
        regexp_replace(
          split_part(regexp_replace(lower(btrim(coalesce(p_value, ''))), '^[a-z][a-z0-9+.-]*://', ''), '/', 1),
           '^www\.' , ''
        ),
        '?', 1
      ),
      '#', 1
    ),
    ':', 1
  );
$$;

create index if not exists project_sites_host_idx
  on public.project_sites(public.normalize_project_site_host(website))
  where archived_at is null;

create or replace function public.scan_project_sites_by_host(p_host text)
returns table(
  project_id uuid,
  project_name text,
  project_slug text,
  sheet_source text,
  status text,
  anchor text
)
language sql
stable
security definer
set search_path = public
as $$
  select ps.project_id,
         p.name,
         p.slug,
         p.sheet_source,
         coalesce(r.status, ps.status, 'Request shared') as status,
         coalesce(ps.anchor, '') as anchor
  from project_sites ps
  join projects p on p.id = ps.project_id
  left join requests r on r.id = ps.request_id and r.deleted_at is null
  where ps.archived_at is null
    and public.normalize_project_site_host(ps.website) = public.normalize_project_site_host(p_host)
  order by p.name, ps.anchor;
$$;

revoke execute on function public.scan_project_sites_by_host(text) from public, anon, authenticated;
grant execute on function public.scan_project_sites_by_host(text) to service_role;

-- Verification:
-- select name, slug, sort_order from public.project_categories order by sort_order;
-- select name, category_id, sheet_source from public.projects order by name;
-- select public.get_project_request_counts();
