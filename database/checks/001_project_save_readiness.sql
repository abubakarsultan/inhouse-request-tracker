-- Safe read-only diagnostic: run in Supabase SQL Editor.
-- This script does NOT change existing projects, requests, sheets, or permissions.
-- Every result should show present = true. Apply missing migrations in order.
with required_columns(table_name, column_name, migration) as (
  values
    ('projects', 'category', '007_project_categories_sheet_mapping.sql'),
    ('projects', 'sheet_source', '007_project_categories_sheet_mapping.sql'),
    ('projects', 'sheet_name', '007_project_categories_sheet_mapping.sql'),
    ('projects', 'column_mapping', '007_project_categories_sheet_mapping.sql'),
    ('projects', 'google_sheet_gid', '008_project_url_speed.sql'),
    ('projects', 'google_sheet_id', '001_phase1_core.sql'),
    ('projects', 'guest_post_tab_name', '001_phase1_core.sql'),
    ('projects', 'sync_enabled', '001_phase1_core.sql')
)
select
  required_columns.table_name,
  required_columns.column_name,
  exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required_columns.table_name
      and c.column_name = required_columns.column_name
  ) as present,
  required_columns.migration as source_migration
from required_columns
order by source_migration, column_name;

-- Secondary read-only counts function check (for Projects navigation).
select
  'project_request_status_counts' as function_name,
  to_regprocedure('public.project_request_status_counts()') is not null as present,
  '008_project_url_speed.sql' as source_migration;
