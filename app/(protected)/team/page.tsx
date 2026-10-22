import { requireAdminProfile } from '@/lib/auth';
import { getTeamAdminData } from '@/services/team';
import TeamAdminPanel from '@/components/app/team-admin-panel';
import { ShieldCheck } from 'lucide-react';
import InviteUserPanel from '@/components/app/invite-user-panel';
import AccessRequestPanel from '@/components/app/access-request-panel';
import { getAccessRequests, getPendingInvitations, getTeamDirectory, getRecentUserAudits } from '@/services/team';
import TeamDirectoryPanel from '@/components/app/team-directory-panel';
import AdminTeamTabs from '@/components/app/admin-team-tabs';

export default async function TeamPage() {
  await requireAdminProfile();
  const [data, accessRequests, invitations, directory, audits] = await Promise.all([getTeamAdminData(), getAccessRequests(), getPendingInvitations(), getTeamDirectory(), getRecentUserAudits()]);
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
      <AdminTeamTabs
        team={<TeamAdminPanel data={data} />}
        invitations={<div className="space-y-5"><InviteUserPanel /><AccessRequestPanel requests={accessRequests as any} invitations={invitations as any} /></div>}
        access={<TeamDirectoryPanel entries={directory as any} audits={audits as any} />}
      />
    </div>
  );
}
