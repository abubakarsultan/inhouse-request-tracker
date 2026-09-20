-- Phase 6: My Requests UX + performance
-- Safe to re-run. Adds active-request indexes and service-role RPCs that avoid
-- loading an entire member history on dashboard / My Requests navigation.

create index if not exists requests_assigned_user_created_active_idx
  on requests (assigned_user_id, created_at desc)
  where deleted_at is null;

create index if not exists requests_assigned_user_status_active_idx
  on requests (assigned_user_id, status)
  where deleted_at is null;

create index if not exists requests_assigned_user_deadline_active_idx
  on requests (assigned_user_id, deadline)
  where deleted_at is null;

create index if not exists requests_assign_to_lower_created_active_idx
  on requests ((lower(btrim(coalesce(assign_to, '')))), created_at desc)
  where deleted_at is null;

create index if not exists requests_project_status_created_active_idx
  on requests (project_id, status, created_at desc)
  where deleted_at is null;

create or replace function get_member_dashboard(
  p_user_id uuid,
  p_sheet_name text,
  p_today date,
  p_upcoming_end date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with base as (
    select
      r.id,
      r.project_id,
      p.name as project_name,
      p.slug as project_slug,
      r.approved_site,
      r.anchor,
      r.target_url,
      r.source,
      r.priority,
      r.deadline,
      r.status,
      r.sync_state,
      r.created_at
    from requests r
    join projects p on p.id = r.project_id
    where r.deleted_at is null
      and (
        r.assigned_user_id = p_user_id
        or (
          coalesce(btrim(p_sheet_name), '') <> ''
          and lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(p_sheet_name))
        )
      )
  ),
  summary as (
    select
      count(*)::integer as assigned,
      (count(*) filter (where status = 'Live'))::integer as live,
      (count(*) filter (where status = 'Request shared'))::integer as pending,
      (count(*) filter (where status = 'Rejected'))::integer as rejected,
      (count(*) filter (where status = 'Request shared' and deadline is not null and deadline < p_today))::integer as overdue
    from base
  ),
  upcoming as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
    from (
      select id, project_id, project_name, project_slug, approved_site, anchor, target_url,
             source, priority, deadline, status, sync_state, created_at
      from base
      where status = 'Request shared'
        and deadline is not null
        and deadline >= p_today
        and deadline <= p_upcoming_end
      order by deadline asc, created_at desc
      limit 10
    ) x
  ),
  recent as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
    from (
      select id, project_id, project_name, project_slug, approved_site, anchor, target_url,
             source, priority, deadline, status, sync_state, created_at
      from base
      order by created_at desc
      limit 8
    ) x
  ),
  breakdown as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
    from (
      select project_name as project,
             count(*)::integer as total,
             (count(*) filter (where status = 'Live'))::integer as live,
             (count(*) filter (where status = 'Request shared'))::integer as pending,
             (count(*) filter (where status = 'Rejected'))::integer as rejected
      from base
      group by project_id, project_name
      order by count(*) desc, project_name asc
    ) x
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'assigned', summary.assigned,
      'live', summary.live,
      'pending', summary.pending,
      'rejected', summary.rejected,
      'overdue', summary.overdue
    ),
    'upcoming', upcoming.rows,
    'recent', recent.rows,
    'breakdown', breakdown.rows
  )
  from summary, upcoming, recent, breakdown;
$$;

revoke execute on function get_member_dashboard(uuid, text, date, date) from public, anon, authenticated;
grant execute on function get_member_dashboard(uuid, text, date, date) to service_role;

