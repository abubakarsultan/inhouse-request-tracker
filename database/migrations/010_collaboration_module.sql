-- V8 Collaboration module: additive schema, no changes to projects/requests/Guest Post Anchor data.
-- Run after 001-009. Take a Supabase database backup before applying.
create extension if not exists pgcrypto;

create table if not exists public.collaboration_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  email text, website text, notes text,
  default_give_qty integer not null default 1 check (default_give_qty between 1 and 100),
  default_receive_qty integer not null default 1 check (default_receive_qty between 1 and 100),
  active boolean not null default true,
  spreadsheet_id text, spreadsheet_title text,
  our_tab_name text not null default 'Rankviz', partner_tab_name text,
  summary_tab_name text not null default 'Summary',
  our_tab_gid integer, partner_tab_gid integer, summary_tab_gid integer,
  sheet_setup_state text not null default 'pending' check (sheet_setup_state in ('pending','connected','error')),
  sheet_setup_error text, sync_enabled boolean not null default false,
  last_synced_at timestamptz,
  webhook_token text not null default encode(gen_random_bytes(32), 'hex'),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists collaboration_partner_sheet_id_unique
  on public.collaboration_partners(spreadsheet_id) where spreadsheet_id is not null;

create table if not exists public.collaboration_deals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.collaboration_partners(id) on delete restrict,
  deal_ref text not null unique,
  give_required integer not null check (give_required between 0 and 100),
  receive_required integer not null check (receive_required between 0 and 100),
  notes text,
  state text not null default 'open' check (state in ('open','cancelled')),
  created_by uuid, created_at timestamptz not null default now(),
  check (give_required + receive_required > 0)
);
create index if not exists collaboration_deals_partner_idx on public.collaboration_deals(partner_id,created_at desc);

create table if not exists public.collaboration_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.collaboration_partners(id) on delete restrict,
  deal_id uuid references public.collaboration_deals(id) on delete set null,
  request_id uuid unique references public.requests(id) on delete set null,
  direction text not null check (direction in ('given','received')),
  website text not null check (length(btrim(website)) > 0),
  placement_page text not null check (length(btrim(placement_page)) > 0),
  anchor text not null check (length(btrim(anchor)) > 0),
  target_url text not null check (length(btrim(target_url)) > 0),
  status text not null default 'Pending' check (status in ('Pending','In Process','Live','Rejected','Cancelled')),
  live_at timestamptz,
  sheet_row integer,
  sync_state text not null default 'pending' check (sync_state in ('pending','synced','failed','disabled')),
  sync_error text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists collaboration_links_partner_idx on public.collaboration_links(partner_id,created_at desc);
create index if not exists collaboration_links_deal_idx on public.collaboration_links(deal_id);
create unique index if not exists collaboration_links_sheet_row_unique
  on public.collaboration_links(partner_id,direction,sheet_row) where sheet_row is not null;

-- Prevent allocating one link to a deal belonging to a different partner.
create or replace function public.validate_collaboration_deal_partner() returns trigger
language plpgsql as $$
begin
  if new.deal_id is not null and not exists (
    select 1 from public.collaboration_deals d where d.id = new.deal_id and d.partner_id = new.partner_id
  ) then raise exception 'Collaboration deal does not belong to link partner'; end if;
  new.updated_at = now();
  if new.status = 'Live' and new.live_at is null then new.live_at = now(); end if;
  if new.status <> 'Live' then new.live_at = null; end if;
  return new;
end $$;
drop trigger if exists collaboration_link_validate on public.collaboration_links;
create trigger collaboration_link_validate before insert or update on public.collaboration_links
for each row execute function public.validate_collaboration_deal_partner();

create table if not exists public.collaboration_sync_log (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.collaboration_partners(id) on delete cascade,
  link_id uuid references public.collaboration_links(id) on delete set null,
  action text not null, state text not null,
  details text, created_at timestamptz not null default now()
);
create index if not exists collaboration_sync_log_partner_idx on public.collaboration_sync_log(partner_id,created_at desc);

-- All collaboration data is accessed only through authenticated server actions
-- or the verified webhook with the service-role client. No direct anonymous reads.
alter table public.collaboration_partners enable row level security;
alter table public.collaboration_deals enable row level security;
alter table public.collaboration_links enable row level security;
alter table public.collaboration_sync_log enable row level security;

