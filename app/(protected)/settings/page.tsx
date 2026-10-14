import { headers } from 'next/headers';
import { getConnectionDiagnostics } from '@/services/diagnostics';
import { buildInstallableTriggerSnippet } from '@/lib/sheet-webhook';
import { requireAdminProfile } from '@/lib/auth';
import { RANKVIZ_DOMAIN } from '@/lib/auth-rules';

export default async function Settings() {
  const profile = await requireAdminProfile();
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
        <p className="mt-1 text-sm text-[var(--muted)]">Authentication, database, and Google Sheet diagnostics for the admin workspace.</p>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold">Access policy</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--canvas)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">Allowed Google domain</p><p className="mt-1 font-semibold">@{RANKVIZ_DOMAIN}</p></div>
          <div className="rounded-xl bg-[var(--canvas)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">Current admin</p><p className="mt-1 truncate font-semibold">{profile.email}</p></div>
          <div className="rounded-xl bg-[var(--canvas)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">Approval model</p><p className="mt-1 font-semibold">Admin approval required</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold text-[var(--text)]">Connection checks</h2><p className="text-xs text-[var(--muted)]">Read-only diagnostics. Nothing is changed automatically.</p></div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {diagnostics.map((item) => (
            <div key={item.key} className="rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-center justify-between gap-2"><p className="font-medium text-[var(--text)]">{item.label}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.ok ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[#fce8e6] text-[#c5221f]'}`}>{item.ok ? 'OK' : 'Needs attention'}</span></div>
              <p className="mt-2 text-xs text-[var(--muted)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-4">
          <h2 className="font-semibold text-[var(--text)]">Team sheet → site trigger</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Keep this installable trigger in the Guest Post Anchor sheet. It sends column F status edits back to this site.</p>
        </div>
        <div className="p-4">
          <textarea readOnly value={snippet} className="h-[520px] w-full rounded-xl border border-[var(--border)] bg-[#202124] p-4 font-mono text-xs leading-5 text-white outline-none" aria-label="Installable Apps Script webhook snippet" />
          <p className="mt-2 text-xs text-[var(--muted)]">Webhook URL: <span className="font-mono">{siteUrl}/api/sheet-webhook</span>. Existing column-F trigger behavior remains unchanged.</p>
        </div>
      </section>
    </div>
  );
}
