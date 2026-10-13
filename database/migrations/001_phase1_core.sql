-- Phase 1 core migration for INHOUSE REQUEST.
-- Re-runnable: safe to execute more than once.

create extension if not exists "pgcrypto";

-- Keep a small audit trail for destructive vocabulary migrations so affected
-- request IDs can be reported after the migration is run.
create table if not exists migration_audit (
  migration_key text not null,
  row_id uuid not null,
  field_name text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now(),
  primary key (migration_key, row_id, field_name)
);

-- Remove the legacy auth/RLS policy layer. The app has no login and all DB
-- access is server-side through the service-role client.
drop policy if exists users_select on users;
drop policy if exists users_update on users;
drop policy if exists projects_select on projects;
drop policy if exists projects_write on projects;
drop policy if exists project_sites_select on project_sites;
drop policy if exists project_sites_write on project_sites;
drop policy if exists project_sites_update on project_sites;
drop policy if exists project_sites_delete on project_sites;
drop policy if exists requests_select on requests;
drop policy if exists requests_insert on requests;
drop policy if exists requests_update on requests;
drop policy if exists requests_delete on requests;
drop policy if exists request_logs_select on request_logs;
drop policy if exists sync_logs_select on sync_logs;
drop policy if exists imports_select on imports;
drop policy if exists imports_insert on imports;
drop function if exists is_active_rankviz_user();
drop function if exists is_admin();

-- Legacy status guard must be removed before statuses become reversible.
drop trigger if exists trg_requests_status_guard on requests;
drop function if exists enforce_request_status_transition();

-- Projects: one global TEAM_SHEET_ID is used now; keep google_sheet_id only
-- for backwards compatibility, nullable and unused.
alter table projects add column if not exists outreach_project_name text;
alter table projects add column if not exists guest_post_tab_name text;
alter table projects add column if not exists google_sheet_id text;
alter table projects add column if not exists sync_enabled boolean;
alter table projects alter column sync_enabled set default true;
update projects set sync_enabled = true where sync_enabled is null;
alter table projects alter column sync_enabled set not null;
alter table projects add column if not exists active boolean not null default true;
update projects set outreach_project_name = name where outreach_project_name is null or btrim(outreach_project_name) = '';

-- Requests: migrate enum-backed columns to text before dropping old enum types.
alter table requests alter column status drop default;
alter table requests alter column priority drop default;

insert into migration_audit (migration_key, row_id, field_name, old_value, new_value)
select '001_phase1_core', id, 'status', status::text, 'Request shared'
from requests
where status::text = 'Removed'
on conflict do nothing;

insert into migration_audit (migration_key, row_id, field_name, old_value, new_value)
select '001_phase1_core', id, 'priority', priority::text, 'High'
from requests
where priority::text = 'Urgent'
on conflict do nothing;

alter table requests
  alter column status type text
  using case
    when status::text in ('Request Shared', 'Request shared', 'Removed') then 'Request shared'
    when status::text = 'Live' then 'Live'
    else 'Request shared'
  end;

alter table requests
  alter column priority type text
  using case
    when priority::text = 'Urgent' then 'High'
    when priority::text in ('High', 'Medium', 'Low') then priority::text
    else 'Medium'
  end;

alter table requests alter column status set default 'Request shared';
alter table requests alter column status set not null;
alter table requests alter column priority set default 'Medium';
alter table requests alter column priority set not null;

-- Free-text ownership/contact fields.
alter table requests add column if not exists assign_to text;
alter table requests add column if not exists shared_with text;

-- Preserve old UUID assignee values as readable text when possible.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'requests' and column_name = 'assigned_to'
  ) then
    update requests r
    set assign_to = coalesce(nullif(u.name, ''), nullif(u.email, ''), r.assigned_to::text)
    from users u
    where r.assign_to is null and r.assigned_to = u.id;

    update requests
    set assign_to = assigned_to::text
    where assign_to is null and assigned_to is not null;

    alter table requests drop constraint if exists requests_assigned_to_fkey;
    alter table requests drop column if exists assigned_to;
  end if;
end $$;

-- Preserve the legacy created-by identity as text, then remove the auth FK.
alter table requests add column if not exists created_by_name text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'requests' and column_name = 'created_by'
  ) then
    update requests r
    set created_by_name = coalesce(nullif(u.name, ''), nullif(u.email, ''), r.created_by::text)
    from users u
    where r.created_by_name is null and r.created_by = u.id;

    update requests
    set created_by_name = created_by::text
    where created_by_name is null and created_by is not null;

    alter table requests drop constraint if exists requests_created_by_fkey;
    alter table requests drop column if exists created_by;
  end if;