-- Atomic association: prevents a saved request from ending up only half allocated
-- to an exchange. Restricted to service-role callers; never public/anon access.
create or replace function public.create_collaboration_from_request(
  p_request_id uuid, p_partner_id uuid, p_created_by uuid,
  p_mode text, p_give_required integer, p_receive_required integer,
  p_previous_link_id uuid default null, p_offer jsonb default null
) returns table (deal_id uuid, received_link_id uuid, given_link_id uuid)
language plpgsql security invoker as $$
declare r public.requests%rowtype; d uuid; received uuid; given uuid; ref text;
begin
  if p_mode not in ('direct','previous','advance') then raise exception 'Invalid collaboration exchange mode'; end if;
  if p_give_required < 0 or p_receive_required < 1 or p_give_required > 100 or p_receive_required > 100 then
    raise exception 'Invalid link ratio'; end if;
  if not exists (select 1 from public.collaboration_partners where id=p_partner_id and active) then
    raise exception 'Partner unavailable'; end if;
  select * into r from public.requests where id=p_request_id and deleted_at is null;
  if not found then raise exception 'Request not found'; end if;
  if btrim(coalesce(r.placement_page,''))='' then raise exception 'Placement Page is required for a collaboration link'; end if;
  if exists(select 1 from public.collaboration_links where request_id=p_request_id) then
    raise exception 'This request already has a collaboration link'; end if;
  ref := 'EX-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.collaboration_deals(partner_id,deal_ref,give_required,receive_required,created_by)
  values (p_partner_id,ref,p_give_required,p_receive_required,p_created_by) returning id into d;
  insert into public.collaboration_links(partner_id,deal_id,request_id,direction,website,placement_page,anchor,target_url,status,created_by)
  values (p_partner_id,d,p_request_id,'received',r.approved_site,r.placement_page,r.anchor,r.target_url,
    case when r.status='Live' then 'Live' when r.status='Rejected' then 'Rejected' else 'Pending' end,p_created_by)
  returning id into received;
  if p_mode = 'previous' then
    update public.collaboration_links set deal_id=d
    where id=p_previous_link_id and partner_id=p_partner_id and direction='given' and status='Live' and deal_id is null
    returning id into given;
    if given is null then raise exception 'Previously given link unavailable or already allocated'; end if;
  elsif p_mode='direct' then
    if btrim(coalesce(p_offer->>'website',''))='' or btrim(coalesce(p_offer->>'placement_page',''))='' or
       btrim(coalesce(p_offer->>'anchor',''))='' or btrim(coalesce(p_offer->>'target_url',''))='' then
      raise exception 'Offered website, placement page, anchor and target URL are required';
    end if;
    insert into public.collaboration_links(partner_id,deal_id,direction,website,placement_page,anchor,target_url,status,created_by)
    values (p_partner_id,d,'given',p_offer->>'website',p_offer->>'placement_page',p_offer->>'anchor',p_offer->>'target_url','Pending',p_created_by)
    returning id into given;
  end if;
  return query select d,received,given;
end $$;
revoke all on function public.create_collaboration_from_request(uuid,uuid,uuid,text,integer,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_collaboration_from_request(uuid,uuid,uuid,text,integer,integer,uuid,jsonb) to service_role;

-- Exact counters from all partner records, independent of paginated dashboard tables.
create or replace function public.collaboration_partner_stats(p_partner_id uuid)
returns jsonb language sql stable security invoker as $$
with links as (
  select direction,status,deal_id from public.collaboration_links where partner_id=p_partner_id
), active_deals as (
  select id,give_required,receive_required from public.collaboration_deals
  where partner_id=p_partner_id and state<>'cancelled'
), deal_status as (
  select d.id,d.give_required,d.receive_required,
   (select count(*) from links l where l.deal_id=d.id and l.direction='given' and l.status='Live') as g_live,
   (select count(*) from links l where l.deal_id=d.id and l.direction='received' and l.status='Live') as r_live
  from active_deals d
)
select jsonb_build_object(
  'givenLive',(select count(*) from links where direction='given' and status='Live'),
  'receivedLive',(select count(*) from links where direction='received' and status='Live'),
  'pending',(select count(*) from links where status='Pending'),
  'inProcess',(select count(*) from links where status='In Process'),
  'rejected',(select count(*) from links where status='Rejected'),
  'openDeals',(select count(*) from deal_status where g_live<give_required or r_live<receive_required),
  'completedDeals',(select count(*) from deal_status where g_live>=give_required and r_live>=receive_required),
  'givenOutstanding',coalesce((select sum(greatest(0,give_required-g_live)) from deal_status),0),
  'receivedOutstanding',coalesce((select sum(greatest(0,receive_required-r_live)) from deal_status),0)
) $$;
revoke all on function public.collaboration_partner_stats(uuid) from public,anon,authenticated;
grant execute on function public.collaboration_partner_stats(uuid) to service_role;
