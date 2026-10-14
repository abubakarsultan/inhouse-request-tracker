import { Suspense } from 'react';
import RequestForm from '@/components/app/request-form';
import { getActiveProjects } from '@/services/projects';
import { getAutocompleteOptions } from '@/services/requests';
import { requireActiveProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
<<<<<<< HEAD

function FormLoading() {
  return <div className="space-y-4 animate-pulse"><div className="h-24 rounded-2xl bg-[var(--card)]" /><div className="h-[520px] rounded-2xl bg-[var(--card)]" /></div>;
}

async function RequestFormData() {
  const profile = await requireActiveProfile();
  if (profile.role === 'viewer') redirect('/requests');
  const [projects, autocomplete] = await Promise.all([getActiveProjects(), getAutocompleteOptions()]);
  return <RequestForm projects={projects} assignToSuggestions={autocomplete.assignTo} sharedWithSuggestions={autocomplete.sharedWith} currentUser={{ role: profile.role, sheetName: profile.sheet_name || '', email: profile.email }} />;
}

export default async function NewRequest() {
=======

export default async function NewRequest() {
  const profile = await requireActiveProfile();
  if (profile.role === 'viewer') redirect('/requests');
  const [projects, autocomplete] = await Promise.all([getActiveProjects(), getAutocompleteOptions()]);
>>>>>>> f3e97b6ad9f1ab3a675d8c331663e2fb637687ad
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Create Request</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Save once here. Your Google email is stored with the request and mirrored to column H in Guest Post Anchor.</p>
      <Suspense fallback={<FormLoading />}><RequestFormData /></Suspense>
    </div>
  );
}
