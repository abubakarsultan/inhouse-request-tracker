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
