import RequestForm from '@/components/app/request-form';
import { getActiveProjects } from '@/services/projects';
import { getAutocompleteOptions } from '@/services/requests';
import { requireActiveProfile } from '@/lib/auth';
import { listCollaborationPartners } from '@/services/collaboration';

export default async function NewRequest() {
  const profile = await requireActiveProfile();
  const [projects, autocomplete, collabPartners] = await Promise.all([getActiveProjects(), getAutocompleteOptions(), listCollaborationPartners().catch(error => { console.warn('[requests/new] Collaboration data unavailable; normal requests remain accessible:', error); return []; })]);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Create Request</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Requests are saved in the app first, then synced to the selected project’s Google Sheet using its column mapping. Your Google email is saved with each request.</p>
      <RequestForm
        collaborationPartners={collabPartners.map(p => ({ id: p.id, name: p.name, give: p.default_give_qty, receive: p.default_receive_qty }))}
        projects={(projects ?? []).map((project: any) => ({
          id: String(project.id),
          name: String(project.name),
          syncEnabled: project.sync_enabled === true,
          sheetName: String(project.sheet_name || (project.sheet_source === 'custom_sheet' ? 'Google Sheet' : 'Guest Post Anchor')),
          sheetTab: project.guest_post_tab_name ? String(project.guest_post_tab_name) : null,
          hasSheet: project.sheet_source === 'custom_sheet' ? Boolean(project.google_sheet_id) : Boolean(process.env.TEAM_SHEET_ID),
        }))}
        assignToSuggestions={autocomplete.assignTo}
        sharedWithSuggestions={autocomplete.sharedWith}
        currentUser={{ role: profile.role, sheetName: profile.sheet_name || '', email: profile.email }}
      />
    </div>
  );
}
