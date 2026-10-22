'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Archive, RotateCcw, Trash2, MoreHorizontal, X, LoaderCircle} from 'lucide-react';
import {setProjectArchived, deleteEmptyProject} from '@/services/projects';
import {setCollaborationPartnerArchived, deleteEmptyCollaborationPartner} from '@/services/collaboration';

type Props={kind:'project'|'partner';id:string;name:string;active:boolean};

/** Never destroys associated requests, deals, links or Google Sheets. */
export default function AdminRecordActions({kind,id,name,active}:Props){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [typed,setTyped]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  async function run(action:()=>Promise<string>){
    setBusy(true);setError('');setSuccess('');
    try{const message=await action();setSuccess(message);setConfirmDelete(false);setOpen(false);router.refresh();}
    catch(e){setError(e instanceof Error?e.message:'The action could not be completed.');}
    finally{setBusy(false);}
  }
  return <div className="relative inline-flex shrink-0 items-center gap-2">
    <button type="button" title={`Manage ${kind} ${name}`} aria-label={`Manage ${kind} ${name}`} aria-haspopup="menu" aria-expanded={open}
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--text)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:opacity-50"
      onClick={()=>{setOpen(x=>!x);setError('');setSuccess('');}} disabled={busy}>
      <MoreHorizontal size={17}/>
    </button>
    {open && <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl" role="menu">
      <button role="menuitem" type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--brand-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
        onClick={()=>run(()=>kind==='project'?setProjectArchived(id,active):setCollaborationPartnerArchived(id,active))} disabled={busy}>
        {active?<Archive size={15}/>:<RotateCcw size={15}/>} {active?'Archive':'Restore'} {kind}
      </button>
      <button role="menuitem" type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#c5221f] hover:bg-[#fce8e6] focus-visible:outline-2 focus-visible:outline-[#c5221f]"
        onClick={()=>{setConfirmDelete(true);setTyped('');setOpen(false);}}><Trash2 size={15}/> Delete permanently</button>
    </div>}
    {success&&<span role="status" className="max-w-64 text-xs text-[#188038]">{success}</span>}
    {error&&!confirmDelete&&<span role="alert" className="max-w-64 text-xs text-[#c5221f]">{error}</span>}
    {confirmDelete&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setConfirmDelete(false);}}>
      <section role="dialog" aria-modal="true" aria-label={`Delete ${kind} ${name}`} className="w-full max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--text)] shadow-2xl">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Permanently delete {kind}?</h2><button type="button" aria-label="Cancel deletion" disabled={busy} onClick={()=>setConfirmDelete(false)} className="cursor-pointer rounded-lg p-2 hover:bg-[var(--canvas)]"><X size={18}/></button></div>
        <p className="text-sm text-[var(--muted)]">Only an <b>empty</b> {kind} can be deleted. Records with associated {kind==='project'?'requests or site history':'links or exchange deals'} are protected; use Archive instead. Connected Google Sheets are never deleted.</p>
        <label htmlFor={`confirm-${kind}-${id}`} className="block text-sm font-medium">Type <b>{name}</b> to confirm</label>
        <input id={`confirm-${kind}-${id}`} value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off" className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-soft)]"/>
        {error&&<p role="alert" className="rounded-lg bg-[#fce8e6] p-3 text-sm text-[#9a1b16]">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setConfirmDelete(false)} className="cursor-pointer rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--canvas)]">Cancel</button><button type="button" disabled={busy||typed.trim()!==name} onClick={()=>run(()=>kind==='project'?deleteEmptyProject(id,typed):deleteEmptyCollaborationPartner(id,typed))} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#c5221f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a41917] disabled:cursor-not-allowed disabled:opacity-40">{busy&&<LoaderCircle size={14} className="animate-spin"/>} Delete empty {kind}</button></div>
      </section>
    </div>}
  </div>;
}
