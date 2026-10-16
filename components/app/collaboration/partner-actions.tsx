'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {addCollaborationLink,allocatePreviouslyGivenLink,connectPartnerSheet,createCollaborationDeal,updateCollaborationLinkStatus,retryCollaborationLinkSync} from '@/services/collaboration';
import {COLLAB_STATUSES} from '@/lib/collaboration-core';

const cls='w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm';
export function ConnectPartnerSheet({partnerId}:{partnerId:string}){
  const router=useRouter();const[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <form className="flex flex-col gap-2" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const msg=await connectPartnerSheet(partnerId,url);setError(msg);router.refresh();}catch(e){setError(e instanceof Error?e.message:'Connection failed');}finally{setBusy(false);}}}>
    <input aria-label="Google Sheet URL" className={cls} placeholder="Paste Google Sheet URL after uploading and converting Excel template" value={url} onChange={e=>setUrl(e.target.value)} required/>
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
