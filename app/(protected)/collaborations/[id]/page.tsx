import Link from 'next/link';
import {headers} from 'next/headers';
import {adminClient} from '@/lib/supabase-admin';
import {getCollaborationPartner} from '@/services/collaboration';
import {requireActiveProfile} from '@/lib/auth';
import {collaborationAppsScript} from '@/lib/collaboration-sheets';
import {dealProgress} from '@/lib/collaboration-core';
import {ConnectPartnerSheet, AssignCollaborationOwner, CollaborationSheetRepair, DealCreator, LinkCreator, LinkRowActions, AllocateGiven} from '@/components/app/collaboration/partner-actions';
import CopyCode from '@/components/app/collaboration/script-copy';

const panel='rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm';
export default async function PartnerDetails({params}:{params:Promise<{id:string}>}){
  const profile=await requireActiveProfile();const {id}=await params;
  const {partner,deals,links,logs,metrics,truncated,statsUnavailable}=await getCollaborationPartner(id);
  const {data:activeUsers}=profile.role==='admin' ? await adminClient.from('users').select('id,email,name').eq('account_status','active').order('email') : {data:null};
  const requestHeaders=await headers();const host=requestHeaders.get('x-forwarded-host')||requestHeaders.get('host')||'YOUR-VERCEL-DOMAIN';
  const proto=requestHeaders.get('x-forwarded-proto')||(host.includes('localhost')?'http':'https');
  const sheetUrl=partner.spreadsheet_id?`https://docs.google.com/spreadsheets/d/${encodeURIComponent(partner.spreadsheet_id)}/edit`:null;
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || `${proto}://${host}`;
  const script=collaborationAppsScript(siteUrl,partner);
  const dealRefLookup=new Map(deals.map(d=>[d.id,d.deal_ref]));
  return <div className="space-y-6">
    <div><Link className="text-sm text-[var(--brand)]" href="/collaborations">← All Collaborations</Link><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{partner.name}</h1><p className="text-sm text-[var(--muted)]">Default ratio: {partner.default_give_qty} Given : {partner.default_receive_qty} Received</p></div><a href="#add-link" className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">+ Add Link</a></div></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      ['Given Live',metrics.givenLive],['Received Live',metrics.receivedLive],['Open Deals',metrics.openDeals],['Completed Deals',metrics.completedDeals],
      ['We Still Need to Give',metrics.givenOutstanding],['Partner Still Needs to Give',metrics.receivedOutstanding],['Pending',metrics.pending],['Rejected',metrics.rejected],
    ].map(([label,value])=><div key={String(label)} className={panel}><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    {(truncated||statsUnavailable)&&<div role="alert" className="rounded-xl bg-[#fef7e0] p-3 text-sm text-[#795000]">{statsUnavailable?'Exact counters unavailable: check migration 010; displayed counts may be partial.':'History tables show the latest 500 links / 250 deals, but dashboard counts are based on all database records.'}</div>}
    <section className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Google Sheet Details</h2>{sheetUrl&&<a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--brand)]">Open Sheet ↗</a>}</div>
      <p className="text-sm">Connection: <b>{partner.sheet_setup_state==='connected'?'Connected':'Setup Pending'}</b> · Sync: {partner.sync_enabled?'Enabled':'Disabled'}</p>
      {sheetUrl&&<p className="mt-1 text-xs text-[var(--muted)]">{partner.spreadsheet_title} · {partner.our_tab_name} / {partner.partner_tab_name} / {partner.summary_tab_name}</p>}
      {profile.role==='admin' && (!partner.created_by || !activeUsers?.some((u:any)=>u.id===partner.created_by)) && <div className="mt-3 rounded-lg border border-[#f3dfad] bg-[#fef7e0] p-3"><p className="mb-2 text-xs text-[#785000]">Legacy partner owner is missing or no longer active. Assign an owner before repairing access.</p><AssignCollaborationOwner partnerId={partner.id} users={(activeUsers||[]) as any}/></div>}
      {partner.sheet_setup_error&&<p className="mt-3 rounded-lg bg-[#fef7e0] p-2 text-xs text-[#795000]">{partner.sheet_setup_error}</p>}
      <p className="mt-3 text-xs text-[var(--muted)]">Last sync: {partner.last_synced_at?new Date(partner.last_synced_at).toLocaleString():'Not yet synced'}</p>
      <div className="mt-3"><CollaborationSheetRepair partnerId={partner.id} sheetUrl={sheetUrl || ''} showFix={partner.sheet_setup_state === 'error' && Boolean(partner.spreadsheet_id)} /></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><h3 className="mb-2 text-sm font-bold">Connect / Reconnect</h3><ConnectPartnerSheet partnerId={partner.id}/></div>
        <div className="space-y-2"><h3 className="text-sm font-bold">One-File Google Sheets Template</h3><p className="text-xs text-[var(--muted)]">Download one .xlsx workbook containing all 3 tabs. Upload it once to Google Drive, open/convert it to Google Sheets, share Editor access, then paste the Google Sheets URL.</p><a className="inline-block rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold" href={`/api/collaboration/templates?partner=${encodeURIComponent(partner.name)}`}>Download Excel Template (.xlsx)</a></div>
      </div>
      {Boolean(partner.spreadsheet_id)&&<div className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="mb-2 text-sm font-bold">Sheet → App Apps Script</h3><p className="mb-2 text-xs text-[var(--muted)]">1) Extensions → Apps Script open karein. 2) Code paste karein. 3) installCollaborationTrigger ek dafa run karein aur authorize karein. Google app ko trigger auto-install nahi karne deti. App → Sheet sync works without this trigger; Sheet → App requires it.</p><CopyCode script={script}/></div>}
    </section>
    <section className={panel}><h2 className="mb-3 text-lg font-bold">Exchange Deals</h2><DealCreator partnerId={partner.id} give={partner.default_give_qty} receive={partner.default_receive_qty}/>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]"><th className="p-2">Deal ID</th><th className="p-2">Give</th><th className="p-2">Receive</th><th className="p-2">Remaining (Us / Partner)</th><th className="p-2">State</th></tr></thead><tbody>
        {deals.map(d=>{const p=dealProgress(d,links);return <tr key={d.id} className="border-b border-[var(--border)]"><td className="p-2 font-semibold">{d.deal_ref}</td><td className="p-2">{p.liveGiven}/{d.give_required}</td><td className="p-2">{p.liveReceived}/{d.receive_required}</td><td className="p-2">{p.giveRemaining} / {p.receiveRemaining}</td><td className="p-2">{d.state==='cancelled'?'Cancelled':p.completed?'Completed':'Open'}</td></tr>;})}
      </tbody></table>{!deals.length&&<p className="p-4 text-xs text-[var(--muted)]">No exchange deals yet.</p>}</div>
      <div className="mt-3"><h3 className="mb-2 text-sm font-semibold">Use a link already given</h3><AllocateGiven partnerId={partner.id} deals={deals} links={links}/></div>
    </section>
    <section id="add-link" className={panel}><h2 className="mb-3 text-lg font-bold">Add Link — For Us / For Partner</h2><p className="mb-4 text-sm text-[var(--muted)]">Give link = Rankviz tab; Receive link = partner tab. Website, Placement Page, Anchor and Target Link are required when the link record is created.</p><LinkCreator partnerId={partner.id} deals={deals}/></section>
    <section className={panel}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Collaboration Links</h2><div className="flex flex-wrap gap-2">{(['all','given','received'] as const).map(dir=><a key={dir} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs" href={`/api/collaboration/export?partner=${id}&direction=${dir}`}>Export {dir==='all'?'All':dir==='given'?'Our Links':'Partner Links'} CSV</a>)}</div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-xs"><thead><tr className="border-b border-[var(--border)] text-[var(--muted)]">{['Direction','Date','Website','Placement Page','Anchor','Target Link','Deal','Status / Sync'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>
        {links.map(link=><tr key={link.id} className="border-b border-[var(--border)]"><td className="p-2 font-semibold">{link.direction==='given'?'We gave':'We received'}</td><td className="p-2">{String(link.created_at).slice(0,10)}</td><td className="p-2">{link.website}</td><td className="max-w-40 truncate p-2" title={link.placement_page}>{link.placement_page}</td><td className="p-2">{link.anchor}</td><td className="max-w-40 truncate p-2" title={link.target_url}>{link.target_url}</td><td className="p-2">{dealRefLookup.get(link.deal_id)||'Unallocated'}</td><td className="p-2"><LinkRowActions id={link.id} status={link.status} syncState={link.sync_state}/><p className="mt-1 text-[10px] text-[var(--muted)]">{link.sync_state}</p></td></tr>)}
      </tbody></table>{!links.length&&<p className="p-4 text-sm text-[var(--muted)]">No links yet.</p>}</div>
    </section>
    {logs.length>0&&<details className={panel}><summary className="cursor-pointer text-sm font-semibold">Recent Sync Activity</summary><div className="mt-3 space-y-2">{logs.map(x=><p key={x.id} className="text-xs text-[var(--muted)]">{String(x.created_at).slice(0,16)} — {x.action}: {x.state} {x.details||''}</p>)}</div></details>}
  </div>;
}
