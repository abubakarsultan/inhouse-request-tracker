export default function Loading() {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-[#dadce0]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border border-[var(--border)] bg-white" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-[var(--border)] bg-white" />
    </div>
  );
}
