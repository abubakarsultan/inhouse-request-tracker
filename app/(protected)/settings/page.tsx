import { RANKVIZ_DOMAIN } from '@/lib/auth-rules';
import { requireAdminProfile } from '@/lib/auth';
import SettingsDiagnostics from '@/components/app/settings-diagnostics';
import SettingsScriptPanel from '@/components/app/settings-script-panel';

export default async function Settings() {
  const profile = await requireAdminProfile();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Account access, connection diagnostics, and Google Sheet integration.</p>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold text-[var(--text)]">Access policy</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--canvas)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">Allowed Google domain</p><p className="mt-1 font-semibold text-[var(--text)]">@{RANKVIZ_DOMAIN}</p></div>
          <div className="rounded-xl bg-[var(--canvas)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">Current admin</p><p className="mt-1 truncate font-semibold text-[var(--text)]">{profile.email}</p></div>
          <div className="rounded-xl bg-[var(--canvas)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">Approval model</p><p className="mt-1 font-semibold text-[var(--text)]">Admin approval required</p></div>
        </div>
      </section>

      <SettingsDiagnostics />
      <SettingsScriptPanel />
    </div>
  );
}
