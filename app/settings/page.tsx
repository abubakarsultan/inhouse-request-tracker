import { headers } from 'next/headers';
import NamePicker from '@/components/app/name-picker';
import { getAutocompleteOptions } from '@/services/requests';
import { getConnectionDiagnostics } from '@/services/diagnostics';
import { buildInstallableTriggerSnippet } from '@/lib/sheet-webhook';

export default async function Settings() {
  let suggestions: string[] = [];
  let suggestionError: string | null = null;
  try {
    suggestions = (await getAutocompleteOptions()).assignTo;
  } catch (caught) {
    suggestionError = caught instanceof Error ? caught.message : 'Could not load saved names';
  }

  const diagnostics = await getConnectionDiagnostics();
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'YOUR-VERCEL-DOMAIN';
  const proto = requestHeaders.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const siteUrl = `${proto}://${host}`;
  const snippet = buildInstallableTriggerSnippet(siteUrl);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">No accounts or login. Identity is local to this browser; integrations run server-side.</p>
      </div>

      <NamePicker suggestions={suggestions} large />
      {suggestionError && <p className="max-w-xl rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">Name autocomplete unavailable: {suggestionError}</p>}

      <section className="rounded-2xl border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold text-[var(--text)]">Connection checks</h2><p className="text-xs text-[var(--muted)]">Read-only diagnostics. Nothing is changed automatically.</p></div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {diagnostics.map((item) => (
            <div key={item.key} className="rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-center justify-between gap-2"><p className="font-medium text-[var(--text)]">{item.label}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.ok ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[#fce8e6] text-[#c5221f]'}`}>{item.ok ? 'OK' : 'Needs attention'}</span></div>
              <p className="mt-2 text-xs text-[var(--muted)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] p-4">
          <h2 className="font-semibold text-[var(--text)]">Team sheet → site trigger</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Paste this into the team sheet&apos;s Apps Script project, replace the secret placeholder with the same Vercel SHEET_WEBHOOK_SECRET, save, then run installTrigger() once and authorize it.</p>
        </div>
        <div className="p-4">
          <textarea readOnly value={snippet} className="h-[520px] w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-xs leading-5 text-white outline-none" aria-label="Installable Apps Script webhook snippet" />
          <p className="mt-2 text-xs text-[var(--muted)]">Webhook URL is filled from this site: <span className="font-mono">{siteUrl}/api/sheet-webhook</span>. The trigger only reacts to column F edits on tabs whose A1:G1 headers match the project-tab layout.</p>
        </div>
      </section>
    </div>
  );
}
