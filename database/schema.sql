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
