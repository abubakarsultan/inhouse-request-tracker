-- INHOUSE REQUEST - canonical schema after Phase 1.
-- New installs can run this file directly. Existing installs should run
-- database/migrations/001_phase1_core.sql.

create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('admin', 'member');
exception when duplicate_object then null; end $$;

-- Legacy directory table retained for compatibility only. The Phase 1 app
-- never reads/writes it and does not use Supabase Auth.
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  avatar text,
  role user_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  outreach_project_name text,
  guest_post_tab_name text,
  google_sheet_id text,
  sync_enabled boolean not null default true,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  sub_project text,
  target_url text not null,
  anchor text not null,
  approved_site text not null,
  placement_page text,
  shared_with text,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  assign_to text,
  deadline date,
  status text not null default 'Request shared' check (status in ('Request shared', 'Live')),
  initial_status text not null default 'Request shared' check (initial_status in ('Request shared', 'Live')),
  live_date date,
  team_tab text,
  team_row integer,
  sync_state text not null default 'skipped' check (sync_state in ('synced', 'skipped', 'failed')),
  sync_error text,
  status_changed_by text,
  status_changed_at timestamptz,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  request_id uuid references requests(id) on delete set null,
  website text not null,
  opportunity text,
  anchor text,
  dr integer,
  traffic bigint,
  status text default 'Request shared',
  note text,
  team_row integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade,
  old_status text,
  new_status text,
  changed_by text,
  created_at timestamptz not null default now()
);

create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete set null,
  project_site_id uuid references project_sites(id) on delete set null,
  direction text not null,
  sheet_name text,
  sheet_row integer,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  file_name text,
  uploaded_by uuid,
  rows_imported integer not null default 0,
  errors jsonb,
  created_at timestamptz not null default now()
);

create table if not exists migration_audit (
  migration_key text not null,
  row_id uuid not null,
  field_name text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now(),
  primary key (migration_key, row_id, field_name)
);

create table if not exists sheet_write_locks (
  lock_key text primary key,
  owner_token uuid,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists projects_active_idx on projects(active);
create index if not exists requests_approved_site_lower_idx on requests (lower(approved_site));
create index if not exists requests_project_idx on requests(project_id);
create index if not exists requests_status_idx on requests(status);
create index if not exists requests_assign_to_idx on requests(assign_to);
create index if not exists requests_created_at_idx on requests(created_at);
create index if not exists project_sites_project_idx on project_sites(project_id);
create index if not exists project_sites_request_idx on project_sites(request_id);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_projects_updated on projects;
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();
drop trigger if exists trg_requests_updated on requests;
create trigger trg_requests_updated before update on requests
  for each row execute function set_updated_at();
drop trigger if exists trg_project_sites_updated on project_sites;
create trigger trg_project_sites_updated before update on project_sites
  for each row execute function set_updated_at();

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

alter table users enable row level security;
alter table projects enable row level security;
alter table project_sites enable row level security;
alter table requests enable row level security;
alter table request_logs enable row level security;
alter table sync_logs enable row level security;
alter table imports enable row level security;
alter table migration_audit enable row level security;
alter table sheet_write_locks enable row level security;

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
