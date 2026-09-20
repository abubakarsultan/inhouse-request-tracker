import MyRequestsPanel from '@/components/app/my-requests-panel';
import { getAutocompleteOptions } from '@/services/requests';

export default async function MyRequestsPage() {
  const suggestions = (await getAutocompleteOptions()).assignTo;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">My Requests</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Assigned work, deadlines, and status controls based on your browser name picker.</p>
      </div>
      <MyRequestsPanel suggestions={suggestions} />
    </div>
  );
}