create or replace function get_member_requests_page(
  p_user_id uuid,
  p_sheet_name text,
  p_query text default null,
  p_project_id uuid default null,
  p_status text default null,
  p_priority text default null,
  p_deadline_filter text default null,
  p_source text default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table(
  id uuid,
  project_id uuid,
  project_name text,
  project_slug text,
  approved_site text,
  anchor text,
  target_url text,
  placement_page text,
  source text,
  priority text,
  deadline date,
  status text,
  sync_state text,
  sync_error text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with params as (
    select regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g') as query_key
  ),
  filtered as (
    select
      r.id,
      r.project_id,
      p.name as project_name,
      p.slug as project_slug,
      r.approved_site,
      r.anchor,
      r.target_url,
      r.placement_page,
      r.source,
      r.priority,
      r.deadline,
      r.status,
      r.sync_state,
      r.sync_error,
      r.created_at
    from requests r
    join projects p on p.id = r.project_id
    cross join params q
    where r.deleted_at is null
      and (
        r.assigned_user_id = p_user_id
        or (
          coalesce(btrim(p_sheet_name), '') <> ''
          and lower(btrim(coalesce(r.assign_to, ''))) = lower(btrim(p_sheet_name))
        )
      )
      and (p_project_id is null or r.project_id = p_project_id)
      and (coalesce(p_status, '') = '' or r.status = p_status)
      and (coalesce(p_priority, '') = '' or r.priority = p_priority)
      and (
        coalesce(p_source, '') = ''
        or (p_source = 'app' and r.source = 'app')
        or (p_source = 'imported' and coalesce(r.source, 'app') <> 'app')
      )
      and (
        coalesce(p_deadline_filter, '') = ''
        or (p_deadline_filter = 'overdue' and r.status = 'Request shared' and r.deadline is not null and r.deadline < (now() at time zone 'Asia/Karachi')::date)
        or (p_deadline_filter = 'today' and r.status = 'Request shared' and r.deadline = (now() at time zone 'Asia/Karachi')::date)
        or (p_deadline_filter = 'next7' and r.status = 'Request shared' and r.deadline between (now() at time zone 'Asia/Karachi')::date and ((now() at time zone 'Asia/Karachi')::date + 6))
        or (p_deadline_filter = 'none' and r.deadline is null)
      )
      and (
        q.query_key = ''
        or regexp_replace(
          lower(concat_ws(' | ', p.name, r.approved_site, r.anchor, r.target_url, r.placement_page, r.priority, r.status)),
          '[^a-z0-9]', '', 'g'
        ) like '%' || q.query_key || '%'
      )
  )
  select
    f.id, f.project_id, f.project_name, f.project_slug, f.approved_site, f.anchor,
    f.target_url, f.placement_page, f.source, f.priority, f.deadline, f.status,
    f.sync_state, f.sync_error, f.created_at, count(*) over() as total_count
  from filtered f
  order by
    case when p_sort = 'oldest' then f.created_at end asc,
    case when p_sort = 'deadline' then f.deadline end asc nulls last,
    case when p_sort = 'website' then lower(f.approved_site) end asc,
    case when p_sort = 'project' then lower(f.project_name) end asc,
    f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function get_member_requests_page(uuid, text, text, uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function get_member_requests_page(uuid, text, text, uuid, text, text, text, text, text, integer, integer) to service_role;

create or replace function get_admin_dashboard(
  p_month_start timestamptz,
  p_month_end timestamptz,
  p_live_since date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with base as (
    select r.*, p.name as project_name, p.slug as project_slug
    from requests r
    left join projects p on p.id = r.project_id
    where r.deleted_at is null
  ),
  stats as (
    select
      count(*)::integer as total,
      (count(*) filter (where status = 'Live'))::integer as live,
      (count(*) filter (where status = 'Request shared'))::integer as pending,
      (count(*) filter (where status = 'Rejected'))::integer as rejected,
      (count(*) filter (where sync_state = 'failed'))::integer as failed_sync,
      (count(*) filter (where created_at >= p_month_start and created_at < p_month_end))::integer as this_month
    from base
  ),
  recent as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select id, created_at, approved_site, assign_to, status, live_date, sync_state, sync_error, project_name, project_slug
      from base order by created_at desc limit 8
    ) x
  ),
  became_live as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select id, created_at, approved_site, assign_to, status, live_date, sync_state, sync_error, project_name, project_slug
      from base where live_date >= p_live_since order by live_date desc limit 50
    ) x
  ),
  failed as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select id, approved_site, anchor, sync_error, updated_at, project_name, project_slug
      from base where sync_state = 'failed' order by updated_at desc limit 50
    ) x
  ),
  breakdown as (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from (
      select p.id, p.name, p.slug,
             count(b.id)::integer as total,
             (count(b.id) filter (where b.status = 'Live'))::integer as live,
             (count(b.id) filter (where b.status = 'Request shared'))::integer as pending,
             (count(b.id) filter (where b.status = 'Rejected'))::integer as rejected
      from projects p
      left join base b on b.project_id = p.id
      group by p.id, p.name, p.slug
      order by p.name
    ) x
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'total', stats.total,
      'live', stats.live,
      'pending', stats.pending,
      'rejected', stats.rejected,
      'failedSync', stats.failed_sync,
      'thisMonth', stats.this_month
    ),
    'recent', recent.rows,
    'becameLive', became_live.rows,
    'failed', failed.rows,
    'breakdown', breakdown.rows
  )
  from stats, recent, became_live, failed, breakdown;
$$;

revoke execute on function get_admin_dashboard(timestamptz, timestamptz, date) from public, anon, authenticated;
grant execute on function get_admin_dashboard(timestamptz, timestamptz, date) to service_role;

create or replace function get_admin_team_attention()
returns jsonb
language sql
stable
set search_path = public
as $$
  with roster as (
    select lower(btrim(name)) as key from team_names where active = true
  ),
  invalid as (
    select distinct btrim(r.assign_to) as label
    from requests r
    where r.deleted_at is null
      and r.assign_to is not null
      and btrim(r.assign_to) <> ''
      and lower(btrim(r.assign_to)) not in (select key from roster)
  )
  select jsonb_build_object(
    'pendingApprovals', (select count(*)::integer from users where account_status = 'pending'),
    'activeMembers', (select count(*)::integer from users where account_status = 'active'),
    'invalidAssignments', (select count(*)::integer from invalid),
    'invalidLabels', coalesce((select jsonb_agg(label order by label) from invalid), '[]'::jsonb)
  );
$$;

revoke execute on function get_admin_team_attention() from public, anon, authenticated;
grant execute on function get_admin_team_attention() to service_role;
