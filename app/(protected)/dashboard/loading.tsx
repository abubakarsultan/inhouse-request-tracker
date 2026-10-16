export default function DashboardLoading() {
  return <div aria-live="polite" aria-busy="true" className="space-y-5">
    <div className="skeleton h-9 w-52 rounded-lg"/>
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-28 rounded-xl"/>)}
    </div>
    <div className="skeleton h-[420px] rounded-2xl"/>
  </div>;
}
