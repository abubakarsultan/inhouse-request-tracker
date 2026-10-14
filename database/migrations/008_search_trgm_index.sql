-- INHOUSE REQUEST 008: scalable normalized request search.
-- The previous draft attempted to index concat_ws(...) directly. PostgreSQL
-- marks concat_ws as STABLE, not IMMUTABLE, so that expression cannot be used
-- in an index. We store the normalized search document on requests instead.
-- Safe to re-run.

create extension if not exists pg_trgm;

alter table public.requests add column if not exists search_document text not null default '';

create or replace function public.normalize_search_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]', '', 'g');
$$;

create or replace function public.build_request_search_document(
  p_project_name text,
  p_sub_project text,
  p_approved_site text,
  p_anchor text,
  p_assign_to text,
  p_status text,
  p_target_url text,
  p_placement_page text,
  p_priority text
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.normalize_search_text(
    coalesce(p_project_name, '') || ' | ' ||
    coalesce(p_sub_project, '') || ' | ' ||
    coalesce(p_approved_site, '') || ' | ' ||
    coalesce(p_anchor, '') || ' | ' ||
    coalesce(p_assign_to, '') || ' | ' ||
    coalesce(p_status, '') || ' | ' ||
    coalesce(p_target_url, '') || ' | ' ||
    coalesce(p_placement_page, '') || ' | ' ||
    coalesce(p_priority, '')
  );
$$;

create or replace function public.refresh_request_search_document()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_name text;
begin
  select p.name into v_project_name from public.projects p where p.id = new.project_id;
  new.search_document := public.build_request_search_document(
    v_project_name,
    new.sub_project,
    new.approved_site,
    new.anchor,
    new.assign_to,
    new.status,
    new.target_url,
    new.placement_page,
    new.priority
  );
  return new;
end;
$$;

drop trigger if exists trg_requests_search_document on public.requests;
create trigger trg_requests_search_document
before insert or update of project_id, sub_project, approved_site, anchor, assign_to, status, target_url, placement_page, priority
on public.requests
for each row execute function public.refresh_request_search_document();

create or replace function public.refresh_project_request_search_documents()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.requests r
    set search_document = public.build_request_search_document(
      new.name, r.sub_project, r.approved_site, r.anchor, r.assign_to,
      r.status, r.target_url, r.placement_page, r.priority
    )
    where r.project_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_search_document on public.projects;
create trigger trg_projects_search_document
after update of name on public.projects
for each row execute function public.refresh_project_request_search_documents();

-- Backfill existing rows after the trigger is installed. This is idempotent.
update public.requests r
set search_document = public.build_request_search_document(
  p.name, r.sub_project, r.approved_site, r.anchor, r.assign_to,
  r.status, r.target_url, r.placement_page, r.priority
)
from public.projects p
where p.id = r.project_id;

create index if not exists requests_search_document_trgm_idx
  on public.requests using gin (search_document gin_trgm_ops)
  where deleted_at is null;

-- Search RPCs use the same stored normalized document as the index.
create or replace function public.search_requests(p_query text, p_limit integer default 101)
returns table(
  id uuid, project_id uuid, client text, project_slug text, sub_project text,
  approved_site text, anchor text, assign_to text, status text, target_url text,
  created_at timestamptz, sync_state text
)
language sql
stable
set search_path = public
as $$
  with q as (select public.normalize_search_text(coalesce(p_query, '')) as key)
  select r.id, r.project_id, p.name, p.slug, r.sub_project, r.approved_site,
         r.anchor, r.assign_to, r.status, r.target_url, r.created_at, r.sync_state
  from requests r
  join projects p on p.id = r.project_id
  cross join q
  where r.deleted_at is null
    and length(q.key) >= 2
    and r.search_document like '%' || q.key || '%'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 101));
$$;

