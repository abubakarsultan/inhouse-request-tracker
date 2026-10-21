import Link from 'next/link';
import { requireActiveProfile } from '@/lib/auth';
import { listCollaborationPartners } from '@/services/collaboration';
import PartnerWizard from '@/components/app/collaboration/partner-wizard';
import { UsersRound, ArrowRight, Sheet, Link2 } from 'lucide-react';
import {getServiceAccountEmail} from '@/lib/google-sheet-setup';

export default async function CollaborationsPage(){
  const profile=await requireActiveProfile();
  let partners: Awaited<ReturnType<typeof listCollaborationPartners>>=[];
  let error='';
  try{partners=await listCollaborationPartners();}catch(e){error=e instanceof Error?e.message:'Cannot load collaborations';}
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Collaborations</h1><p className="mt-1 text-sm text-[var(--muted)]">Track partners, flexible exchanges, Live links, outstanding obligations and Google Sheets.</p></div>
    {error&&<div className="rounded-xl border border-[#f5b5b1] bg-[#fce8e6] p-4 text-sm text-[#8a1c16]">Unable to load partners: {error}. Run <code>database/migrations/010_collaboration_module.sql</code> in Supabase first.</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><UsersRound className="text-[var(--brand)]" size={18}/><div className="mt-2 text-2xl font-bold">{partners.length}</div><p className="text-xs text-[var(--muted)]">Partners</p></div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><Sheet className="text-[#188038]" size={18}/><div className="mt-2 text-2xl font-bold">{partners.filter(p=>p.sheet_setup_state==='connected').length}</div><p className="text-xs text-[var(--muted)]">Connected Sheets</p></div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><Link2 className="text-[var(--brand)]" size={18}/><div className="mt-2 text-2xl font-bold">{partners.reduce((total,p)=>total+Number(p.overview?.open_deals||0),0)}</div><p className="text-xs text-[var(--muted)]">Open Exchanges</p></div>
    </div>
    <details className="rounded-2xl" open={!partners.length}><summary className="mb-3 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm font-bold">+ Create Collaboration Partner</summary><PartnerWizard serviceAccountEmail={getServiceAccountEmail()}/></details>
    <section><h2 className="mb-3 text-lg font-bold">{profile.role==='admin' ? 'Team Collaborations' : 'My Partners'}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {partners.map(p=><Link href={`/collaborations/${p.id}`} key={p.id} className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center justify-between"><h3 className="font-bold">{p.name}</h3><ArrowRight size={17} className="text-[var(--brand)]"/></div>
        <p className="mt-1 text-xs text-[var(--muted)]">{p.email||p.website||'Collaboration partner'}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[var(--canvas)] p-3 text-center text-xs"><div><b className="block text-lg text-[#188038]">{p.overview?.given_live ?? '—'}</b>Given Live</div><div><b className="block text-lg text-[var(--brand)]">{p.overview?.received_live ?? '—'}</b>Received Live</div><div><b className="block text-lg">{p.overview?.open_deals ?? '—'}</b>Open Deals</div></div><p className="mt-2 text-xs text-[var(--muted)]">Default exchange: {p.default_give_qty} Given : {p.default_receive_qty} Received</p><p className="mt-1 text-xs text-[var(--muted)]">We owe {p.overview?.owed_by_us ?? '—'} · Partner owes {p.overview?.owed_by_partner ?? '—'}</p><p className="mt-1 text-xs text-[var(--muted)]">Delivery indicator: {p.overview && Number(p.overview.received_live||0)+Number(p.overview.received_rejected||0)>=5 ? `${Math.round(100*Number(p.overview.received_live||0)/(Number(p.overview.received_live||0)+Number(p.overview.received_rejected||0)))}% received links Live` : 'Insufficient history'}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${p.sheet_setup_state==='connected'?'bg-[#e6f4ea] text-[#188038]':'bg-[#fef7e0] text-[#8a6200]'}`}>{p.sheet_setup_state==='connected'?'Sheet connected':'Sheet setup pending'}</span><span className="rounded-full bg-[var(--canvas)] px-2 py-1">{p.sync_enabled?'Sync enabled':'Sync off'}</span></div>
        <span className="mt-4 inline-block text-xs font-semibold text-[var(--brand)]">Open partner dashboard →</span>
      </Link>)}
      {!partners.length&&!error&&<p className="rounded-xl border border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">No collaboration partners yet. Use Create Collaboration Partner to get started.</p>}
    </div></section>
  </div>;
}
