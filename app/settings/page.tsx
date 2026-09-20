import NamePicker from '@/components/app/name-picker';
import { getAutocompleteOptions } from '@/services/requests';

export default async function Settings() {
  let suggestions: string[] = [];
  let suggestionError: string | null = null;
  try {
    suggestions = (await getAutocompleteOptions()).assignTo;
  } catch (caught) {
    suggestionError = caught instanceof Error ? caught.message : 'Could not load saved names';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">There is no account or login system. The old users-table management UI has been removed.</p>
      </div>
      <NamePicker suggestions={suggestions} large />
      {suggestionError && <p className="max-w-xl rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">Name autocomplete unavailable: {suggestionError}</p>}
      <div className="max-w-xl rounded-2xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">
        Your browser name is local to this device and is used for request/status audit attribution.
      </div>
    </div>
  );
}
