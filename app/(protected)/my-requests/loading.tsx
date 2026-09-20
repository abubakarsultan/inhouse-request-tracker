export default function MyRequestsLoading() {
  return (
    <div className="space-y-5" aria-live="polite" aria-busy="true">
      <div className="space-y-2"><div className="skeleton h-8 w-44 rounded-lg" /><div className="skeleton h-4 w-96 max-w-full rounded" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-28 rounded-2xl" />)}</div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"><div className="skeleton h-10 w-full rounded-lg" /><div className="mt-3 grid gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton h-10 rounded-lg" />)}</div></div>
      <div className="skeleton h-[420px] rounded-2xl" />
    </div>
  );
}
