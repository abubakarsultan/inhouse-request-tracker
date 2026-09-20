import NamePicker from '@/components/app/name-picker';
import { getAutocompleteOptions } from '@/services/requests';

export default async function Topbar() {
  let suggestions: string[] = [];
  let suggestionError: string | null = null;
  try {
    suggestions = (await getAutocompleteOptions()).assignTo;
  } catch (caught) {
    suggestionError = caught instanceof Error ? caught.message : 'Could not load name suggestions';
  }

  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[var(--text)]">Rankviz outreach operations</p>
        <p className="text-xs text-[var(--muted)]">Database first · Google Sheet mirror</p>
        {suggestionError && <p className="mt-1 max-w-md text-xs text-[#c5221f]">Name autocomplete unavailable: {suggestionError}</p>}
      </div>
      <NamePicker suggestions={suggestions} />
    </header>
  );
}
