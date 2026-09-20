-- Final V2 workflow upgrade: project/domain uniqueness, Rejected status,
-- editable/archivable requests, exact team roster, and legacy Sheet backfill.
-- Safe to re-run.

create or replace function normalize_project_domain(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '', 'i');
  v := regexp_replace(v, '^//', '');
  v := regexp_replace(v, '[/?#].*$', '');
  v := regexp_replace(v, ':[0-9]+$', '');
  v := regexp_replace(v, '^www\.', '');
  v := regexp_replace(v, '\.+$', '');
  return v;
end;
$$;

alter table requests add column if not exists deleted_at timestamptz;
alter table requests add column if not exists deleted_by uuid references users(id) on delete set null;
alter table requests add column if not exists deleted_by_email text;
alter table requests add column if not exists source text not null default 'app';
alter table requests add column if not exists imported_project_site_id uuid;

alter table project_sites add column if not exists source text not null default 'app';
alter table project_sites add column if not exists archived_at timestamptz;

-- A previous run may already have installed the future-write guard. Drop it
-- while the idempotent legacy backfill is replayed, then recreate it below.
drop trigger if exists trg_requests_project_domain_unique on requests;

alter table requests drop constraint if exists requests_status_check;
alter table requests add constraint requests_status_check
  check (status in ('Request shared', 'Live', 'Rejected'));
alter table requests drop constraint if exists requests_initial_status_check;
alter table requests add constraint requests_initial_status_check
  check (initial_status in ('Request shared', 'Live', 'Rejected'));

-- Keep the project mirror inside the same three-status vocabulary.
update project_sites
set status = case when status = 'Live' then 'Live' when status = 'Rejected' then 'Rejected' else 'Request shared' end;

