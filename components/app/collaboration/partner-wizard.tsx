'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCollaborationPartner } from '@/services/collaboration';
import { partnerTabName } from '@/lib/collaboration-core';

export default function PartnerWizard({serviceAccountEmail}:{serviceAccountEmail:string|null}){
  const router=useRouter();
  const [step,setStep]=useState(1),[name,setName]=useState(''),[email,setEmail]=useState(''),[website,setWebsite]=useState(''),[notes,setNotes]=useState('');
  const [give,setGive]=useState(1),[receive,setReceive]=useState(1),[setup,setSetup]=useState<'automatic'|'manual'|'later'>('manual');
  const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('');
  const input='mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]';
  async function finish(){
    setBusy(true);setError('');
    try{
      const created=await createCollaborationPartner({name,email,website,notes,give,receive,setup,sheetUrl:url});
      setResult(created.setupMessage);router.refresh();
      setTimeout(()=>router.push(`/collaborations/${created.id}`),700);
    }catch(e){setError(e instanceof Error?e.message:'Could not create partner');}finally{setBusy(false);}
  }
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
    <div className="mb-5 flex flex-wrap gap-2">{['Partner','Exchange Ratio','Google Sheet','Review'].map((label,i)=><button key={label} type="button" onClick={()=>setStep(i+1)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${step===i+1?'bg-[var(--brand)] text-white':'bg-[var(--canvas)] text-[var(--muted)]'}`}>{i+1}. {label}</button>)}</div>
    {error&&<p role="alert" className="mb-4 rounded-lg bg-[#fce8e6] p-3 text-sm text-[#a21b14]">{error}</p>}
    {result&&<p role="status" className="mb-4 rounded-lg bg-[#e6f4ea] p-3 text-sm text-[#176d30]">{result}</p>}
    {step===1&&<div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Partner Name *<input className={input} value={name} onChange={e=>setName(e.target.value)} required placeholder="John Outreach"/></label>
      <label className="text-sm font-semibold">Email (optional)<input className={input} value={email} onChange={e=>setEmail(e.target.value)} placeholder="partner@example.com"/></label>
      <label className="text-sm font-semibold">Website (optional)<input className={input} value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://example.com"/></label>
      <label className="text-sm font-semibold sm:col-span-2">Notes<textarea className={input} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    </div>}
    {step===2&&<div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">Default agreement only. Every exchange deal can have its own 1:1, 2:1 or custom ratio.</p>
      <div className="grid max-w-lg grid-cols-2 gap-3"><label className="text-sm font-semibold">Links We Give<input type="number" min={1} max={100} className={input} value={give} onChange={e=>setGive(Number(e.target.value))}/></label><label className="text-sm font-semibold">Links We Receive<input type="number" min={1} max={100} className={input} value={receive} onChange={e=>setReceive(Number(e.target.value))}/></label></div>
      <p className="rounded-lg bg-[var(--canvas)] p-3 text-sm">Default: <b>{give} Given : {receive} Received</b></p>
    </div>}
    {step===3&&<div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">Choose automatic creation or download the exact CSV headings and connect your own Google Sheet.</p>
      <div className="grid gap-3 sm:grid-cols-3">{([['automatic','Create Sheet Automatically'],['manual','CSV & Connect Manually'],['later','Set up later']] as const).map(([value,label])=><label key={value} className={`cursor-pointer rounded-xl border p-3 text-sm ${setup===value?'border-[var(--brand)] bg-[var(--brand-soft)]':'border-[var(--border)]'}`}><input className="mr-2" type="radio" checked={setup===value} onChange={()=>setSetup(value)}/>{label}</label>)}</div>
      {setup==='automatic'&&<div className="rounded-xl bg-[var(--canvas)] p-4 text-sm"><b>One-click Google Sheet setup</b><p className="mt-1 text-[var(--muted)]">The app will create Rankviz, {partnerTabName(name)}, and Summary tabs and connect them. Google credentials with Drive creation permissions are required; if creation fails your partner will be saved as Setup Pending.</p></div>}
      {setup==='manual'&&<div className="space-y-3 rounded-xl border border-[var(--border)] p-4 text-sm">
        <h3 className="font-bold">Manual Google Sheet Setup — 5 steps</h3>
        <ol className="list-inside list-decimal space-y-2 text-[var(--muted)]">
          <li><a className="font-semibold text-[var(--brand)] underline" href={`/api/collaboration/templates?partner=${encodeURIComponent(name||'Partner')}`}>Download CSV Templates (.zip)</a> — 3 CSV files with final headings.</li>
          <li>Create one blank Google Spreadsheet.</li>
          <li>Use <b>File → Import → Upload</b> for each CSV; choose <b>Insert new sheet(s)</b>. Rename tabs <b>Rankviz</b>, <b>{partnerTabName(name)}</b>, <b>Summary</b>.</li>
          <li>Share that spreadsheet with the app's configured Google service account as Editor (or use the connected OAuth account). {serviceAccountEmail&&<span className="font-semibold">Editor email: <code className="select-all">{serviceAccountEmail}</code><button type="button" className="ml-2 rounded border px-2 py-0.5" onClick={()=>navigator.clipboard.writeText(serviceAccountEmail)}>Copy</button></span>}</li>
          <li>Paste the spreadsheet URL below. We verify the tabs, headings and edit access before connecting.</li>
        </ol>
        <label className="block font-semibold">Google Sheet URL<input className={input} placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={e=>setUrl(e.target.value)}/></label>
        <p className="text-xs text-[var(--muted)]">If you have not imported the CSV yet, choose Set up later. You can connect the URL from Partner Details.</p>
      </div>}
    </div>}
    {step===4&&<div className="space-y-2 rounded-xl bg-[var(--canvas)] p-4 text-sm"><p><b>Partner:</b> {name||'Not entered'}</p><p><b>Ratio:</b> {give} Given : {receive} Received</p><p><b>Sheet:</b> {setup==='automatic'?'Automatic creation':setup==='manual'?'Connect imported CSV Sheet':'Set up later'}</p><p><b>Tabs:</b> Rankviz, {partnerTabName(name)}, Summary</p><p className="text-[var(--muted)]">Existing Projects, Requests and Guest Post Anchor data will not be changed.</p></div>}
    <div className="mt-6 flex justify-between gap-2"><button type="button" disabled={step===1||busy} onClick={()=>setStep(v=>v-1)} className="rounded-xl border border-[var(--border)] px-5 py-2 text-sm disabled:opacity-50">Back</button>{step<4?<button type="button" disabled={step===1&&!name.trim()||step===2&&(give<1||receive<1)} onClick={()=>{setError('');setStep(v=>v+1);}} className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue</button>:<button type="button" disabled={busy||!name.trim()||setup==='manual'&&!url.trim()} onClick={finish} className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Creating…':'Create Partner'}</button>}</div>
  </section>;
}
TS
cat > components/app/collaboration/partner-actions.tsx <<'TSX'
'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {addCollaborationLink,allocatePreviouslyGivenLink,connectPartnerSheet,createCollaborationDeal,updateCollaborationLinkStatus,retryCollaborationLinkSync} from '@/services/collaboration';
import {COLLAB_STATUSES} from '@/lib/collaboration-core';

const cls='w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm';
export function ConnectPartnerSheet({partnerId}:{partnerId:string}){
  const router=useRouter();const[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <form className="flex flex-col gap-2" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const msg=await connectPartnerSheet(partnerId,url);setError(msg);router.refresh();}catch(e){setError(e instanceof Error?e.message:'Connection failed');}finally{setBusy(false);}}}>
    <input aria-label="Google Sheet URL" className={cls} placeholder="Paste Google Sheet URL after importing CSV" value={url} onChange={e=>setUrl(e.target.value)} required/>
    <button disabled={busy} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Connecting…':'Connect & Validate Sheet'}</button>
    {error&&<p role="status" className="text-xs text-[var(--muted)]">{error}</p>}
  </form>;
}
export function DealCreator({partnerId,give,receive}:{partnerId:string;give:number;receive:number}){
  const router=useRouter();const[g,setG]=useState(give),[r,setR]=useState(receive),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <form className="flex flex-wrap items-end gap-3" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await createCollaborationDeal({partnerId,give:g,receive:r});setMessage('New exchange deal created.');router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'Failed');}finally{setBusy(false);}}}>
    <label className="text-xs">We give<input className={cls} type="number" min={0} max={100} value={g} onChange={e=>setG(Number(e.target.value))}/></label>
    <label className="text-xs">We receive<input className={cls} type="number" min={0} max={100} value={r} onChange={e=>setR(Number(e.target.value))}/></label>
    <button disabled={busy||g+r===0} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm text-white">{busy?'Creating…':'Create Deal'}</button>
    {message&&<span role="status" className="text-xs text-[var(--muted)]">{message}</span>}
  </form>;
}
export function LinkCreator({partnerId,deals}:{partnerId:string;deals:Array<{id:string;deal_ref:string;state:string}>}){
  const router=useRouter();const[direction,setDirection]=useState<'given'|'received'>('received'),[dealId,setDealId]=useState('');
  const[status,setStatus]=useState<(typeof COLLAB_STATUSES)[number]>('Pending');const[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setMessage('');try{const result=await addCollaborationLink({partnerId,dealId:dealId||null,direction,website:String(f.get('website')),placementPage:String(f.get('placement_page')),anchor:String(f.get('anchor')),targetUrl:String(f.get('target_url')),status});setMessage(result.message);(e.target as HTMLFormElement).reset();router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'Unable to save link');}finally{setBusy(false);}}}>
    <label className="text-xs font-semibold">Direction<select className={cls} value={direction} onChange={e=>setDirection(e.target.value as 'given'|'received')}><option value="received">Partner → Us (Received)</option><option value="given">Us → Partner (Given)</option></select></label>
    <label className="text-xs font-semibold">Exchange Deal<select className={cls} value={dealId} onChange={e=>setDealId(e.target.value)}><option value="">Unallocated (add to deal later)</option>{deals.filter(d=>d.state==='open').map(d=><option key={d.id} value={d.id}>{d.deal_ref}</option>)}</select></label>
    {([['website','Website *'],['placement_page','Placement Page *'],['anchor','Anchor *'],['target_url','Target Link *']] as const).map(([field,label])=><label key={field} className="text-xs font-semibold">{label}<input required className={cls} name={field} placeholder={field==='placement_page'?'https://example.com/article':field==='target_url'?'https://target-site.com/':''}/></label>)}
    <label className="text-xs font-semibold">Status<select className={cls} value={status} onChange={e=>setStatus(e.target.value as typeof status)}>{COLLAB_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
    <div className="self-end"><button disabled={busy} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">{busy?'Saving…':direction==='given'?'Give Link':'Request / Receive Link'}</button></div>
    {message&&<p role="status" className="sm:col-span-2 text-sm text-[var(--muted)]">{message}</p>}
  </form>;
}
export function LinkRowActions({id,status,syncState}:{id:string;status:string;syncState:string}){
  const router=useRouter();const[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  return <div className="flex flex-wrap gap-1">
    <select aria-label="Update link status" className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" value={status} disabled={busy} onChange={async e=>{setBusy(true);try{const result=await updateCollaborationLinkStatus(id,e.target.value as typeof COLLAB_STATUSES[number]);setNotice(result.text);router.refresh();}catch(e){setNotice(e instanceof Error?e.message:'Update failed');}finally{setBusy(false);}}}>{COLLAB_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
    {syncState!=='synced'&&<button type="button" disabled={busy} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs" onClick={async()=>{setBusy(true);try{const result=await retryCollaborationLinkSync(id);setNotice(result.text);router.refresh();}catch(e){setNotice(e instanceof Error?e.message:'Retry failed');}finally{setBusy(false);}}}>Retry Sync</button>}
    {notice&&<span title={notice} className="max-w-44 truncate text-xs text-[var(--muted)]">{notice}</span>}
  </div>;
}
export function AllocateGiven({partnerId,deals,links}:{partnerId:string;deals:Array<{id:string;deal_ref:string;state:string}>;links:Array<{id:string;website:string;anchor:string;direction:string;status:string;deal_id:string|null}>}){
  const router=useRouter();const[link,setLink]=useState(''),[deal,setDeal]=useState(''),[note,setNote]=useState('');
  const available=links.filter(l=>l.direction==='given'&&l.status==='Live'&&!l.deal_id);
  return <div className="flex flex-wrap items-end gap-2"><label className="text-xs">Previously given Live link<select className={cls} value={link} onChange={e=>setLink(e.target.value)}><option value="">Select existing link</option>{available.map(l=><option key={l.id} value={l.id}>{l.website} — {l.anchor}</option>)}</select></label><label className="text-xs">Exchange Deal<select className={cls} value={deal} onChange={e=>setDeal(e.target.value)}><option value="">Select deal</option>{deals.filter(d=>d.state==='open').map(d=><option key={d.id} value={d.id}>{d.deal_ref}</option>)}</select></label><button type="button" disabled={!link||!deal} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50" onClick={async()=>{try{await allocatePreviouslyGivenLink(partnerId,deal,link);setNote('Old link linked to deal (not duplicated).');setLink('');router.refresh();}catch(e){setNote(e instanceof Error?e.message:'Cannot allocate');}}}>Apply Existing Link</button>{note&&<span className="text-xs text-[var(--muted)]">{note}</span>}</div>;
}
