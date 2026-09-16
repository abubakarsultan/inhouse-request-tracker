import { getDashboardStats } from '@/services/requests';
import { FolderKanban, Link2, Clock, XCircle, LayoutGrid } from 'lucide-react';

const CARDS = [
  { key: 'total', label: 'Total Requests', icon: LayoutGrid, tone: 'text-slate-700' },
  { key: 'live', label: 'Live Links', icon: Link2, tone: 'text-emerald-600' },
  { key: 'pending', label: 'Pending Requests', icon: Clock, tone: 'text-blue-600' },
  { key: 'removed', label: 'Removed Links', icon: XCircle, tone: 'text-red-500' },
  { key: 'projects', label: 'Total Projects', icon: FolderKanban, tone: 'text-indigo-600' },
] as const;

export default async function Dashboard() {
  const stats = await getDashboardStats();
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CARDS.map(({ key, label, icon: Icon, tone }) => (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <Icon size={18} className={tone} />
            <p className="mt-3 text-3xl font-bold text-slate-900">{stats[key as keyof typeof stats]}</p>
            <p className="text-sm text-slate-400">{label}</p>
          </div>
        ))}
      </div>
    </>
  );
}
