// Section 3 decision: "Assign To" / "Shared With" are free text now — the
// users table and all Settings user-management UI are removed. This page
// becomes "Who are you?" + connection checks (full version is Phase 4,
// section 7.4) — this is a lightweight placeholder so the page still works.
export default async function Settings() {
  const checks = [
    { label: 'Supabase configured', ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { label: 'Google service account configured', ok: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) },
    { label: 'Team sheet ID set', ok: Boolean(process.env.TEAM_SHEET_ID) },
    { label: 'Webhook secret set', ok: Boolean(process.env.SHEET_WEBHOOK_SECRET) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Settings</h1>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Connections</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center justify-between p-4 text-sm">
              <span className="text-slate-700">{c.label}</span>
              <span className={c.ok ? 'font-medium text-emerald-600' : 'font-medium text-red-500'}>{c.ok ? 'OK' : 'Not set'}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          There is no login — everyone who opens this site can use it. Your display name (used on new requests and status
          changes) is a browser-only "Who are you?" picker, not an account.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Google Sheet sync</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 space-y-2">
          <p>All projects share one team spreadsheet (TEAM_SHEET_ID). Per-project sync on/off and the tab name are set from the Projects page.</p>
          <p>The Apps Script snippet for two-way sync (Phase 4) will be shown here once the installable trigger is wired up.</p>
        </div>
      </div>
    </div>
  );
}
