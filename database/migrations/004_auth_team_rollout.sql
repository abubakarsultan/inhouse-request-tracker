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
