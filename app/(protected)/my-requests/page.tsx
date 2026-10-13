import Link from 'next/link';
import { Plus } from 'lucide-react';
import MyRequestsView, { type MyRequestsFilterState } from '@/components/app/my-requests-view';
import { getMemberDashboardWorkspace, getMyRequestsPage } from '@/services/member-workspace';
import { getActiveProjects } from '@/services/projects';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters: MyRequestsFilterState = {
    q: first(params.q),
    project: first(params.project),
    status: first(params.status),
    priority: first(params.priority),
    deadline: first(params.deadline),
    source: first(params.source),
    sort: first(params.sort) || 'newest',
    pageSize: first(params.pageSize) || '25',
  };
  const page = Math.max(1, Number(first(params.page) || '1') || 1);
  const pageSize = [25, 50, 100].includes(Number(filters.pageSize)) ? Number(filters.pageSize) : 25;

  const [summary, data, projects] = await Promise.all([
    getMemberDashboardWorkspace(),
    getMyRequestsPage({ ...filters, page, pageSize }),
    getActiveProjects(),
  ]);

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-[var(--text)]">My Requests</h1><p className="mt-1 text-sm text-[var(--muted)]">Your account is mapped to <strong>{summary.name}</strong> in Guest Post Anchor. Search, filter, update, edit, or archive your own work here.</p></div>
        <Link href="/requests/new" className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--brand-dark)]"><Plus size={16} />New Request</Link>
      </div>
      <MyRequestsView
        data={data}
        summary={summary}
        projects={(projects ?? []).map((project: any) => ({ id: String(project.id), name: String(project.name) }))}
        filters={filters}
      />
    </div>
  );
}
