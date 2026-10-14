import RequestEditForm from '@/components/app/request-edit-form';
import { getAutocompleteOptions, getRequestForEdit } from '@/services/requests';
import { requireActiveProfile } from '@/lib/auth';

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireActiveProfile();
  const { id } = await params;
  const [request, autocomplete] = await Promise.all([getRequestForEdit(id), getAutocompleteOptions()]);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Edit Request</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Changes update the database, linked project row, audit history, and the verified Guest Post Anchor row.</p>
      <RequestEditForm request={request as any} assignToSuggestions={autocomplete.assignTo} currentUser={{ role: profile.role, sheetName: profile.sheet_name || '' }} />
    </div>
  );
}