do $$ begin
  alter table requests add constraint requests_source_check check (source in ('app', 'team_sheet', 'file_import'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_sites add constraint project_sites_source_check check (source in ('app', 'team_sheet', 'file_import'));
exception when duplicate_object then null; end $$;

create index if not exists requests_deleted_at_idx on requests(deleted_at);
create index if not exists requests_project_domain_lookup_idx on requests(project_id, lower(approved_site)) where deleted_at is null;
create index if not exists project_sites_project_website_lookup_idx on project_sites(project_id, lower(website)) where archived_at is null;
create index if not exists project_sites_archived_at_idx on project_sites(archived_at);
create unique index if not exists requests_imported_project_site_unique
  on requests(imported_project_site_id) where imported_project_site_id is not null;

create table if not exists request_change_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade,
  action text not null check (action in ('edit', 'archive', 'restore')),
  changed_by text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists request_change_logs_request_idx on request_change_logs(request_id, created_at desc);
alter table request_change_logs enable row level security;

-- Keep only the seven approved team names active. Historical labels remain as
-- inactive records so old data is not silently destroyed.
update team_names set active = false;
insert into team_names (name, badge_bg, badge_text, active)
values
  ('M.ATIF', '#7b4a2a', '#ffffff', true),
  ('Wasif', '#f6d0b2', '#7a3e13', true),
  ('Atif latif', '#d9f3dc', '#2f6f3b', true),
  ('Sohail Ahmad', '#dceeff', '#2c5f8f', true),
  ('Rizwan', '#1f5f9d', '#ffffff', true),
  ('Abubakar', '#e9d8f5', '#69408a', true),
  ('Zunnorain Ali', '#ffd8d8', '#9b2d2d', true)
on conflict do nothing;
update team_names set active = true where lower(name) in (
  'm.atif','wasif','atif latif','sohail ahmad','rizwan','abubakar','zunnorain ali'
);

-- Normalize the old person label requested by the team.
update requests set assign_to = 'Abubakar'
where lower(btrim(coalesce(assign_to, ''))) = 'abubakar sultan';
update project_sites set note = 'Abubakar'
where lower(btrim(coalesce(note, ''))) = 'abubakar sultan';

do $$
begin
  if exists (select 1 from users where lower(btrim(coalesce(sheet_name, ''))) = 'abubakar sultan')
     and not exists (select 1 from users where lower(btrim(coalesce(sheet_name, ''))) = 'abubakar') then
    update users set sheet_name = 'Abubakar'
    where lower(btrim(coalesce(sheet_name, ''))) = 'abubakar sultan';
  end if;
end $$;

-- Convert every legacy project_sites row into a first-class request exactly once.
-- Target URL is intentionally blank because the old team sheet did not contain it.
do $$
declare
  site record;
  new_request_id uuid;
  mapped_owner uuid;
  canonical_status text;
  tab_name text;
begin
  for site in
    select ps.*, p.guest_post_tab_name
    from project_sites ps
    join projects p on p.id = ps.project_id
    where ps.request_id is null
  loop
    select u.id into mapped_owner
    from users u
    where site.note is not null
      and lower(btrim(coalesce(u.sheet_name, ''))) = lower(btrim(site.note))
    limit 1;

    canonical_status := case
      when site.status = 'Live' then 'Live'
      when site.status = 'Rejected' then 'Rejected'
      else 'Request shared'
    end;
    tab_name := nullif(btrim(coalesce(site.guest_post_tab_name, '')), '');

    insert into requests (
      project_id, sub_project, target_url, anchor, approved_site, placement_page,
      shared_with, priority, assign_to, deadline, status, initial_status, live_date,
      team_tab, team_row, sync_state, sync_error, created_by_name, created_at, updated_at,
      assigned_user_id, created_by_user_id, created_by_email, source, imported_project_site_id
    ) values (
      site.project_id, null, '', coalesce(site.anchor, ''), site.website, site.opportunity,
      null, 'Medium', site.note, null, canonical_status, canonical_status, null,
      tab_name, site.team_row,
      case when tab_name is not null and site.team_row is not null then 'synced' else 'skipped' end,
      null, site.note, coalesce(site.created_at, now()), coalesce(site.updated_at, now()),
      coalesce(site.owner_user_id, mapped_owner), site.created_by_user_id, site.created_by_email,
      case when site.team_row is not null then 'team_sheet' else 'file_import' end, site.id
    )
    on conflict (imported_project_site_id) where imported_project_site_id is not null do nothing
    returning id into new_request_id;

    if new_request_id is null then
      select id into new_request_id from requests where imported_project_site_id = site.id limit 1;
    end if;

    if new_request_id is not null then
      update project_sites
      set request_id = new_request_id,
          owner_user_id = coalesce(owner_user_id, mapped_owner),
          source = case when team_row is not null then 'team_sheet' else 'file_import' end
      where id = site.id;
    end if;
  end loop;
end $$;

-- Project-scoped domain lookup. This is the canonical business-rule check:
-- one domain may appear only once inside a project, regardless of anchor text.
create or replace function find_project_domain_usage(
  p_project_id uuid,
  p_approved_site text,
  p_exclude_request_id uuid default null
)
returns table(
  request_id uuid,
  project_site_id uuid,
  approved_site text,
  anchor text,
  status text,
  assign_to text,
  created_at timestamptz,
  source text
)
language sql
stable
set search_path = public
as $$
  with host as (select normalize_project_domain(p_approved_site) as value),
  request_matches as (
    select r.id as request_id, ps.id as project_site_id, r.approved_site, r.anchor, r.status,
           r.assign_to, r.created_at, r.source, 1 as priority
    from requests r
    left join project_sites ps on ps.request_id = r.id
    cross join host h
    where r.project_id = p_project_id
      and r.deleted_at is null
      and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
      and length(h.value) > 0
      and normalize_project_domain(r.approved_site) = h.value
  ),
  unlinked_site_matches as (
    select null::uuid as request_id, ps.id as project_site_id, ps.website as approved_site,
           coalesce(ps.anchor, '') as anchor,
           case when ps.status in ('Live','Rejected') then ps.status else 'Request shared' end as status,
           ps.note as assign_to, ps.created_at,
           case when ps.team_row is not null then 'team_sheet' else 'file_import' end as source,
           2 as priority
    from project_sites ps
    cross join host h
    where ps.project_id = p_project_id
      and ps.request_id is null
      and ps.archived_at is null
      and length(h.value) > 0
      and normalize_project_domain(ps.website) = h.value
  )
  select request_id, project_site_id, approved_site, anchor, status, assign_to, created_at, source
  from (
    select * from request_matches
    union all
    select * from unlinked_site_matches
  ) x
  order by priority, created_at asc
  limit 25;
$$;

revoke execute on function find_project_domain_usage(uuid, text, uuid) from public, anon, authenticated;
grant execute on function find_project_domain_usage(uuid, text, uuid) to service_role;

-- Search functions now hide archived requests.
create or replace function search_requests(p_query text, p_limit integer default 101)
returns table(
  id uuid, project_id uuid, client text, project_slug text, sub_project text,
  approved_site text, anchor text, assign_to text, status text, target_url text,
  created_at timestamptz, sync_state text
)
language sql
stable
set search_path = public
as $$
  with q as (select regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g') as key)
  select r.id, r.project_id, p.name, p.slug, r.sub_project, r.approved_site,
         r.anchor, r.assign_to, r.status, r.target_url, r.created_at, r.sync_state
  from requests r
  join projects p on p.id = r.project_id
  cross join q
  where r.deleted_at is null
    and length(q.key) >= 2
    and regexp_replace(lower(concat_ws(' | ', p.name, r.sub_project, r.approved_site, r.anchor, r.assign_to, r.status, r.target_url)), '[^a-z0-9]', '', 'g') like '%' || q.key || '%'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 101));
$$;

create or replace function search_requests_for_user(
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
  with q as (select regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g') as key)
  select r.id, r.project_id, p.name, p.slug, r.sub_project, r.approved_site,
         r.anchor, r.assign_to, r.status, r.target_url, r.created_at, r.sync_state
  from requests r
  join projects p on p.id = r.project_id
  cross join q
  where r.deleted_at is null
    and length(q.key) >= 2
    and (r.assigned_user_id = p_user_id or lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(coalesce(p_sheet_name, ''))))
    and regexp_replace(lower(concat_ws(' | ', p.name, r.sub_project, r.approved_site, r.anchor, r.assign_to, r.status, r.target_url)), '[^a-z0-9]', '', 'g') like '%' || q.key || '%'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 101));
