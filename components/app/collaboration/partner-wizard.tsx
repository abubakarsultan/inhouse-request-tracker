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
