-- INHOUSE REQUEST - canonical schema through Auth/Team Rollout.
-- New installs can run this file directly. Existing Phase 4 installs should run
-- database/migrations/004_auth_team_rollout.sql after 001-003.

create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('admin', 'member');
exception when duplicate_object then null; end $$;

-- Team directory. IDs mirror auth.users and are populated on Google sign-in.
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

-- Phase 2 normalized request search.
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
  select r.id, r.project_id, p.name, p.slug, r.sub_project, r.approved_site,
         r.anchor, r.assign_to, r.status, r.target_url, r.created_at, r.sync_state
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

-- Phase 4 robust Sheet -> site lookup and repair indexes.
create index if not exists requests_team_tab_row_idx on requests(team_tab, team_row);
create index if not exists project_sites_project_team_row_idx on project_sites(project_id, team_row);

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
    where r.team_tab = p_tab
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

-- Phase 5 auth/team rollout additions. Kept idempotent so this canonical schema
-- also works after earlier definitions above.
-- Phase 5: Google Auth + Rankviz team rollout + personal ownership + admin approval.
-- Safe to re-run.

create table if not exists team_names (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  badge_bg text not null default '#e8f0fe',
  badge_text text not null default '#174ea6',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_names_name_lower_unique on team_names (lower(name));

alter table users add column if not exists google_name text;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists sheet_name text;
alter table users add column if not exists account_status text not null default 'pending';
alter table users add column if not exists approved_by uuid;
alter table users add column if not exists approved_at timestamptz;
alter table users add column if not exists onboarding_completed boolean not null default false;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table users add constraint users_account_status_check check (account_status in ('pending', 'active', 'disabled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table users add constraint users_approved_by_fkey foreign key (approved_by) references users(id) on delete set null;
exception when duplicate_object then null; end $$;

create unique index if not exists users_sheet_name_lower_unique on users (lower(sheet_name)) where sheet_name is not null;
create index if not exists users_account_status_idx on users(account_status);
create index if not exists users_role_idx on users(role);

alter table requests add column if not exists assigned_user_id uuid;
alter table requests add column if not exists created_by_user_id uuid;
alter table requests add column if not exists created_by_email text;

do $$ begin
  alter table requests add constraint requests_assigned_user_id_fkey foreign key (assigned_user_id) references users(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table requests add constraint requests_created_by_user_id_fkey foreign key (created_by_user_id) references users(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists requests_assigned_user_idx on requests(assigned_user_id);
create index if not exists requests_created_by_user_idx on requests(created_by_user_id);
create index if not exists requests_created_by_email_lower_idx on requests(lower(created_by_email));

alter table project_sites add column if not exists owner_user_id uuid;
alter table project_sites add column if not exists created_by_user_id uuid;
alter table project_sites add column if not exists created_by_email text;

do $$ begin
  alter table project_sites add constraint project_sites_owner_user_id_fkey foreign key (owner_user_id) references users(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_sites add constraint project_sites_created_by_user_id_fkey foreign key (created_by_user_id) references users(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists project_sites_owner_user_idx on project_sites(owner_user_id);
create index if not exists project_sites_created_by_email_lower_idx on project_sites(lower(created_by_email));

-- Seed the names supplied from the current Guest Post Anchor team list.
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


-- Also discover names already present in imported/request history so a full-team
-- rollout does not require code edits before first login. Column G is the
-- existing assignee/note field in the Guest Post Anchor mirror.
with historical_names as (
  select btrim(assign_to) as name from requests where btrim(coalesce(assign_to, '')) <> ''
  union
  select btrim(note) as name from project_sites where btrim(coalesce(note, '')) <> ''
)
insert into team_names (name, badge_bg, badge_text, active)
select name, '#e8f0fe', '#174ea6', true
from historical_names
where name is not null and name <> ''
on conflict do nothing;

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
  where lower(btrim(coalesce(assign_to, ''))) = lower(btrim(v_sheet_name))
    and (assigned_user_id is null or assigned_user_id = p_user_id);
  get diagnostics v_requests = row_count;

  update project_sites
  set owner_user_id = p_user_id
  where lower(btrim(coalesce(note, ''))) = lower(btrim(v_sheet_name))
    and (owner_user_id is null or owner_user_id = p_user_id);
  get diagnostics v_sites = row_count;

  return jsonb_build_object('requests', v_requests, 'project_sites', v_sites);
end;
$$;

revoke execute on function link_user_sheet_history(uuid) from public, anon, authenticated;
grant execute on function link_user_sheet_history(uuid) to service_role;

create or replace function search_requests_for_user(
  p_query text,
  p_user_id uuid,
  p_sheet_name text,
  p_limit integer default 101
)
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
  select r.id, r.project_id, p.name, p.slug, r.sub_project, r.approved_site,
         r.anchor, r.assign_to, r.status, r.target_url, r.created_at, r.sync_state
  from requests r
  join projects p on p.id = r.project_id
  cross join q
  where length(q.key) >= 2
    and (r.assigned_user_id = p_user_id or lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(coalesce(p_sheet_name, ''))))
    and regexp_replace(
      lower(concat_ws(' | ', p.name, r.sub_project, r.approved_site, r.anchor, r.assign_to, r.status, r.target_url)),
      '[^a-z0-9]', '', 'g'
    ) like '%' || q.key || '%'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 101));
$$;

revoke execute on function search_requests_for_user(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function search_requests_for_user(text, uuid, text, integer) to service_role;

-- Optional Supabase Authentication > Hooks > Before User Created hook.
-- Configure this function in the Supabase dashboard for a database-level
-- block before non-Rankviz auth users are created.
create or replace function public.hook_restrict_rankviz_signup(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email text;
  domain text;
  provider text;
begin
  email := lower(coalesce(event->'user'->>'email', ''));
  domain := split_part(email, '@', 2);
  provider := lower(coalesce(event->'user'->'app_metadata'->>'provider', ''));
  if provider <> 'google' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Continue with Google is required.',
        'http_code', 403
      )
    );
  end if;
  if domain <> 'rankviz.com' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Only @rankviz.com Google accounts can sign up.',
        'http_code', 403
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_restrict_rankviz_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_rankviz_signup(jsonb) from authenticated, anon, public;

alter table team_names enable row level security;

drop trigger if exists trg_users_updated on users;
create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_team_names_updated on team_names;
create trigger trg_team_names_updated before update on team_names
  for each row execute function set_updated_at();

-- Final V2 workflow upgrade
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

-- Phase 6: My Requests UX + performance
-- Safe to re-run. Adds active-request indexes and service-role RPCs that avoid
-- loading an entire member history on dashboard / My Requests navigation.

create index if not exists requests_assigned_user_created_active_idx
  on requests (assigned_user_id, created_at desc)
  where deleted_at is null;

create index if not exists requests_assigned_user_status_active_idx
  on requests (assigned_user_id, status)
  where deleted_at is null;

create index if not exists requests_assigned_user_deadline_active_idx
  on requests (assigned_user_id, deadline)
  where deleted_at is null;

create index if not exists requests_assign_to_lower_created_active_idx
  on requests ((lower(btrim(coalesce(assign_to, '')))), created_at desc)
  where deleted_at is null;

create index if not exists requests_project_status_created_active_idx
  on requests (project_id, status, created_at desc)
  where deleted_at is null;

create or replace function get_member_dashboard(
  p_user_id uuid,
  p_sheet_name text,
  p_today date,
  p_upcoming_end date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with base as (
    select
      r.id,
      r.project_id,
      p.name as project_name,
      p.slug as project_slug,
      r.approved_site,
      r.anchor,
      r.target_url,
      r.source,
      r.priority,
      r.deadline,
      r.status,
      r.sync_state,
      r.created_at
    from requests r
    join projects p on p.id = r.project_id
    where r.deleted_at is null
      and (
        r.assigned_user_id = p_user_id
        or (
          coalesce(btrim(p_sheet_name), '') <> ''
          and lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(p_sheet_name))
        )
      )
  ),
  summary as (
    select
      count(*)::integer as assigned,
      (count(*) filter (where status = 'Live'))::integer as live,
      (count(*) filter (where status = 'Request shared'))::integer as pending,
      (count(*) filter (where status = 'Rejected'))::integer as rejected,
      (count(*) filter (where status = 'Request shared' and deadline is not null and deadline < p_today))::integer as overdue
    from base
  ),
  upcoming as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
    from (
      select id, project_id, project_name, project_slug, approved_site, anchor, target_url,
             source, priority, deadline, status, sync_state, created_at
      from base
      where status = 'Request shared'
        and deadline is not null
        and deadline >= p_today
        and deadline <= p_upcoming_end
      order by deadline asc, created_at desc
      limit 10
    ) x
  ),
  recent as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
    from (
      select id, project_id, project_name, project_slug, approved_site, anchor, target_url,
             source, priority, deadline, status, sync_state, created_at
      from base
      order by created_at desc
      limit 8
    ) x
  ),
  breakdown as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
    from (
      select project_name as project,
             count(*)::integer as total,
             (count(*) filter (where status = 'Live'))::integer as live,
             (count(*) filter (where status = 'Request shared'))::integer as pending,
             (count(*) filter (where status = 'Rejected'))::integer as rejected
      from base
      group by project_id, project_name
      order by count(*) desc, project_name asc
    ) x
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'assigned', summary.assigned,
      'live', summary.live,
      'pending', summary.pending,
      'rejected', summary.rejected,
      'overdue', summary.overdue
    ),
    'upcoming', upcoming.rows,
    'recent', recent.rows,
    'breakdown', breakdown.rows
  )
  from summary, upcoming, recent, breakdown;
