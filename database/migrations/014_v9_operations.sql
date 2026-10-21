-- V9: additive operations tables, indexes and aggregation. Does not rewrite legacy data.
create table if not exists public.collaboration_link_checks (
  link_id uuid primary key references public.collaboration_links(id) on delete cascade,
  partner_id uuid not null references public.collaboration_partners(id) on delete cascade,
  result text not null check (result in ('verified','missing','unreachable','unsafe','error')),
  http_status integer,
  detected_anchor text,
  detected_target text,
  detail text,
  checked_at timestamptz not null default now()
);
create index if not exists collaboration_link_checks_partner_idx on public.collaboration_link_checks(partner_id,checked_at desc);
alter table public.collaboration_link_checks enable row level security;

create table if not exists public.operations_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('overdue_request','stale_request','lost_link','sync_failure')),
  entity_type text not null check (entity_type in ('request','collaboration_link')),
  entity_id uuid not null,
  owner_id uuid,
  title text not null,
  detail text,
  state text not null default 'open' check (state in ('open','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kind,entity_type,entity_id)
);
create index if not exists operations_alerts_state_idx on public.operations_alerts(state,created_at desc);
alter table public.operations_alerts enable row level security;

create or replace function public.collaboration_partner_overview()
returns table(partner_id uuid,given_live bigint,received_live bigint,pending bigint,rejected bigint,received_rejected bigint,open_deals bigint,owed_by_us numeric,owed_by_partner numeric,failed_sync bigint)
language sql stable security invoker as $$
 with ls as (
  select partner_id,
   count(*) filter (where direction='given' and status='Live') given_live,
   count(*) filter (where direction='received' and status='Live') received_live,
   count(*) filter (where status='Pending') pending,
   count(*) filter (where status='Rejected') rejected,
   count(*) filter (where direction='received' and status='Rejected') received_rejected,
   count(*) filter (where sync_state='failed') failed_sync
  from public.collaboration_links group by partner_id
 ), ds as (
  select d.partner_id,d.id,d.give_required,d.receive_required,
   count(l.id) filter (where l.direction='given' and l.status='Live') g_live,
   count(l.id) filter (where l.direction='received' and l.status='Live') r_live
  from public.collaboration_deals d left join public.collaboration_links l on l.deal_id=d.id
  where d.state<>'cancelled' group by d.partner_id,d.id
 ), dg as (
  select partner_id,
   count(*) filter (where g_live<give_required or r_live<receive_required) open_deals,
   sum(greatest(0,give_required-g_live)) owed_by_us,
   sum(greatest(0,receive_required-r_live)) owed_by_partner
  from ds group by partner_id
 )
 select p.id,coalesce(ls.given_live,0),coalesce(ls.received_live,0),coalesce(ls.pending,0),coalesce(ls.rejected,0),coalesce(ls.received_rejected,0),
  coalesce(dg.open_deals,0),coalesce(dg.owed_by_us,0),coalesce(dg.owed_by_partner,0),coalesce(ls.failed_sync,0)
 from public.collaboration_partners p left join ls on ls.partner_id=p.id left join dg on dg.partner_id=p.id;
$$;
revoke all on function public.collaboration_partner_overview() from public, anon, authenticated;
grant execute on function public.collaboration_partner_overview() to service_role;

create or replace function public.collaboration_deal_progress(p_partner_id uuid)
returns table(deal_id uuid,given_live bigint,received_live bigint)
language sql stable security invoker as $$
 select d.id,
  count(l.id) filter (where l.direction='given' and l.status='Live'),
  count(l.id) filter (where l.direction='received' and l.status='Live')
 from public.collaboration_deals d left join public.collaboration_links l on l.deal_id=d.id
 where d.partner_id=p_partner_id group by d.id;
$$;
revoke all on function public.collaboration_deal_progress(uuid) from public,anon,authenticated;
grant execute on function public.collaboration_deal_progress(uuid) to service_role;

create or replace function public.operations_monthly_report()
returns table(month text,total bigint,live bigint,rejected bigint)
language sql stable security invoker as $$
 select to_char(date_trunc('month',created_at),'YYYY-MM') as month,
 count(*) as total,count(*) filter (where status='Live'),count(*) filter (where status='Rejected')
 from public.requests
 where deleted_at is null and created_at >= date_trunc('month',now()) - interval '11 months'
 group by 1 order by 1;
$$;
revoke all on function public.operations_monthly_report() from public,anon,authenticated;
grant execute on function public.operations_monthly_report() to service_role;

create index if not exists requests_ops_deadline_idx on public.requests(deadline) where deleted_at is null and status not in ('Live','Rejected');
create index if not exists collaboration_links_monitor_idx on public.collaboration_links(status,created_at) where status='Live';

create or replace function public.operations_monitor_candidates(p_limit integer default 12)
returns table(id uuid) language sql stable security invoker as $$
 select l.id from public.collaboration_links l
 left join public.collaboration_link_checks c on c.link_id=l.id
 where l.status='Live' and (c.checked_at is null or c.checked_at < now() - interval '24 hours')
 order by c.checked_at asc nulls first, l.created_at asc
 limit least(greatest(p_limit,1),50);
$$;
revoke all on function public.operations_monitor_candidates(integer) from public,anon,authenticated;
grant execute on function public.operations_monitor_candidates(integer) to service_role;

create or replace function public.operations_team_report()
returns table(owner_name text,total bigint,live bigint,rejected bigint,avg_days_to_live numeric)
language sql stable security invoker as $$
 select coalesce(nullif(btrim(assign_to),''),'Unassigned') as owner_name,
  count(*) as total,
  count(*) filter (where status='Live') as live,
  count(*) filter (where status='Rejected') as rejected,
  round(avg((live_date::date - created_at::date)::numeric) filter (where live_date is not null),1) as avg_days_to_live
 from public.requests where deleted_at is null and created_at >= now() - interval '90 days'
 group by 1 order by total desc limit 50;
$$;
revoke all on function public.operations_team_report() from public,anon,authenticated;
grant execute on function public.operations_team_report() to service_role;
create index if not exists requests_ops_updated_idx on public.requests(updated_at) where deleted_at is null and status not in ('Live','Rejected');

-- Existing normal requests have their own monitoring history; no status is rewritten.
create table if not exists public.request_link_checks (
 request_id uuid primary key references public.requests(id) on delete cascade,
 result text not null check (result in ('verified','missing','unreachable','unsafe','error')),
 http_status integer,
 detail text,
 checked_at timestamptz not null default now()
);
alter table public.request_link_checks enable row level security;
create index if not exists request_link_checks_recent on public.request_link_checks(checked_at desc);
create or replace function public.operations_monitor_request_candidates(p_limit integer default 8)
returns table(id uuid) language sql stable security invoker as $$
 select r.id from public.requests r left join public.request_link_checks c on c.request_id=r.id
 where r.status='Live' and r.deleted_at is null
   and nullif(btrim(coalesce(r.placement_page,'')),'') is not null
   and (c.checked_at is null or c.checked_at < now() - interval '24 hours')
 order by c.checked_at asc nulls first,r.created_at asc
 limit least(greatest(p_limit,1),50);
$$;
revoke all on function public.operations_monitor_request_candidates(integer) from public,anon,authenticated;
grant execute on function public.operations_monitor_request_candidates(integer) to service_role;
