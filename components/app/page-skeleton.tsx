export default function PageSkeleton({ variant = 'table' }: { variant?: 'table' | 'cards' | 'detail' | 'form' }) {
  const block = 'rounded-lg bg-[var(--border)]/50 motion-safe:animate-pulse';
  return <div aria-label="Loading page" className="space-y-6" role="status">
    <span className="sr-only">Loading…</span>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-2"><div className={`${block} h-7 w-52`}/><div className={`${block} h-4 w-72 max-w-full`}/></div><div className={`${block} h-10 w-36`}/></div>
    {variant === 'cards' && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({length:6},(_,i)=><div key={i} className="rounded-2xl border border-[var(--border)] p-5"><div className={`${block} h-5 w-2/3`}/><div className={`${block} mt-5 h-20 w-full`}/><div className={`${block} mt-4 h-4 w-1/2`}/></div>)}</div>}
    {variant === 'detail' && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:4},(_,i)=><div key={i} className={`${block} h-24 rounded-xl`}/>)}</div><div className={`${block} h-44 rounded-2xl`}/></>}
    {variant === 'form' && <div className="rounded-2xl border border-[var(--border)] p-5 space-y-4">{Array.from({length:5},(_,i)=><div key={i} className={`${block} h-11 w-full`}/>)}</div>}
    {(variant === 'table' || variant === 'cards') && <div className="rounded-2xl border border-[var(--border)] p-4 space-y-3"><div className={`${block} h-10 w-full`}/>{Array.from({length:7},(_,i)=><div key={i} className={`${block} h-12 w-full`}/>)}</div>}
  </div>;
}