$$;

revoke execute on function get_member_dashboard(uuid, text, date, date) from public, anon, authenticated;
grant execute on function get_member_dashboard(uuid, text, date, date) to service_role;

create or replace function get_member_requests_page(
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
    select regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g') as query_key
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
      and (
        q.query_key = ''
        or regexp_replace(
          lower(concat_ws(' | ', p.name, r.approved_site, r.anchor, r.target_url, r.placement_page, r.priority, r.status)),
          '[^a-z0-9]', '', 'g'
        ) like '%' || q.query_key || '%'
      )
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

revoke execute on function get_member_requests_page(uuid, text, text, uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function get_member_requests_page(uuid, text, text, uuid, text, text, text, text, text, integer, integer) to service_role;
create or replace function get_admin_dashboard(
  p_month_start timestamptz,
  p_month_end timestamptz,
  p_live_since date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with base as (
    select r.*, p.name as project_name, p.slug as project_slug
    from requests r
    left join projects p on p.id = r.project_id
    where r.deleted_at is null
  ),
  stats as (
    select
      count(*)::integer as total,
      (count(*) filter (where status = 'Live'))::integer as live,
      (count(*) filter (where status = 'Request shared'))::integer as pending,
      (count(*) filter (where status = 'Rejected'))::integer as rejected,
      (count(*) filter (where sync_state = 'failed'))::integer as failed_sync,
      (count(*) filter (where created_at >= p_month_start and created_at < p_month_end))::integer as this_month
    from base
  ),
  recent as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select id, created_at, approved_site, assign_to, status, live_date, sync_state, sync_error, project_name, project_slug
      from base order by created_at desc limit 8
    ) x
  ),
  became_live as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select id, created_at, approved_site, assign_to, status, live_date, sync_state, sync_error, project_name, project_slug
      from base where live_date >= p_live_since order by live_date desc limit 50
    ) x
  ),
  failed as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select id, approved_site, anchor, sync_error, updated_at, project_name, project_slug
      from base where sync_state = 'failed' order by updated_at desc limit 50
    ) x
  ),
  breakdown as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select p.id, p.name, p.slug,
             count(b.id)::integer as total,
             (count(b.id) filter (where b.status = 'Live'))::integer as live,
             (count(b.id) filter (where b.status = 'Request shared'))::integer as pending,
             (count(b.id) filter (where b.status = 'Rejected'))::integer as rejected
      from projects p
      left join base b on b.project_id = p.id
      group by p.id, p.name, p.slug
      order by p.name
    ) x
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'total', stats.total,
      'live', stats.live,
      'pending', stats.pending,
      'rejected', stats.rejected,
      'failedSync', stats.failed_sync,
      'thisMonth', stats.this_month
    ),
    'recent', recent.rows,
    'becameLive', became_live.rows,
    'failed', failed.rows,
    'breakdown', breakdown.rows
  )
  from stats, recent, became_live, failed, breakdown;
