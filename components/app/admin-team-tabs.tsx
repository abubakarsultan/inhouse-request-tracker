'use client';
import {useState,type ReactNode} from 'react';
import {Users,UserPlus,ShieldCheck} from 'lucide-react';

type Tab='team'|'invitations'|'access';
export default function AdminTeamTabs({team,invitations,access}:{team:ReactNode;invitations:ReactNode;access:ReactNode}){
  const [tab,setTab]=useState<Tab>('team');
  const choices:[Tab,string,typeof Users][]=[['team','Team members',Users],['invitations','Invitations',UserPlus],['access','Access & directory',ShieldCheck]];
  return <section className="space-y-5">
    <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3" role="tablist" aria-label="Admin management sections">
      {choices.map(([id,label,Icon])=><button key={id} type="button" id={`admin-tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`admin-panel-${id}`} onClick={()=>setTab(id)}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${tab===id?'bg-[var(--brand)] text-white':'border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--brand-soft)]'}`}><Icon size={16}/>{label}</button>)}
    </div>
    <div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
      {tab==='team'?team:tab==='invitations'?invitations:access}
    </div>
  </section>;
}
