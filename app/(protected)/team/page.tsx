import { requireActiveProfile } from '@/lib/auth';
import { adminClient } from '@/lib/supabase-admin';
import { getTeamAdminData } from '@/services/team';
import TeamAdminPanel from '@/components/app/team-admin-panel';
import { ShieldCheck } from 'lucide-react';

export default async function TeamPage() {
  const profile = await requireActiveProfile();
  if (profile.role === 'viewer') {
    const { data: users, error } = await adminClient.from('users').select('id,email,google_name,avatar_url,sheet_name,role,account_status,last_login_at').order('email');
    if (error) throw new Error(error.message);
    return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Team directory</h1><p className="mt-1 text-sm text-[var(--muted)]">Read-only view of team access and account status.</p></div><div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]"><table className="w-full min-w-[700px] text-sm"><thead className="bg-[var(--canvas)] text-left"><tr><th className="p-3">User</th><th className="p-3">Sheet name</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Last login</th></tr></thead><tbody>{(users ?? []).map((user: any) => <tr key={user.id} className="border-t border-[var(--border)]"><td className="p-3"><div className="flex items-center gap-2">{user.avatar_url && <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full"/>}<div><p className="font-medium">{user.google_name || user.email}</p><p className="text-xs text-[var(--muted)]">{user.email}</p></div></div></td><td className="p-3">{user.sheet_name || '—'}</td><td className="p-3 capitalize">{user.role}</td><td className="p-3 capitalize">{user.account_status}</td><td className="p-3">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</td></tr>)}</tbody></table></div></div>;
  }
  const data = await getTeamAdminData();
  const pending = data.users.filter((user) => user.status === 'pending').length;
  const invalid = data.unmatched.filter((row) => row.invalid).length;
  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#e8f0fe] px-2.5 py-1 text-xs font-bold text-[#174ea6]"><ShieldCheck size={13} /> ADMIN CONTROL</div>
          <h1 className="text-2xl font-bold">Team & Approvals</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Approve registrations, manage roles, fix invalid assignments, and keep Google accounts mapped to exact Guest Post Anchor names.</p>
        </div>
        <div className="flex gap-2 text-xs"><span className="rounded-full bg-[#fef7e0] px-3 py-1.5 font-semibold text-[#b06000]">{pending} pending approval{pending === 1 ? '' : 's'}</span><span className="rounded-full bg-[#fce8e6] px-3 py-1.5 font-semibold text-[#c5221f]">{invalid} invalid label{invalid === 1 ? '' : 's'}</span></div>
      </div>
      <TeamAdminPanel data={data} />
    </div>
  );
}
