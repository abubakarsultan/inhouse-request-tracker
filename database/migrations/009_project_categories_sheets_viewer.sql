-- 009: project categories, per-project sheet metadata, flags, viewer role and audit.
-- Safe to re-run; existing project/request data is preserved.
create table if not exists project_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  sheet_mode text not null check (sheet_mode in ('team_sheet_tab','own_sheet')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists project_categories_name_lower_unique
  on project_categories (lower(name));
create unique index if not exists project_categories_slug_unique
  on project_categories (slug);

insert into project_categories (name, slug, sort_order, sheet_mode, active)
values ('Inhouse','inhouse',1,'team_sheet_tab',true),
       ('Client','client',2,'own_sheet',true),
       ('Onpage','onpage',3,'own_sheet',true)
on conflict (slug) do update set
  sheet_mode = excluded.sheet_mode,
  sort_order = excluded.sort_order;

alter table projects add column if not exists category_id uuid;
alter table projects add column if not exists sheet_tab_name text;
alter table projects add column if not exists sheet_column_config jsonb not null default '{}'::jsonb;
alter table projects add column if not exists sheet_share_emails text[] not null default '{}'::text[];
alter table projects add column if not exists sheet_sync_error text;

update projects p
set category_id = c.id
from project_categories c
where c.slug = 'inhouse' and p.category_id is null;

do $$ begin
  alter table projects add constraint projects_category_id_fkey
    foreign key (category_id) references project_categories(id) on delete restrict;
exception when duplicate_object then null; end $$;
alter table projects alter column category_id set not null;
create index if not exists projects_category_active_idx on projects(category_id, active);

alter table requests add column if not exists sheet_flag text;
alter table requests add column if not exists sheet_flag_at timestamptz;
do $$ begin
  alter table requests add constraint requests_sheet_flag_check
    check (sheet_flag is null or sheet_flag in ('Removed'));
exception when duplicate_object then null; end $$;

alter type user_role add value if not exists 'viewer';

create table if not exists user_role_audit (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references users(id) on delete cascade,
  changed_by uuid references users(id) on delete set null,
  field_name text not null check (field_name in ('role','sheet_name','account_status')),
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists user_role_audit_target_created_idx
  on user_role_audit(target_user_id, created_at desc);
create index if not exists requests_sheet_flag_idx on requests(sheet_flag) where sheet_flag is not null;
create index if not exists requests_project_status_created_idx on requests(project_id, status, created_at desc);

-- Category deactivation is prohibited while projects still reference it.
create or replace function prevent_used_category_deactivation()
returns trigger language plpgsql as $$
begin
  if old.active and not new.active and exists (
    select 1 from projects where category_id = old.id
  ) then
    raise exception 'Move all projects out of this category before deactivating it.';
  end if;
  return new;
end $$;
drop trigger if exists trg_prevent_used_category_deactivation on project_categories;
create trigger trg_prevent_used_category_deactivation
before update of active on project_categories
for each row execute function prevent_used_category_deactivation();

-- Verification: all existing projects must be assigned to Inhouse (or a valid category).
select
  (select count(*) from project_categories) as category_count,
  (select count(*) from projects where category_id is null) as projects_without_category,
  (select count(*) from project_categories where slug in ('inhouse','client','onpage')) as seeded_categories,
  (select count(*) from requests where sheet_flag not in ('Removed') and sheet_flag is not null) as invalid_sheet_flags;
