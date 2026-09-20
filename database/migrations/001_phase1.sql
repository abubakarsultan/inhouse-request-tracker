-- 001_phase1.sql — INHOUSE REQUEST, Phase 1
-- Idempotent: safe to re-run. Run this whole file once in the Supabase SQL editor
-- (or `supabase db push`). See MASTER PROMPT sections 3 and 4 for the decisions
-- this migration implements.

-- ============================================================
-- 1) REQUESTS.status — drop the 3-value enum + forward-only trigger,
--    move to text + a 2-value CHECK constraint (Request shared / Live).
--    Removed -> Request shared (per decision in section 3). We keep a
--    log of which rows this affected in a one-off report table so it
--    shows up in the phase report; drop that table once you've read it.
-- ============================================================
drop trigger if exists trg_requests_status_guard on requests;
drop function if exists enforce_request_status_transition();

create table if not exists _migration_001_removed_status_rows as
  select id, status::text as old_status from requests where status::text = 'Removed';

alter table requests alter column status drop default;
alter table requests alter column status type text using status::text;

update requests set status = 'Request shared' where status = 'Request Shared';
update requests set status = 'Request shared' where status = 'Removed';

alter table requests alter column status set default 'Request shared';
do $$ begin
  alter table requests add constraint requests_status_check check (status in ('Request shared','Live'));
exception when duplicate_object then null; end $$;

drop type if exists request_status;

-- ============================================================
-- 2) REQUESTS.priority — drop the enum, move to text + CHECK.
--    Urgent -> High (Urgent is removed; High is the closest equivalent —
--    ASSUMPTION, flagged in the phase report).
-- ============================================================
alter table requests alter column priority drop default;
alter table requests alter column priority type text using priority::text;
update requests set priority = 'High' where priority = 'Urgent';
alter table requests alter column priority set default 'Medium';
do $$ begin
  alter table requests add constraint requests_priority_check check (priority in ('High','Medium','Low'));
exception when duplicate_object then null; end $$;

drop type if exists request_priority;

-- ============================================================
-- 3) REQUESTS — Assign To / Shared With become free text (no users FK).
--    Add assign_to text, backfill from the old assigned_to uuid FK by
--    joining users, then drop the FK column. shared_with is already text.
-- ============================================================
alter table requests add column if not exists assign_to text;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name='requests' and column_name='assigned_to') then
    update requests r set assign_to = coalesce(u.name, u.email)
    from users u where r.assigned_to = u.id and r.assign_to is null;
    alter table requests drop column assigned_to;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name='requests' and column_name='created_by' and data_type = 'uuid') then
    alter table requests alter column created_by drop not null;
  end if;
end $$;

-- ============================================================
-- 4) REQUESTS — new columns for the site-mirror workflow (4.2, 5, 6.1, 6.2)
-- ============================================================
alter table requests add column if not exists initial_status text;
alter table requests add column if not exists live_date date;
alter table requests add column if not exists team_tab text;
alter table requests add column if not exists team_row int;
alter table requests add column if not exists sync_state text not null default 'skipped';
do $$ begin
  alter table requests add constraint requests_sync_state_check check (sync_state in ('synced','skipped','failed'));
exception when duplicate_object then null; end $$;
alter table requests add column if not exists sync_error text;
alter table requests add column if not exists status_changed_by text;
alter table requests add column if not exists status_changed_at timestamptz;
alter table requests add column if not exists created_by_name text;

update requests set initial_status = status where initial_status is null;
update requests set live_date = created_at::date where status = 'Live' and live_date is null;

-- request_logs.changed_by: uuid -> text (no users table dependency)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='request_logs' and column_name='changed_by' and data_type='uuid'
  ) then
    alter table request_logs alter column changed_by type text using changed_by::text;
  end if;
end $$;

-- ============================================================
-- 5) PROJECT_SITES — link back to requests, keep team_row (mirrors the
--    team-sheet row, distinct from any legacy sheet_row usage).
-- ============================================================
alter table project_sites add column if not exists request_id uuid references requests(id) on delete set null;
alter table project_sites add column if not exists team_row int;
alter table project_sites alter column status set default 'Request shared';
create index if not exists project_sites_request_idx on project_sites(request_id);

-- ============================================================
-- 6) Indexes required by section 4.2
-- ============================================================
create index if not exists requests_approved_site_lower_idx on requests (lower(approved_site));
create index if not exists requests_assign_to_idx on requests(assign_to);
create index if not exists requests_created_at_idx on requests(created_at);
-- requests_project_idx / requests_status_idx already exist from the base schema.

-- ============================================================
-- 7) Sheet write lock — serializes "append at lastRow+2" across
--    concurrent requests for the same team-sheet tab (section 5).
--    A row is inserted to hold the lock and deleted when done; the
--    unique primary key on tab_name is the mutex.
-- ============================================================
create table if not exists sheet_write_locks(
  tab_name text primary key,
  locked_at timestamptz not null default now()
);

-- ============================================================
-- 8) PROJECTS — seed the 19 rows from the sheet's NAME_MAP (section 4.1).
--    Client name = outreach_project_name (exact string for the Outreach OS
--    CSV "Client" column). sync_enabled = true for all. google_sheet_id
--    stays null/unused; TEAM_SHEET_ID env var is the single source now.
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

-- Done. Read the report for: rows moved out of "Removed", Urgent->High
-- reassignments, and any assigned_to -> assign_to backfills.
