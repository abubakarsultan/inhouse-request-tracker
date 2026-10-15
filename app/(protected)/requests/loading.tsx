export default function AllRequestsLoading() {
  return <div aria-live="polite" aria-busy="true" className="space-y-5">
    <div className="skeleton h-9 w-52 rounded-lg"/>
    <div className="skeleton h-12 w-full rounded-xl"/>
    <div className="skeleton h-[440px] rounded-2xl"/>
  </div>;
}
