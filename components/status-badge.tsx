export default function StatusBadge({ status, failedSync = false }: { status: string; failedSync?: boolean }) {
  if (failedSync) {
    return <span className="inline-flex rounded-full bg-[#fce8e6] px-2.5 py-1 text-xs font-medium text-[#c5221f]">Failed sync</span>;
  }
  if (status === 'Live') {
    return <span className="inline-flex rounded-full bg-[#e6f4ea] px-2.5 py-1 text-xs font-medium text-[#188038]">Live</span>;
  }
  if (status === 'Request shared') {
    return <span className="inline-flex rounded-full bg-[#fef7e0] px-2.5 py-1 text-xs font-medium text-[#b06000]">Request shared</span>;
  }
  if (status === 'Rejected') {
    return <span className="inline-flex rounded-full bg-[#fce8e6] px-2.5 py-1 text-xs font-medium text-[#c5221f]">Rejected</span>;
  }
  return <span className="inline-flex rounded-full bg-[#f1f3f4] px-2.5 py-1 text-xs font-medium text-[#5f6368]">{status || '—'}</span>;
}
