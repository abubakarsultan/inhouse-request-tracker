-- Phase 4: robust Sheet -> site lookup + repair indexes.
-- Re-runnable and safe on existing installations.

create index if not exists requests_team_tab_row_idx on requests(team_tab, team_row);
create index if not exists project_sites_project_team_row_idx on project_sites(project_id, team_row);

create or replace function find_request_from_sheet(
  p_tab text,
  p_website text,
  p_anchor text,
  p_row integer default null
)
returns table(request_id uuid, match_type text)
language sql
stable
set search_path = public
as $$
  with normalized as (
    select
      regexp_replace(lower(coalesce(p_website, '')), '[^a-z0-9]', '', 'g') as website_key,
      regexp_replace(lower(coalesce(p_anchor, '')), '[^a-z0-9]', '', 'g') as anchor_key
  ), candidates as (
    select r.id,
           case
             when regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key
              and regexp_replace(lower(coalesce(r.anchor, '')), '[^a-z0-9]', '', 'g') = n.anchor_key
             then 1
             when p_row is not null and r.team_row = p_row then 2
             else 9
           end as priority
    from requests r
    cross join normalized n
    where r.team_tab = p_tab
      and (
        (
          length(n.website_key) > 0 and length(n.anchor_key) > 0
          and regexp_replace(lower(coalesce(r.approved_site, '')), '[^a-z0-9]', '', 'g') = n.website_key
          and regexp_replace(lower(coalesce(r.anchor, '')), '[^a-z0-9]', '', 'g') = n.anchor_key
        )
        or (p_row is not null and r.team_row = p_row)
      )
  )
  select id,
         case when priority = 1 then 'site_anchor' else 'row_fallback' end
  from candidates
  order by priority, id
  limit 1;
$$;
