-- INHOUSE REQUEST — Rankviz internal outreach ops
-- Fresh-DB schema (matches database/migrations/*.sql applied in order).
-- Run this whole file once in the Supabase SQL editor (or `supabase db push`)
-- for a brand new project. For an existing DB, run the migrations instead.

create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('admin','member');
exception when duplicate_object then null; end $$;

-- NOTE: request_status / request_priority enums are intentionally NOT
-- created here. Phase 1 replaced both with `text` + CHECK constraints
-- (see decisions in the master prompt, section 3) so status/priority
-- values can never get stuck behind a forward-only enum transition again.

-- ============================================================
-- USERS  — kept but UNUSED (no login in this app). Left in place only
-- so nothing that references the table name breaks; no FK from requests
-- points here any more (see 4.2 — assign_to is free text).
-- ============================================================
create table if not exists users(
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  avatar text,
  role user_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS  (replaces the old NAME_MAP — section 4.1)
-- ============================================================
create table if not exists projects(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  outreach_project_name text,
  guest_post_tab_name text,
  google_sheet_id text,          -- unused now (TEAM_SHEET_ID env var is the single sheet); kept nullable
  sync_enabled boolean not null default false,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_active_idx on projects(active);

-- ============================================================
-- REQUESTS  (4.2) — DB is the source of truth; the team sheet is a mirror.
-- (Created before PROJECT_SITES because project_sites.request_id points here.)
-- ============================================================
create table if not exists requests(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  sub_project text,
  target_url text not null,
  anchor text not null,
  approved_site text not null,
  placement_page text,
  shared_with text,
  priority text not null default 'Medium' check (priority in ('High','Medium','Low')),
  assign_to text,
  deadline date,
  status text not null default 'Request shared' check (status in ('Request shared','Live')),
  initial_status text,
  live_date date,
  team_tab text,
  team_row int,
  sync_state text not null default 'skipped' check (sync_state in ('synced','skipped','failed')),
  sync_error text,
  status_changed_by text,
  status_changed_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_project_idx on requests(project_id);
create index if not exists requests_status_idx on requests(status);
create index if not exists requests_approved_site_lower_idx on requests (lower(approved_site));
create index if not exists requests_assign_to_idx on requests(assign_to);
create index if not exists requests_created_at_idx on requests(created_at);

-- ============================================================
-- PROJECT_SITES — the per-project opportunity/placement table (4.3),
-- mirrors each team-sheet tab (Website, Opportunity, Anchor, DR,
-- Traffic, Status, Note).
-- ============================================================
create table if not exists project_sites(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  request_id uuid references requests(id) on delete set null,
  website text not null,
  opportunity text,
  anchor text,
  dr int,
  traffic bigint,
  status text default 'Request shared',
  note text,
  sheet_row int,                 -- legacy, unused
  team_row int,                  -- row in the team-sheet tab this mirrors
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_sites_project_idx on project_sites(project_id);
create index if not exists project_sites_request_idx on project_sites(request_id);

-- Status history — changed_by is free text now (no login/users FK).
create table if not exists request_logs(
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade,
  old_status text,
  new_status text,
  changed_by text,
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
  uploaded_by uuid,
  rows_imported int not null default 0,
  errors jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SHEET_WRITE_LOCKS — mutex so two simultaneous saves never pick the
-- same "lastRow + 2" in the same team-sheet tab (section 5).
-- ============================================================
create table if not exists sheet_write_locks(
  tab_name text primary key,
  locked_at timestamptz not null default now()
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
-- ROW LEVEL SECURITY — left ENABLED with no policies for anon/authenticated,
-- which means: nobody using the anon key can read or write anything. The
-- app never uses the anon key (no login — see lib/session.ts); every DB
-- call goes through the server-side service-role client in
-- lib/supabase-admin.ts, which bypasses RLS entirely. This is defense in
-- depth in case NEXT_PUBLIC_SUPABASE_ANON_KEY is ever exposed to the browser.
-- ============================================================
alter table users enable row level security;
alter table projects enable row level security;
alter table project_sites enable row level security;
alter table requests enable row level security;
alter table request_logs enable row level security;
alter table sync_logs enable row level security;
alter table imports enable row level security;
alter table sheet_write_locks enable row level security;

-- ============================================================
-- SEED — the 19 projects from the sheet's NAME_MAP (section 4.1).
-- ============================================================
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
  outreach_project_name = excluded.outreach_project_name,
  guest_post_tab_name = excluded.guest_post_tab_name,
  sync_enabled = excluded.sync_enabled;
