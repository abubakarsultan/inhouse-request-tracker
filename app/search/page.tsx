import SearchPanel from '@/components/app/search-panel';

export default function SearchPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Search Requests</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Search client, sub-project, approved site, anchor, assignee, status and target URL.</p>
      </div>
      <SearchPanel />
    </div>
  );
}
