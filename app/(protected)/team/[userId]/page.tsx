import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminProfile } from '@/lib/auth';
import { getAdminUserWorkspace } from '@/services/member-workspace';
import MemberWorkspaceView from '@/components/app/member-workspace-view';

export default async function AdminUserView({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdminProfile();
  const { userId } = await params;
  const data = await getAdminUserWorkspace(userId);
  return (
    <div>
      <Link href="/team" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand)]"><ArrowLeft size={15} />Back to Team</Link>
      <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">Admin preview</p><h1 className="mt-1 text-2xl font-bold">{data.name}&apos;s workspace</h1><p className="mt-1 text-sm text-[var(--muted)]">This shows the work mapped to {data.email} without changing your admin identity.</p></div>
      <MemberWorkspaceView data={data} readOnly />
    </div>
  );
}
