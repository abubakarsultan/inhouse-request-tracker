'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {ChevronDown,ChevronRight,UsersRound,ArrowUpRight,Handshake,Search} from 'lucide-react';
import AdminRecordActions from '@/components/app/admin-record-actions';

type Partner={id:string;name:string;email?:string|null;website?:string|null;active:boolean;created_by?:string|null;owner?:{name:string;email:string}|null;overview?:{given_live:number;received_live:number;open_deals:number;owed_by_us:number;owed_by_partner:number}|null;sheet_setup_state?:string;sync_enabled:boolean;default_give_qty:number;default_receive_qty:number};
export default function CollaborationTeamDirectory({partners,members,isAdmin}:{partners:Partner[];members:{id:string;name:string;email:string}[];isAdmin:boolean}){
  const [expanded,setExpanded]=useState<string[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [showArchived,setShowArchived]=useState(false);
  const groups=useMemo(()=>{
    const map=new Map<string,{name:string;email:string;rows:Partner[]}>();
    for(const member of members) map.set(member.id,{name:member.name,email:member.email,rows:[]});
    for(const p of partners){
      if(!showArchived&&!p.active)continue;
      if(search&&!`${p.name} ${p.owner?.name||''} ${p.owner?.email||''} ${p.email||''}`.toLowerCase().includes(search.toLowerCase()))continue;
      const key=p.created_by||'unassigned';
      if(!map.has(key))map.set(key,{name:p.owner?.name||'Unassigned / former user',email:p.owner?.email||'',rows:[]});
      map.get(key)!.rows.push(p);
    }
    return [...map.entries()].map(([key,value])=>({key,...value})).filter(g=>!search||g.name.toLowerCase().includes(search.toLowerCase())||g.email.toLowerCase().includes(search.toLowerCase())||g.rows.length>0).sort((a,b)=>a.name.localeCompare(b.name));
  },[partners,members,showArchived,search]);
  const open=(id:string)=>setExpanded(old=>old.includes(id)?old.filter(k=>k!==id):[...old,id]);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{isAdmin?'Team Collaborations':'My Partners'}</h2><p className="text-xs text-[var(--muted)]">Open a team member to see partners, then open a partner to view their details.</p></div>
      <div className="flex flex-wrap items-center gap-3"><label className="relative"><Search size={15} className="absolute left-2.5 top-2.5 text-[var(--muted)]"/><input aria-label="Search partners or team members" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people or partners" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-sm focus:outline-2 focus:outline-[var(--brand)]"/></label>{isAdmin&&<label className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show archived</label>}</div>
    </div>
    {groups.map(group=><article key={group.key} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <button type="button" aria-expanded={expanded.includes(group.key)} onClick={()=>open(group.key)} className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--brand-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]">
        <span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--canvas)]"><UsersRound size={18}/></span><span className="min-w-0"><span className="block truncate font-semibold">{group.name}</span><span className="block truncate text-xs text-[var(--muted)]">{group.email&&`${group.email} · `}{group.rows.length} partner{group.rows.length!==1?'s':''}</span></span></span>
        {expanded.includes(group.key)?<ChevronDown size={19}/>:<ChevronRight size={19}/>}
      </button>
      {expanded.includes(group.key)&&<div className="space-y-1 border-t border-[var(--border)] p-2">
        {group.rows.length===0&&<p className="p-4 text-sm text-[var(--muted)]">No partners assigned to this team member yet.</p>}
        {group.rows.map(p=><div key={p.id} className="rounded-lg border border-transparent hover:border-[var(--border)]">
          <div className="flex items-center gap-1">
            <button type="button" onClick={()=>setSelected(current=>current===p.id?null:p.id)} aria-expanded={selected===p.id} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg p-3 text-left transition hover:bg-[var(--canvas)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]">
              <span className="flex min-w-0 items-center gap-3"><Handshake size={17} className="shrink-0 text-[var(--brand)]"/><span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}{!p.active&&<span className="ml-2 rounded bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] font-normal">Archived</span>}</span><span className="block text-xs text-[var(--muted)]">Given {p.overview?.given_live??'—'} · Received {p.overview?.received_live??'—'} · Open {p.overview?.open_deals??'—'}</span></span></span>
              {selected===p.id?<ChevronDown size={16}/>:<ChevronRight size={16}/>}
            </button>
            {isAdmin&&<div className="pr-2"><AdminRecordActions kind="partner" id={p.id} name={p.name} active={p.active}/></div>}
          </div>
          {selected===p.id&&<div className="space-y-3 rounded-lg bg-[var(--canvas)] p-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['Given Live',p.overview?.given_live],['Received Live',p.overview?.received_live],['We owe',p.overview?.owed_by_us],['Partner owes',p.overview?.owed_by_partner]].map(([label,value])=><div key={String(label)} className="rounded-md bg-[var(--card)] p-3"><div className="text-xs text-[var(--muted)]">{label}</div><strong className="text-lg">{value??'—'}</strong></div>)}</div>
            <p className="text-xs text-[var(--muted)]">Default agreement: {p.default_give_qty} Given : {p.default_receive_qty} Received · {p.sheet_setup_state==='connected'?'Sheet connected':'Sheet setup pending'} · {p.sync_enabled?'Sync enabled':'Sync off'}</p>
            <Link href={`/collaborations/${p.id}`} className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Open partner details <ArrowUpRight size={16}/></Link>
          </div>}
        </div>)}
      </div>}
    </article>)}
    {groups.length===0&&<div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted)]">No matching partners. {showArchived?'Try a different search.':'Create a partner or enable Show archived.'}</div>}
  </section>;
}
