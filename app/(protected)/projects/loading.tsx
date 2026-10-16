export default function ProjectsLoading() {
  return <div aria-live="polite" aria-busy="true" className="space-y-5">
    <div className="skeleton h-9 w-52 rounded-lg"/>
    <div className="skeleton h-12 w-full rounded-xl"/>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-64 rounded-2xl"/>)}
    </div>
  </div>;
}
