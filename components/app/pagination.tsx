import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, totalPages, buildHref }: { page: number; totalPages: number; buildHref: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let value = start; value <= end; value += 1) pages.push(value);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
      <p className="text-xs text-[var(--muted)]">Page {page} of {totalPages}</p>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page === 1} className={`inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-xs ${page === 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[var(--canvas)]'}`} href={buildHref(Math.max(1, page - 1))}><ChevronLeft size={14} /> Prev</Link>
        {pages.map((value) => <Link key={value} href={buildHref(value)} className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-medium ${value === page ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-dark)]' : 'border-[var(--border)] hover:bg-[var(--canvas)]'}`}>{value}</Link>)}
        <Link aria-disabled={page === totalPages} className={`inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-xs ${page === totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-[var(--canvas)]'}`} href={buildHref(Math.min(totalPages, page + 1))}>Next <ChevronRight size={14} /></Link>
      </div>
    </div>
  );
}
