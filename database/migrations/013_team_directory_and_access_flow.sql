-- INHOUSE REQUEST migration 013: directory-backed Rankviz accounts and safe OAuth hook.
-- Additive and repeatable.
create table if not exists public.team_directory (
  email text primary key,
  sheet_name text not null,
  role text not null default 'member' check (role in ('member','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_directory_email_lowercase check (email = lower(email))
);
create unique index if not exists team_directory_sheet_name_lower_unique on public.team_directory(lower(sheet_name)) where active;
alter table public.team_directory enable row level security;
-- No user-facing policies: service-role server access only.
insert into public.team_directory(email,sheet_name,role,active) values
 ('atiflatif@rankviz.com','Atif latif','member',true),
 ('rizwaniftikhar@rankviz.com','Rizwan','member',true),
 ('muhammadatif@rankviz.com','M.ATIF','member',true),
 ('sohailahmad@rankviz.com','Sohail Ahmad','member',true),
 ('zunnorainali@rankviz.com','Zunnorain Ali','member',true),
 ('wasif@rankviz.com','Wasif','member',true),
 ('abubakarsultan@rankviz.com','Abubakar','admin',true)
on conflict (email) do update set sheet_name=excluded.sheet_name, role=excluded.role, active=true, updated_at=now();

alter table public.projects add column if not exists sheet_owner_user_id uuid references public.users(id) on delete set null;
alter table public.projects add column if not exists tab_setup_state text not null default 'connected';
alter table public.projects add column if not exists tab_setup_error text;
create index if not exists projects_sheet_owner_user_idx on public.projects(sheet_owner_user_id);

-- Supabase Before User Created hook: an empty object allows signup. App-level auth callback
-- controls invitation/directory access; rejecting all other domains here breaks guest invitations.
create or replace function public.hook_restrict_rankviz_signup(event jsonb)
returns jsonb language plpgsql stable as $$
begin
  return '{}'::jsonb;
end;
$$;
grant execute on function public.hook_restrict_rankviz_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_rankviz_signup(jsonb) from authenticated, anon, public;

-- Verify after applying:
-- select email,sheet_name,role,active from public.team_directory order by email;
-- select pg_get_functiondef('public.hook_restrict_rankviz_signup(jsonb)'::regprocedure);


-- Scope sheet webhooks to the spreadsheet where possible while supporting legacy Guest Post Anchor projects.
create or replace function public.find_request_from_sheet_scoped(
  p_tab text, p_website text, p_anchor text, p_row integer, p_sheet_id text
)
returns table(request_id uuid, match_type text)
language sql stable security definer set search_path = public
as $$
  with normalized as (
    select regexp_replace(lower(coalesce(p_website, '')), '[^a-z0-9]', '', 'g') as website_key,
           regexp_replace(lower(coalesce(p_anchor, '')), '[^a-z0-9]', '', 'g') as anchor_key
  ), matches as (
    select r.id,
      case when regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key
          or (exists (select 1 from jsonb_array_elements(coalesce(p.column_mapping, '[]'::jsonb)) cm
                      where lower(coalesce(cm->>'field',''))='placement_page' and lower(coalesce(cm->>'heading',''))='live link')
              and regexp_replace(lower(coalesce(r.placement_page, r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key)
        then 1 else 2 end as priority
    from public.requests r join public.projects p on p.id = r.project_id cross join normalized n
    where r.deleted_at is null and r.team_tab = p_tab
      and ((p_sheet_id is null and p.sheet_source = 'guest_post_anchor')
        or (p_sheet_id is not null and ((p.sheet_source='custom_sheet' and p.google_sheet_id=p_sheet_id) or p.sheet_source='guest_post_anchor')))
      and length(n.anchor_key)>0 and regexp_replace(lower(coalesce(r.anchor,'')), '[^a-z0-9]', '', 'g')=n.anchor_key
      and ((length(n.website_key)>0 and (regexp_replace(lower(coalesce(r.approved_site,'')), '[^a-z0-9]', '', 'g')=n.website_key
        or (exists (select 1 from jsonb_array_elements(coalesce(p.column_mapping, '[]'::jsonb)) cm
                    where lower(coalesce(cm->>'field',''))='placement_page' and lower(coalesce(cm->>'heading',''))='live link')
            and regexp_replace(lower(coalesce(r.placement_page, r.approved_site, '')), '[^a-z0-9]', '', 'g')=n.website_key)))
        or (p_row is not null and r.team_row=p_row))
  )
  select m.id, case when m.priority=1 then 'site_anchor' else 'row_fallback' end from matches m order by m.priority,m.id limit 1;
$$;
revoke all on function public.find_request_from_sheet_scoped(text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.find_request_from_sheet_scoped(text,text,text,integer,text) to service_role;

-- Extend dashboard aggregate with sheet flags and a base-required-fields incomplete KPI.
create or replace function public.get_admin_dashboard(
  p_month_start timestamptz, p_month_end timestamptz, p_live_since date
) returns jsonb language sql stable set search_path = public as $$
  with base as (
    select r.*, p.name as project_name, p.slug as project_slug, p.category as project_category, p.column_mapping as project_column_mapping,
      (select ps.dr from public.project_sites ps where ps.request_id=r.id and ps.archived_at is null order by ps.created_at desc limit 1) as dr,
      (select ps.traffic from public.project_sites ps where ps.request_id=r.id and ps.archived_at is null order by ps.created_at desc limit 1) as traffic
    from public.requests r left join public.projects p on p.id=r.project_id where r.deleted_at is null
  ), stats as (
    select count(*)::integer total,
      (count(*) filter(where status='Live'))::integer live,
      (count(*) filter(where status='Request shared'))::integer pending,
      (count(*) filter(where status='Rejected'))::integer rejected,
      (count(*) filter(where sync_state='failed'))::integer failed_sync,
      (count(*) filter(where created_at>=p_month_start and created_at<p_month_end))::integer this_month,
      (count(*) filter(where nullif(btrim(coalesce(placement_page,'')),'') is null or nullif(btrim(coalesce(target_url,'')),'') is null or nullif(btrim(coalesce(anchor,'')),'') is null or nullif(btrim(coalesce(assign_to,'')),'') is null or deadline is null or (exists(select 1 from jsonb_array_elements(coalesce(project_column_mapping,'[]'::jsonb)) cm where lower(coalesce(cm->>'field',''))='dr') and dr is null) or (exists(select 1 from jsonb_array_elements(coalesce(project_column_mapping,'[]'::jsonb)) cm where lower(coalesce(cm->>'field',''))='traffic') and traffic is null)))::integer incomplete
    from base
  ), recent as (
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) rows from (
      select id,created_at,approved_site,placement_page,target_url,anchor,assign_to,deadline,status,sheet_flag,sync_state,sync_error,live_date,dr,traffic,project_name,project_slug,project_category,project_column_mapping
      from base order by created_at desc limit 8
    ) x
  ), became_live as (
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) rows from (
      select id,created_at,approved_site,placement_page,target_url,anchor,assign_to,deadline,status,sheet_flag,sync_state,sync_error,live_date,dr,traffic,project_name,project_slug,project_category,project_column_mapping
      from base where live_date>=p_live_since order by live_date desc limit 50
    ) x
  ), failed as (
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) rows from (
      select id,approved_site,anchor,sync_error,updated_at,project_name,project_slug from base where sync_state='failed' order by updated_at desc limit 50
    ) x
  ), breakdown as (
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) rows from (
      select p.id,p.name,p.slug,count(b.id)::integer total,
        (count(b.id) filter(where b.status='Live'))::integer live,
        (count(b.id) filter(where b.status='Request shared'))::integer pending,
        (count(b.id) filter(where b.status='Rejected'))::integer rejected
      from public.projects p left join base b on b.project_id=p.id group by p.id,p.name,p.slug order by p.name
    ) x
  )
  select jsonb_build_object('stats',jsonb_build_object('total',stats.total,'live',stats.live,'pending',stats.pending,'rejected',stats.rejected,'failedSync',stats.failed_sync,'thisMonth',stats.this_month,'incomplete',stats.incomplete),'recent',recent.rows,'becameLive',became_live.rows,'failed',failed.rows,'breakdown',breakdown.rows)
  from stats,recent,became_live,failed,breakdown;
$$;
revoke execute on function public.get_admin_dashboard(timestamptz,timestamptz,date) from public, anon, authenticated;
grant execute on function public.get_admin_dashboard(timestamptz,timestamptz,date) to service_role;

create or replace function public.guard_last_active_admin()
returns trigger language plpgsql set search_path = public as $$
declare active_admins integer;
begin
  if old.role='admin' and old.account_status='active' and (new.role<>'admin' or new.account_status<>'active') then
    perform pg_advisory_xact_lock(hashtext('inhouse_request_last_active_admin'));
    select count(*) into active_admins from public.users where role='admin' and account_status='active';
    if active_admins <= 1 then raise exception 'The last active admin cannot be demoted or disabled.' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_last_active_admin on public.users;
create trigger trg_guard_last_active_admin before update of role, account_status on public.users for each row execute function public.guard_last_active_admin();
