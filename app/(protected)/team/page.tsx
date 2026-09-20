import { requireAdminProfile } from '@/lib/auth';
import { getTeamAdminData } from '@/services/team';
import TeamAdminPanel from '@/components/app/team-admin-panel';

export default async function TeamPage() {
  await requireAdminProfile();
  const data = await getTeamAdminData();
  return <div><div className="mb-6"><h1 className="text-2xl font-bold">Team</h1><p className="mt-1 text-sm text-[var(--muted)]">Approve registrations, manage roles, and keep Google accounts mapped to exact Guest Post Anchor names.</p></div><TeamAdminPanel data={data} /></div>;
}
