-- INHOUSE REQUEST — Rankviz internal outreach ops
-- Run this whole file once in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('admin','member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('Request Shared','Live','Removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_priority as enum ('Low','Medium','High','Urgent');
exception when duplicate_object then null; end $$;

-- ============================================================
-- USERS  (mirrors auth.users; row is created by the auth callback
-- the first time someone signs in with Google)
-- ============================================================
create table if not exists users(
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  avatar text,
  role user_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS  (replaces the old NAME_MAP)
-- ============================================================
create table if not exists projects(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  outreach_project_name text,
  guest_post_tab_name text,
  google_sheet_id text,          -- the Guest Post Anchor spreadsheet ID for this project
  sync_enabled boolean not null default false,
  active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_active_idx on projects(active);

-- ============================================================
-- PROJECT_SITES  — the per-project opportunity/placement table shown
-- on /projects/[slug] (Website, Opportunity, Anchor, DR, Traffic,
-- Status, Note). This is what the Guest Post Anchor sheet mirrors and
-- what the CSV/XLSX importer writes into. Not explicitly named in the
-- original spec's table list, but required by the "Project page" and
-- "Import system" sections, so it is added here.
-- ============================================================
create table if not exists project_sites(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  website text not null,
  opportunity text,
  anchor text,
  dr int,
  traffic bigint,
  status text default 'Pending',
  note text,
  sheet_row int,                 -- last known row number in the Guest Post Anchor sheet
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_sites_project_idx on project_sites(project_id);

-- ============================================================
-- REQUESTS
-- ============================================================
create table if not exists requests(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  sub_project text,
  target_url text not null,
  anchor text not null,
  approved_site text not null,
  placement_page text,
  priority request_priority default 'Medium',
  assigned_to uuid references users(id),
  status request_status not null default 'Request Shared',
  deadline date,
  shared_with text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_project_idx on requests(project_id);
create index if not exists requests_status_idx on requests(status);

-- Status history (kept from the previous schema, referenced by services/requests.ts)
create table if not exists request_logs(
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade,
  old_status text,
  new_status text,
  changed_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- SYNC_LOGS — Google Sheet sync history (both directions)
-- ============================================================
create table if not exists sync_logs(
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete set null,
  project_site_id uuid references project_sites(id) on delete set null,
  direction text not null,        -- 'to_sheet' | 'from_sheet'
  sheet_name text,
  sheet_row int,
  status text not null,           -- 'queued' | 'success' | 'skipped' | 'error'
  detail text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- IMPORTS
-- ============================================================
create table if not exists imports(
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  file_name text,
  uploaded_by uuid references users(id),
  rows_imported int not null default 0,
  errors jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
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

-- ============================================================
-- Enforce the status workflow AT THE DATABASE LEVEL so it can never
-- be bypassed, no matter which code path writes to the table:
--   Request Shared -> Live -> Removed   (forward only, no skipping)
-- ============================================================
create or replace function enforce_request_status_transition() returns trigger as $$
begin
  if TG_OP = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'Request Shared' and new.status = 'Live' then
      -- ok
    elsif old.status = 'Live' and new.status = 'Removed' then
      -- ok
    else
      raise exception 'Invalid status transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_requests_status_guard on requests;
create trigger trg_requests_status_guard before update on requests
  for each row execute function enforce_request_status_transition();

-- ============================================================
-- ROW LEVEL SECURITY
-- Every table is only ever touched by users whose auth.uid() maps to
-- an active row in public.users with an @rankviz.com email (enforced
-- again here for defense-in-depth on top of the app-level check).
-- ============================================================
alter table users enable row level security;
alter table projects enable row level security;
alter table project_sites enable row level security;
alter table requests enable row level security;
alter table request_logs enable row level security;
alter table sync_logs enable row level security;
alter table imports enable row level security;

create or replace function is_active_rankviz_user() returns boolean as $$
  select exists(
    select 1 from users u
    where u.id = auth.uid() and u.active = true and u.email like '%@rankviz.com'
  );
$$ language sql stable;

create or replace function is_admin() returns boolean as $$
  select exists(
    select 1 from users u
    where u.id = auth.uid() and u.active = true and u.role = 'admin'
  );
$$ language sql stable;

-- users: everyone can read the directory (needed for "Assign To" pickers),
-- only admins can change roles/active state. Inserts happen via the
-- service-role key from the auth callback, not from the browser.
drop policy if exists users_select on users;
create policy users_select on users for select using (is_active_rankviz_user());
drop policy if exists users_update on users;
create policy users_update on users for update using (is_admin()) with check (is_admin());

-- projects: any signed-in rankviz user can read; only admins write.
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (is_active_rankviz_user());
drop policy if exists projects_write on projects;
create policy projects_write on projects for all using (is_admin()) with check (is_admin());

-- project_sites: any signed-in user can read/insert/update (day-to-day
-- data entry + import); only admins can delete.
drop policy if exists project_sites_select on project_sites;
create policy project_sites_select on project_sites for select using (is_active_rankviz_user());
drop policy if exists project_sites_write on project_sites;
create policy project_sites_write on project_sites for insert with check (is_active_rankviz_user());
drop policy if exists project_sites_update on project_sites;
create policy project_sites_update on project_sites for update using (is_active_rankviz_user());
drop policy if exists project_sites_delete on project_sites;
create policy project_sites_delete on project_sites for delete using (is_admin());

-- requests: any signed-in user can read/create; update allowed to any
-- signed-in user (the forward-only trigger above protects status
-- integrity regardless of who issues the update).
drop policy if exists requests_select on requests;
create policy requests_select on requests for select using (is_active_rankviz_user());
drop policy if exists requests_insert on requests;
create policy requests_insert on requests for insert with check (is_active_rankviz_user());
drop policy if exists requests_update on requests;
create policy requests_update on requests for update using (is_active_rankviz_user());
drop policy if exists requests_delete on requests;
create policy requests_delete on requests for delete using (is_admin());

-- logs are read-only from the client; written by the server using the
-- service-role key (which bypasses RLS entirely).
drop policy if exists request_logs_select on request_logs;
create policy request_logs_select on request_logs for select using (is_active_rankviz_user());
drop policy if exists sync_logs_select on sync_logs;
create policy sync_logs_select on sync_logs for select using (is_active_rankviz_user());

drop policy if exists imports_select on imports;
create policy imports_select on imports for select using (is_active_rankviz_user());
drop policy if exists imports_insert on imports;
create policy imports_insert on imports for insert with check (is_active_rankviz_user());