$$;

revoke execute on function get_admin_dashboard(timestamptz, timestamptz, date) from public, anon, authenticated;
grant execute on function get_admin_dashboard(timestamptz, timestamptz, date) to service_role;

create or replace function get_admin_team_attention()
returns jsonb
language sql
stable
set search_path = public
as $$
  with roster as (
    select lower(btrim(name)) as key from team_names where active = true
  ),
  invalid as (
    select distinct btrim(r.assign_to) as label
    from requests r
    where r.deleted_at is null
      and r.assign_to is not null
      and btrim(r.assign_to) <> ''
      and lower(btrim(r.assign_to)) not in (select key from roster)
  )
  select jsonb_build_object(
    'pendingApprovals', (select count(*)::integer from users where account_status = 'pending'),
    'activeMembers', (select count(*)::integer from users where account_status = 'active'),
    'invalidAssignments', (select count(*)::integer from invalid),
    'invalidLabels', coalesce((select jsonb_agg(label order by label) from invalid), '[]'::jsonb)
  );
$$;

revoke execute on function get_admin_team_attention() from public, anon, authenticated;
grant execute on function get_admin_team_attention() to service_role;
-- INHOUSE REQUEST upgrade 009: categories, per-project sheet settings, request flags, viewer role audit and query support.
-- Safe to re-run; does not delete or rewrite request/project data beyond category backfill.

