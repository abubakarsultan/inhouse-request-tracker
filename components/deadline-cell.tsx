import { deadlineCellClass } from '@/lib/date';

export default function DeadlineCell({ deadline, status, today }: { deadline?: string | null; status: string; today: string }) {
  return (
    <span className={`inline-flex min-w-24 rounded-md px-2 py-1 text-xs font-medium ${deadlineCellClass(deadline, status, today)}`}>
      {deadline || '—'}
    </span>
  );
}