end $$;

-- Mirror/sync metadata.
alter table requests add column if not exists initial_status text;
alter table requests add column if not exists live_date date;
alter table requests add column if not exists team_tab text;
alter table requests add column if not exists team_row integer;
alter table requests add column if not exists sync_state text;
alter table requests add column if not exists sync_error text;
alter table requests add column if not exists status_changed_by text;
alter table requests add column if not exists status_changed_at timestamptz;

update requests
set initial_status = case
  when initial_status in ('Request Shared', 'Request shared', 'Removed') then 'Request shared'
  when initial_status = 'Live' then 'Live'
  else status
end
where initial_status is null or initial_status not in ('Request shared', 'Live');

update requests
set sync_state = case when team_tab is not null and team_row is not null then 'synced' else 'skipped' end
where sync_state is null or sync_state not in ('synced', 'skipped', 'failed');

alter table requests alter column initial_status set default 'Request shared';
alter table requests alter column initial_status set not null;
alter table requests alter column sync_state set default 'skipped';
alter table requests alter column sync_state set not null;

alter table requests drop constraint if exists requests_status_check;
alter table requests add constraint requests_status_check
  check (status in ('Request shared', 'Live'));
alter table requests drop constraint if exists requests_initial_status_check;
alter table requests add constraint requests_initial_status_check
  check (initial_status in ('Request shared', 'Live'));
alter table requests drop constraint if exists requests_priority_check;
alter table requests add constraint requests_priority_check
  check (priority in ('High', 'Medium', 'Low'));
alter table requests drop constraint if exists requests_sync_state_check;
alter table requests add constraint requests_sync_state_check
  check (sync_state in ('synced', 'skipped', 'failed'));

-- Project sites link back to a request when the row was created by the app.
alter table project_sites add column if not exists request_id uuid references requests(id) on delete set null;
alter table project_sites add column if not exists team_row integer;
alter table project_sites alter column status set default 'Request shared';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_sites' and column_name = 'sheet_row'
  ) then
    update project_sites set team_row = coalesce(team_row, sheet_row);
    alter table project_sites drop column if exists sheet_row;
  end if;
end $$;

-- Request logs now record a free-text identity from the browser name picker.
alter table request_logs drop constraint if exists request_logs_changed_by_fkey;
alter table request_logs alter column changed_by type text using changed_by::text;

-- Remove remaining app-level FKs to the unused users table where present.
alter table projects drop constraint if exists projects_created_by_fkey;
alter table project_sites drop constraint if exists project_sites_created_by_fkey;
alter table imports drop constraint if exists imports_uploaded_by_fkey;

-- Canonical indexes.
create index if not exists requests_approved_site_lower_idx on requests (lower(approved_site));
create index if not exists requests_project_idx on requests(project_id);
create index if not exists requests_status_idx on requests(status);
create index if not exists requests_assign_to_idx on requests(assign_to);
create index if not exists requests_created_at_idx on requests(created_at);
create index if not exists project_sites_project_idx on project_sites(project_id);
create index if not exists project_sites_request_idx on project_sites(request_id);

