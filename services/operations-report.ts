import 'server-only';
import { requireAdminForAction } from '@/lib/auth';
import { adminClient } from '@/lib/supabase-admin';

export type MonthRow = { month:string; total:number; live:number; rejected:number };
export type TeamRow = {owner_name:string;total:number;live:number;rejected:number;avg_days_to_live:number|null};
export type OperationsReport = {
  months: MonthRow[];
  totalRequests: number;
  activePartners: number;
  givenLive: number;
  receivedLive: number;
  openDeals: number;
  owedByUs: number;
  owedByPartner: number;
  failingSync: number;
  openAlerts: number;
  team: TeamRow[];
  recentChecks: Record<string, number>;
};
export async function getOperationsReport(): Promise<OperationsReport> {
  await requireAdminForAction();
  const [monthResult, partnersResult, alertResult, checksResult, reqResult, teamResult] = await Promise.all([
    adminClient.rpc('operations_monthly_report'),
    adminClient.rpc('collaboration_partner_overview'),
    adminClient.from('operations_alerts').select('id',{count:'exact',head:true}).eq('state','open'),
    adminClient.from('collaboration_link_checks').select('result,checked_at').order('checked_at',{ascending:false}).limit(200),
    adminClient.from('requests').select('id',{count:'exact',head:true}).is('deleted_at',null),
    adminClient.rpc('operations_team_report'),
  ]);
  for (const entry of [monthResult, partnersResult, alertResult, checksResult, reqResult, teamResult]) {
    if (entry.error) throw new Error(`V9 reporting not ready: ${entry.error.message}. Run migration 014 and retry.`);
  }
  const months: MonthRow[] = Array.isArray(monthResult.data)
    ? (monthResult.data as Array<{month:unknown;total:unknown;live:unknown;rejected:unknown}>).map(row => ({
        month: String(row.month),
        total: Number(row.total ?? 0),
        live: Number(row.live ?? 0),
        rejected: Number(row.rejected ?? 0),
      }))
    : [];
  const partnerStats = (partnersResult.data || []) as Array<{given_live:number;received_live:number;open_deals:number;owed_by_us:number;owed_by_partner:number;failed_sync:number}>;
  const total = (k:keyof typeof partnerStats[number]) => partnerStats.reduce((sum, p) => sum + Number(p[k]||0),0);
  const recentChecks = (checksResult.data || []).reduce((memo:Record<string,number>,row:any) => {memo[row.result]=(memo[row.result]||0)+1;return memo;},{});
  const team: TeamRow[] = Array.isArray(teamResult.data)
    ? (teamResult.data as Array<{owner_name:unknown;total:unknown;live:unknown;rejected:unknown;avg_days_to_live:unknown}>).map(row => ({
        owner_name: String(row.owner_name ?? 'Unassigned'),
        total: Number(row.total ?? 0),
        live: Number(row.live ?? 0),
        rejected: Number(row.rejected ?? 0),
        avg_days_to_live: row.avg_days_to_live == null ? null : Number(row.avg_days_to_live),
      }))
    : [];
  return { months, totalRequests:reqResult.count||0, activePartners:partnerStats.length, givenLive:total('given_live'), receivedLive:total('received_live'), openDeals:total('open_deals'), owedByUs:total('owed_by_us'), owedByPartner:total('owed_by_partner'), failingSync:total('failed_sync'), openAlerts:alertResult.count||0, team, recentChecks };
}
