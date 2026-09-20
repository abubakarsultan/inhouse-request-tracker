export default function ProtectedLoading() {
  return (
    <div className="space-y-5" aria-live="polite" aria-busy="true">
      <div className="space-y-2"><div className="skeleton h-8 w-48 rounded-lg" /><div className="skeleton h-4 w-72 max-w-full rounded" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-28 rounded-2xl" />)}</div>
      <div className="skeleton h-14 rounded-xl" />
      <div className="skeleton h-[420px] rounded-2xl" />
    </div>
  );
}
