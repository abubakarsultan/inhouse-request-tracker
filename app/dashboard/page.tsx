import { getDashboardStats } from '@/services/requests';
import { Link2, Clock, AlertTriangle, LayoutGrid, CalendarDays } from 'lucide-react';

const CARDS = [
  { key: 'total', label: 'Total Requests', icon: LayoutGrid },
  { key: 'live', label: 'Live Links', icon: Link2 },
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'failedSync', label: 'Failed Sync', icon: AlertTriangle },
  { key: 'thisMonth', label: 'This Month', icon: CalendarDays },
] as const;

export default async function Dashboard() {
  const stats = await getDashboardStats();
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Live request and sync overview.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CARDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <Icon size={18} className={key === 'live' ? 'text-[#188038]' : key === 'failedSync' ? 'text-[#c5221f]' : key === 'pending' ? 'text-[#b06000]' : 'text-[var(--brand)]'} />
            <p className="mt-3 text-3xl font-bold text-[var(--text)]">{stats[key]}</p>
            <p className="text-sm text-[var(--muted)]">{label}</p>
          </div>
        ))}
      </div>
    </>
  );
}