-- Lease-based lock used to serialize team-sheet appends across serverless requests.
create table if not exists sheet_write_locks (
  lock_key text primary key,
  owner_token uuid,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function try_acquire_sheet_write_lock(
  p_lock_key text,
  p_owner_token uuid,
  p_ttl_seconds integer default 30
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  insert into sheet_write_locks(lock_key, owner_token, locked_until, updated_at)
  values (p_lock_key, p_owner_token, now() + make_interval(secs => greatest(p_ttl_seconds, 5)), now())
  on conflict (lock_key) do update
    set owner_token = excluded.owner_token,
        locked_until = excluded.locked_until,
        updated_at = now()
    where sheet_write_locks.locked_until is null
       or sheet_write_locks.locked_until < now()
       or sheet_write_locks.owner_token = excluded.owner_token;

  select owner_token = p_owner_token
  into acquired
  from sheet_write_locks
  where lock_key = p_lock_key;

  return coalesce(acquired, false);
end;
$$;

create or replace function release_sheet_write_lock(
  p_lock_key text,
  p_owner_token uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update sheet_write_locks
  set owner_token = null, locked_until = now(), updated_at = now()
  where lock_key = p_lock_key and owner_token = p_owner_token;
$$;

-- Old enum types are no longer used.
drop type if exists request_status;
drop type if exists request_priority;

-- Final no-login posture: keep RLS enabled. The service-role server client
-- bypasses it; there are intentionally no browser-access policies.
alter table users enable row level security;
alter table projects enable row level security;
alter table project_sites enable row level security;
alter table requests enable row level security;
alter table request_logs enable row level security;
alter table sync_logs enable row level security;
alter table imports enable row level security;
alter table migration_audit enable row level security;
alter table sheet_write_locks enable row level security;

-- Seed/repair the 19 current projects. Adding future projects happens in UI.
insert into projects (name, slug, outreach_project_name, guest_post_tab_name, sync_enabled, active)
values
  ('AIproductindex', 'aiproductindex', 'AIproductindex', 'Ai Product Index', true, true),
  ('Youtube Dislike Viewer', 'youtube-dislike-viewer', 'Youtube Dislike Viewer', 'youtubedislikeviewer', true, true),
  ('Randomsonggenerator', 'randomsonggenerator', 'Randomsonggenerator', 'randomsonggenerator', true, true),
  ('Rsd Calculator', 'rsd-calculator', 'Rsd Calculator', 'rsdcalculator Links', true, true),
  ('Minutemansecurityagency', 'minutemansecurityagency', 'Minutemansecurityagency', 'minutemansecurityagency', true, true),
  ('Deckbuildersandiego', 'deckbuildersandiego', 'Deckbuildersandiego', 'deckbuildersandiego', true, true),
  ('Deck Builder Seattle', 'deck-builder-seattle', 'Deck Builder Seattle', 'deckbuilderseattle.us', true, true),
  ('Mltograms Converter', 'mltograms-converter', 'Mltograms Converter', 'mltogramsconverter', true, true),
  ('Anonymousinstagramstoryviewer', 'anonymousinstagramstoryviewer', 'Anonymousinstagramstoryviewer', 'anonymousinstagramstoryviewer.com', true, true),
  ('Impostergamewordgenerator', 'impostergamewordgenerator', 'Impostergamewordgenerator', 'impostergamewordgenerator', true, true),
  ('Remainder Calculator', 'remainder-calculator', 'Remainder Calculator', 'remaindercalculator', true, true),
  ('Pestcontrolflagstaff', 'pestcontrolflagstaff', 'Pestcontrolflagstaff', 'pestcontrolflagstaff', true, true),
  ('Commercialplumbersacramento', 'commercialplumbersacramento', 'Commercialplumbersacramento', 'commercialplumbersacramento', true, true),
  ('Phoneticspellinggenerator', 'phoneticspellinggenerator', 'Phoneticspellinggenerator', 'phoneticspellinggenerator', true, true),
  ('Square Foot Calculator', 'square-foot-calculator', 'Square Foot Calculator', 'squarefootcalculator', true, true),
  ('Villainnamegenerator', 'villainnamegenerator', 'Villainnamegenerator', 'villainnamegenerator', true, true),
  ('Goatgestationcalculator', 'goatgestationcalculator', 'Goatgestationcalculator', 'goatgestationcalculator', true, true),
  ('Russiannamegenerator', 'russiannamegenerator', 'Russiannamegenerator', 'russiannamegenerator', true, true),
  ('Get Pro Links', 'get-pro-links', 'Get Pro Links', 'getprolinks', true, true)
on conflict (slug) do update set
  name = excluded.name,
  outreach_project_name = excluded.outreach_project_name,
  guest_post_tab_name = excluded.guest_post_tab_name,
  sync_enabled = excluded.sync_enabled,
  updated_at = now();

-- Exact duplicate finder using the sheet's normalization rule.
create or replace function find_request_duplicate(p_approved_site text, p_anchor text)
returns table(request_id uuid, created_at timestamptz, project_name text)
language sql
stable
set search_path = public
as $$
  select r.id, r.created_at, p.name
  from requests r
  join projects p on p.id = r.project_id
  where regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') =
        regexp_replace(lower(coalesce(p_approved_site, '')), '[^a-z0-9]', '', 'g')
    and regexp_replace(lower(coalesce(r.anchor, '')), '[^a-z0-9]', '', 'g') =
        regexp_replace(lower(coalesce(p_anchor, '')), '[^a-z0-9]', '', 'g')
  order by r.created_at asc
  limit 1;
$$;
