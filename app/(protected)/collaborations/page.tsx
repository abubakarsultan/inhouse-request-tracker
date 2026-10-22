import { requireActiveProfile } from '@/lib/auth';
import { listCollaborationPartners } from '@/services/collaboration';
import PartnerWizard from '@/components/app/collaboration/partner-wizard';
import { UsersRound, Sheet, Link2 } from 'lucide-react';
import CollaborationTeamDirectory from '@/components/app/collaboration-team-directory';
import {getServiceAccountEmail} from '@/lib/google-sheet-setup';
import {adminClient} from '@/lib/supabase-admin';

export default async function CollaborationsPage(){
  const profile=await requireActiveProfile();
  let partners: Awaited<ReturnType<typeof listCollaborationPartners>>=[];
  let error='';
  let teamMembers: {id:string;name:string;email:string}[]=[];
  if(profile.role==='admin'){
    const {data:users,error:teamError}=await adminClient.from('users').select('id,name,email').eq('account_status','active').order('email').limit(300);
    if(teamError)console.warn('[collaborations] Team directory unavailable:',teamError.message);
    teamMembers=(users||[]).map(u=>({id:String(u.id),name:String(u.name||u.email||'Team member'),email:String(u.email||'')}));
  }else{teamMembers=[{id:String(profile.id),name:String(profile.google_name||profile.email||'My account'),email:String(profile.email||'')}];}
  try{partners=await listCollaborationPartners();}catch(e){error=e instanceof Error?e.message:'Cannot load collaborations';}
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Collaborations</h1><p className="mt-1 text-sm text-[var(--muted)]">Track partners, flexible exchanges, Live links, outstanding obligations and Google Sheets.</p></div>
    {error&&<div className="rounded-xl border border-[#f5b5b1] bg-[#fce8e6] p-4 text-sm text-[#8a1c16]">Unable to load partners: {error}. Run <code>database/migrations/010_collaboration_module.sql</code> in Supabase first.</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><UsersRound className="text-[var(--brand)]" size={18}/><div className="mt-2 text-2xl font-bold">{partners.filter(p=>p.active).length}</div><p className="text-xs text-[var(--muted)]">Partners</p></div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><Sheet className="text-[#188038]" size={18}/><div className="mt-2 text-2xl font-bold">{partners.filter(p=>p.active&&p.sheet_setup_state==='connected').length}</div><p className="text-xs text-[var(--muted)]">Connected Sheets</p></div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"><Link2 className="text-[var(--brand)]" size={18}/><div className="mt-2 text-2xl font-bold">{partners.filter(p=>p.active).reduce((total,p)=>total+Number(p.overview?.open_deals||0),0)}</div><p className="text-xs text-[var(--muted)]">Open Exchanges</p></div>
    </div>
    <details className="rounded-2xl" open={!partners.length}><summary className="mb-3 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm font-bold">+ Create Collaboration Partner</summary><PartnerWizard serviceAccountEmail={getServiceAccountEmail()}/></details>
    <CollaborationTeamDirectory partners={partners} members={teamMembers} isAdmin={profile.role==='admin'}/>

  </div>;
}