create or replace function public.search_requests_for_user(
  p_query text, p_user_id uuid, p_sheet_name text, p_limit integer default 101
)
returns table(
  id uuid, project_id uuid, client text, project_slug text, sub_project text,
  approved_site text, anchor text, assign_to text, status text, target_url text,
  created_at timestamptz, sync_state text
)
language sql
stable
set search_path = public
as $$
  with q as (select public.normalize_search_text(coalesce(p_query, '')) as key)
  select r.id, r.project_id, p.name, p.slug, r.sub_project, r.approved_site,
         r.anchor, r.assign_to, r.status, r.target_url, r.created_at, r.sync_state
  from requests r
  join projects p on p.id = r.project_id
  cross join q
  where r.deleted_at is null
    and length(q.key) >= 2
    and (r.assigned_user_id = p_user_id or lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(coalesce(p_sheet_name, ''))))
    and r.search_document like '%' || q.key || '%'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 101));
$$;

revoke execute on function public.search_requests(text, integer) from public, anon, authenticated;
grant execute on function public.search_requests(text, integer) to service_role;
revoke execute on function public.search_requests_for_user(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_requests_for_user(text, uuid, text, integer) to service_role;

-- Recreate My Requests search with the indexed document while preserving all
-- existing filtering, sorting and pagination semantics.
create or replace function public.get_member_requests_page(
  p_user_id uuid,
  p_sheet_name text,
  p_query text default null,
  p_project_id uuid default null,
  p_status text default null,
  p_priority text default null,
  p_deadline_filter text default null,
  p_source text default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table(
  id uuid,
  project_id uuid,
  project_name text,
  project_slug text,
  approved_site text,
  anchor text,
  target_url text,
  placement_page text,
  source text,
  priority text,
  deadline date,
  status text,
  sync_state text,
  sync_error text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with params as (
    select public.normalize_search_text(coalesce(p_query, '')) as query_key
  ),
  filtered as (
    select
      r.id,
      r.project_id,
      p.name as project_name,
      p.slug as project_slug,
      r.approved_site,
      r.anchor,
      r.target_url,
      r.placement_page,
      r.source,
      r.priority,
      r.deadline,
      r.status,
      r.sync_state,
      r.sync_error,
      r.created_at
    from requests r
    join projects p on p.id = r.project_id
    cross join params q
    where r.deleted_at is null
      and (
        r.assigned_user_id = p_user_id
        or (
          coalesce(btrim(p_sheet_name), '') <> ''
          and lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(p_sheet_name))
        )
      )
      and (p_project_id is null or r.project_id = p_project_id)
      and (coalesce(p_status, '') = '' or r.status = p_status)
      and (coalesce(p_priority, '') = '' or r.priority = p_priority)
      and (
        coalesce(p_source, '') = ''
        or (p_source = 'app' and r.source = 'app')
        or (p_source = 'imported' and coalesce(r.source, 'app') <> 'app')
      )
      and (
        coalesce(p_deadline_filter, '') = ''
        or (p_deadline_filter = 'overdue' and r.status = 'Request shared' and r.deadline is not null and r.deadline < (now() at time zone 'Asia/Karachi')::date)
        or (p_deadline_filter = 'today' and r.status = 'Request shared' and r.deadline = (now() at time zone 'Asia/Karachi')::date)
        or (p_deadline_filter = 'next7' and r.status = 'Request shared' and r.deadline between (now() at time zone 'Asia/Karachi')::date and ((now() at time zone 'Asia/Karachi')::date + 6))
        or (p_deadline_filter = 'none' and r.deadline is null)
      )
      and (q.query_key = '' or r.search_document like '%' || q.query_key || '%')
  )
  select
    f.id, f.project_id, f.project_name, f.project_slug, f.approved_site, f.anchor,
    f.target_url, f.placement_page, f.source, f.priority, f.deadline, f.status,
    f.sync_state, f.sync_error, f.created_at, count(*) over() as total_count
  from filtered f
  order by
    case when p_sort = 'oldest' then f.created_at end asc,
    case when p_sort = 'deadline' then f.deadline end asc nulls last,
    case when p_sort = 'website' then lower(f.approved_site) end asc,
    case when p_sort = 'project' then lower(f.project_name) end asc,
    f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.get_member_requests_page(uuid, text, text, uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_member_requests_page(uuid, text, text, uuid, text, text, text, text, text, integer, integer) to service_role;

-- Search the same indexed document from the All Requests and project tools.