$$;

revoke execute on function search_requests(text, integer) from public, anon, authenticated;
grant execute on function search_requests(text, integer) to service_role;
revoke execute on function search_requests_for_user(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function search_requests_for_user(text, uuid, text, integer) to service_role;

-- Database-level protection against races: existing historical duplicates are
-- preserved, but any future insert/restore/domain change that would create a
-- second active domain inside the same project is rejected.
create or replace function enforce_project_domain_unique()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_host text;
begin
  if new.deleted_at is not null then return new; end if;
  v_host := normalize_project_domain(new.approved_site);
  if v_host = '' then return new; end if;
  if exists (
    select 1 from requests r
    where r.project_id = new.project_id
      and r.deleted_at is null
      and r.id <> new.id
      and normalize_project_domain(r.approved_site) = v_host
  ) then
    raise exception 'This website is already used in this project. Each project can use a website only once.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_requests_project_domain_unique on requests;
create trigger trg_requests_project_domain_unique
before insert or update of project_id, approved_site, deleted_at on requests
for each row execute function enforce_project_domain_unique();

-- User-history linking must ignore archived requests/sites.
create or replace function link_user_sheet_history(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sheet_name text;
  v_requests integer := 0;
  v_sites integer := 0;
begin
  select sheet_name into v_sheet_name from users where id = p_user_id;
  if v_sheet_name is null or btrim(v_sheet_name) = '' then
    raise exception 'User has no sheet_name mapping';
  end if;

  update requests
  set assigned_user_id = p_user_id
  where deleted_at is null
    and lower(btrim(coalesce(assign_to, ''))) = lower(btrim(v_sheet_name))
    and (assigned_user_id is null or assigned_user_id = p_user_id);
  get diagnostics v_requests = row_count;

  update project_sites
  set owner_user_id = p_user_id
  where archived_at is null
    and lower(btrim(coalesce(note, ''))) = lower(btrim(v_sheet_name))
    and (owner_user_id is null or owner_user_id = p_user_id);
  get diagnostics v_sites = row_count;

  return jsonb_build_object('requests', v_requests, 'project_sites', v_sites);
end;
$$;

revoke execute on function link_user_sheet_history(uuid) from public, anon, authenticated;
grant execute on function link_user_sheet_history(uuid) to service_role;

-- Sheet webhooks must never revive or mutate an archived request.
create or replace function find_request_from_sheet(
  p_tab text,
  p_website text,
  p_anchor text,
  p_row integer default null
)
returns table(request_id uuid, match_type text)
language sql
stable
set search_path = public
as $$
  with normalized as (
    select
      regexp_replace(lower(coalesce(p_website, '')), '[^a-z0-9]', '', 'g') as website_key,
      regexp_replace(lower(coalesce(p_anchor, '')), '[^a-z0-9]', '', 'g') as anchor_key
  ), candidates as (
    select r.id,
           case
             when regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key
              and regexp_replace(lower(coalesce(r.anchor, '')), '[^a-z0-9]', '', 'g') = n.anchor_key
             then 1
             when p_row is not null and r.team_row = p_row then 2
             else 9
           end as priority
    from requests r
    cross join normalized n
    where r.deleted_at is null
      and r.team_tab = p_tab
      and (
        (
          length(n.website_key) > 0 and length(n.anchor_key) > 0
          and regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key
          and regexp_replace(lower(coalesce(r.anchor, '')), '[^a-z0-9]', '', 'g') = n.anchor_key
        )
        or (p_row is not null and r.team_row = p_row)
      )
  )
  select id,
         case when priority = 1 then 'site_anchor' else 'row_fallback' end
  from candidates
  order by priority, id
  limit 1;
$$;

revoke execute on function find_request_from_sheet(text, text, text, integer) from public, anon, authenticated;
grant execute on function find_request_from_sheet(text, text, text, integer) to service_role;
