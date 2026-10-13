import RequestForm from '@/components/app/request-form';
import { getActiveProjects } from '@/services/projects';
import { getAutocompleteOptions } from '@/services/requests';
import { requireActiveProfile } from '@/lib/auth';

export default async function NewRequest() {
  const profile = await requireActiveProfile();
  const [projects, autocomplete] = await Promise.all([getActiveProjects(), getAutocompleteOptions()]);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Create Request</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Save once here. Your Google email is stored with the request and mirrored to column H in Guest Post Anchor.</p>
      <RequestForm
        projects={projects}
        assignToSuggestions={autocomplete.assignTo}
        sharedWithSuggestions={autocomplete.sharedWith}
        currentUser={{ role: profile.role, sheetName: profile.sheet_name || '', email: profile.email }}
      />
    </div>
  );
}