create table if not exists public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  sheet_mode text not null check (sheet_mode in ('team_sheet_tab','own_sheet')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists project_categories_name_lower_uq on public.project_categories (lower(name));
create unique index if not exists project_categories_slug_uq on public.project_categories (slug);

insert into public.project_categories (name, slug, sort_order, sheet_mode, active)
select v.name, v.slug, v.sort_order, v.sheet_mode, true
from (values
  ('Inhouse','inhouse',10,'team_sheet_tab'),
  ('Client','client',20,'own_sheet'),
  ('Onpage','onpage',30,'own_sheet')
) as v(name,slug,sort_order,sheet_mode)
where not exists (select 1 from public.project_categories c where lower(c.name)=lower(v.name));

alter table public.projects add column if not exists category_id uuid;
alter table public.projects add column if not exists sheet_tab_name text;
alter table public.projects add column if not exists sheet_column_config jsonb not null default '{}'::jsonb;
alter table public.projects add column if not exists sheet_share_emails text[] not null default '{}'::text[];

update public.projects set sheet_tab_name = guest_post_tab_name
where sheet_tab_name is null and guest_post_tab_name is not null;
update public.projects p set category_id = c.id
from public.project_categories c
where p.category_id is null and lower(c.name)='inhouse';

-- If a legacy installation somehow has no Inhouse category, seed it before enforcing NOT NULL.
insert into public.project_categories(name,slug,sort_order,sheet_mode,active)
select 'Inhouse','inhouse',10,'team_sheet_tab',true
where not exists (select 1 from public.project_categories where lower(name)='inhouse');
update public.projects p set category_id = c.id
from public.project_categories c
where p.category_id is null and lower(c.name)='inhouse';

alter table public.projects alter column category_id set not null;
do $$ begin
  alter table public.projects add constraint projects_category_id_fkey
    foreign key (category_id) references public.project_categories(id) on delete restrict;
exception when duplicate_object then null; end $$;
create index if not exists projects_category_active_idx on public.projects(category_id, active, name);

alter table public.requests add column if not exists sheet_flag text;
alter table public.requests add column if not exists sheet_flag_at timestamptz;
do $$ begin
  alter table public.requests add constraint requests_sheet_flag_check
    check (sheet_flag is null or sheet_flag in ('Removed'));
exception when duplicate_object then null; end $$;
create index if not exists requests_sheet_flag_idx on public.requests(sheet_flag) where sheet_flag is not null;
create index if not exists requests_project_status_created_idx on public.requests(project_id, status, created_at desc) where deleted_at is null;
create index if not exists project_sites_project_status_idx on public.project_sites(project_id, status);

-- Existing role is an enum in canonical schema. Add viewer without changing existing roles.
alter type public.user_role add value if not exists 'viewer';

create table if not exists public.user_role_audit (
  id uuid primary key default gen_random_uuid(),
  changed_user_id uuid not null references public.users(id) on delete cascade,
  changed_by_user_id uuid references public.users(id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_role_audit_changed_user_idx on public.user_role_audit(changed_user_id, created_at desc);
create index if not exists user_role_audit_changed_by_idx on public.user_role_audit(changed_by_user_id, created_at desc);

create or replace function public.get_project_request_counts()
returns table(project_id uuid, request_count bigint, live_count bigint, pending_count bigint, rejected_count bigint, removed_count bigint)
language sql stable security definer set search_path=public as $$
  select p.id,
    count(r.id) filter (where r.deleted_at is null),
    count(r.id) filter (where r.deleted_at is null and r.status='Live'),
    count(r.id) filter (where r.deleted_at is null and r.status='Request shared'),
    count(r.id) filter (where r.deleted_at is null and r.status='Rejected'),
    count(r.id) filter (where r.deleted_at is null and r.sheet_flag='Removed')
  from public.projects p left join public.requests r on r.project_id=p.id
  group by p.id;
$$;
revoke all on function public.get_project_request_counts() from public, anon, authenticated;
grant execute on function public.get_project_request_counts() to service_role;

alter table public.project_categories enable row level security;
drop policy if exists project_categories_read_active on public.project_categories;
create policy project_categories_read_active on public.project_categories for select to authenticated
  using (active = true or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists project_categories_admin_insert on public.project_categories;
create policy project_categories_admin_insert on public.project_categories for insert to authenticated
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists project_categories_admin_update on public.project_categories;
create policy project_categories_admin_update on public.project_categories for update to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

alter table public.user_role_audit enable row level security;
drop policy if exists user_role_audit_admin_read on public.user_role_audit;
create policy user_role_audit_admin_read on public.user_role_audit for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop trigger if exists trg_project_categories_updated on public.project_categories;
create trigger trg_project_categories_updated before update on public.project_categories
  for each row execute function public.set_updated_at();

-- Verification queries (run after this migration):
-- select name, slug, sheet_mode from public.project_categories order by sort_order;
-- select count(*) as projects_without_category from public.projects where category_id is null;
-- select column_name from information_schema.columns where table_schema='public' and table_name='requests' and column_name in ('sheet_flag','sheet_flag_at');
-- select unnest(enum_range(null::public.user_role)) as role;
<<<<<<< HEAD


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
=======
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
