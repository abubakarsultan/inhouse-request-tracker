-- Read-only diagnostics. Run in Supabase SQL Editor before testing sync.
-- The custom sheet must have a google_sheet_id, selected tab and enabled sync.
select
  p.name as project_name,
  p.category,
  p.sheet_source,
  p.sheet_name,
  p.guest_post_tab_name as selected_tab,
  (nullif(trim(coalesce(p.google_sheet_id, '')), '') is not null) as has_custom_sheet_id,
  p.sync_enabled,
  case
    when not p.sync_enabled then 'disabled'
    when nullif(trim(coalesce(p.guest_post_tab_name, '')), '') is null then 'missing_tab'
    when p.sheet_source = 'custom_sheet' and nullif(trim(coalesce(p.google_sheet_id, '')), '') is null then 'missing_sheet_id'
    when p.sheet_source = 'guest_post_anchor' then 'check_TEAM_SHEET_ID_env'
    else 'configured_check_editor_access'
  end as sync_readiness
from public.projects p
where p.active = true
order by p.category, p.name;

-- Recent requests saved without a confirmed Google Sheet row.
select
  r.id, p.name as project_name, r.approved_site,
  r.sync_state, r.sync_error, r.team_tab, r.team_row, r.created_at
from public.requests r
join public.projects p on p.id = r.project_id
where r.source = 'app' and r.sync_state in ('skipped', 'failed')
  and r.deleted_at is null
order by r.created_at desc
limit 50;
