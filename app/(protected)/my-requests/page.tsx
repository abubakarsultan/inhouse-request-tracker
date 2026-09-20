import { getMemberWorkspace } from '@/services/member-workspace';
import MemberWorkspaceView from '@/components/app/member-workspace-view';

export default async function MyRequestsPage() {
  const data = await getMemberWorkspace();
  return (
    <div>
      <div className="mb-6"><h1 className="text-2xl font-bold text-[var(--text)]">My Requests</h1><p className="mt-1 text-sm text-[var(--muted)]">Your account is mapped to <strong>{data.name}</strong> in Guest Post Anchor.</p></div>
      <MemberWorkspaceView data={data} />
    </div>
  );
}
