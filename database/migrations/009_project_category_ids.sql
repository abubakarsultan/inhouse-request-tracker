-- V7.4: required project category UUIDs, compatible with existing projects.
-- This migration does not remove projects, change their Sheet connections,
-- or touch requests. It fills ONLY missing category_id metadata.
-- Take a backup first; run once in Supabase SQL Editor after migrations 007/008.

create extension if not exists pgcrypto;

-- Older project schemas have only category text. Preserve any existing table.
create table if not exists public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  sheet_mode text not null default 'own_sheet',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists project_categories_slug_v74_uq
  on public.project_categories (slug);

-- The live database already has Inhouse, Client and Onpage. Only missing
-- rows are inserted, so their current IDs and configuration stay untouched.
insert into public.project_categories (id, name, slug, sort_order, sheet_mode, active)
values
  (gen_random_uuid(), 'Inhouse', 'inhouse', 1, 'team_sheet_tab', true),
  (gen_random_uuid(), 'Client', 'client', 2, 'own_sheet', true),
  (gen_random_uuid(), 'Onpage', 'onpage', 3, 'own_sheet', true),
  (gen_random_uuid(), 'Others', 'others', 4, 'own_sheet', true)
on conflict (slug) do nothing;

-- For databases that have not yet added category_id, make it compatible;
-- for the live database this ALTER is a no-op.
alter table public.projects add column if not exists category_id uuid;

-- Backfill only category_id values that have never been set. Keep the
-- original category labels, names, slugs, rows and Sheet mappings intact.
update public.projects p
set category_id = c.id
from public.project_categories c
where p.category_id is null
  and c.slug = case lower(btrim(coalesce(p.category, '')))
    when 'inhouse' then 'inhouse'
    when 'client' then 'client'
    when 'on page' then 'onpage'
    when 'onpage' then 'onpage'
    when 'others' then 'others'
    else null
  end;

-- Prevent ambiguous category references. If a project has an unknown label,
-- this fails visibly instead of assigning the wrong category.
alter table public.projects alter column category_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_category_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_category_id_fkey
      foreign key (category_id) references public.project_categories(id)
      on delete restrict;
  end if;
end $$;
