import RequestForm from '@/components/app/request-form';
import { getActiveProjects } from '@/services/projects';
import { getAutocompleteOptions } from '@/services/requests';

export default async function NewRequest() {
  const [projects, autocomplete] = await Promise.all([getActiveProjects(), getAutocompleteOptions()]);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Create Request</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Save once here. Supabase stays authoritative and the team sheet is updated automatically when available.</p>
      <RequestForm
        projects={projects}
        assignToSuggestions={autocomplete.assignTo}
        sharedWithSuggestions={autocomplete.sharedWith}
      />
    </div>
  );
}
