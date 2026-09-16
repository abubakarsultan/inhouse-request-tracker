import { getCurrentUser } from '@/lib/session';
import { getAllUsers } from '@/services/users';
import UserRowControls from '@/components/app/user-row-controls';
import { Badge } from '@/components/ui/badge';

export default async function Settings() {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role !== 'admin') {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Settings</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          User management and integration settings are admin-only. Ask an admin if you need something changed here.
        </div>
      </div>
    );
  }

  const users = await getAllUsers();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Settings</h1>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Users</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Manage</th></tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="p-3 font-medium text-slate-800">{u.name || '—'}</td>
                  <td className="p-3 text-slate-500">{u.email}</td>
                  <td className="p-3"><Badge tone={u.role === 'admin' ? 'indigo' : 'slate'}>{u.role}</Badge></td>
                  <td className="p-3"><Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Disabled'}</Badge></td>
                  <td className="p-3">
                    <UserRowControls id={u.id} role={u.role} active={u.active} isSelf={u.id === user.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          New users appear automatically the first time they sign in with their @rankviz.com Google account.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Google Sheet sync</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 space-y-2">
          <p>Per-project sync (spreadsheet ID, tab name, on/off) is configured from each project's edit dialog on the Projects page.</p>
          <p>To finish setting it up for real, see the <b>Google Sheets sync</b> section of the README included with this codebase — it covers the service account, sharing the sheet, and the Apps Script snippet for instant sheet → app updates.</p>
        </div>
      </div>
    </div>
  );
}
