-- Read-only readiness check for V9. Requires migration 014.
select 'collaboration_link_checks' as object, to_regclass('public.collaboration_link_checks')::text as present
union all select 'request_link_checks', to_regclass('public.request_link_checks')::text
union all select 'operations_alerts', to_regclass('public.operations_alerts')::text;
select p.proname as function_name
from pg_proc p join pg_namespace n on p.pronamespace=n.oid
where n.nspname='public' and p.proname in (
'collaboration_partner_overview','collaboration_deal_progress','operations_monthly_report',
'operations_team_report','operations_monitor_candidates','operations_monitor_request_candidates'
) order by p.proname;
