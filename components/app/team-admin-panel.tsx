'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Shield, ShieldOff, UserRoundCheck, UserRoundX, RotateCcw, AlertTriangle, UsersRound } from 'lucide-react';
import {
  approveTeamUser,
  reassignHistoricalName,
  resetTeamUserMapping,
  setTeamUserRole,
  setTeamUserStatus,
  type TeamAdminData,
} from '@/services/team';

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export default function TeamAdminPanel({ data }: { data: TeamAdminData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState<Record<string, string>>({});
  const pendingUsers = useMemo(() => data.users.filter((user) => user.status === 'pending'), [data.users]);
  const activeNames = useMemo(() => data.names.filter((name) => name.active), [data.names]);
  const invalidAssignments = useMemo(() => data.unmatched.filter((row) => row.invalid), [data.unmatched]);
  const validUnclaimed = useMemo(() => data.unmatched.filter((row) => !row.invalid), [data.unmatched]);

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Action failed.');
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</p>}

      <section className={`rounded-2xl border bg-[var(--card)] ${pendingUsers.length ? 'border-[#f0c36d]' : 'border-[var(--border)]'}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 ${pendingUsers.length ? 'border-[#f0c36d]' : 'border-[var(--border)]'}`}>
          <div>
            <h2 className={`font-semibold ${pendingUsers.length ? 'text-[#b06000]' : ''}`}>Team approvals</h2>
            <p className="text-xs text-[var(--muted)]">See exactly who signed in, which Guest Post Anchor name they selected, and how much history will be linked.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pendingUsers.length ? 'bg-[#fef7e0] text-[#b06000]' : 'bg-[#e6f4ea] text-[#188038]'}`}>{pendingUsers.length} pending</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {pendingUsers.map((user) => (
            <div key={user.id} className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Google name</p><p className="font-semibold">{user.googleName || 'Not provided'}</p></div>
                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Rankviz email</p><p className="truncate font-medium" title={user.email}>{user.email}</p></div>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Selected sheet name</p><p className="font-semibold text-[var(--brand-dark)]">{user.sheetName || 'Not selected'}</p></div>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Existing records</p><p className="font-semibold">{user.counts.assigned}</p></div>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Requested</p><p className="text-xs text-[var(--muted)]">{formatDate(user.requestedAt)}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={pending || !user.sheetName} onClick={() => run(() => approveTeamUser(user.id))} className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check size={15} />Approve & link data</button>
                <button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'disabled'))} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[#c5221f] disabled:opacity-50"><UserRoundX size={15} />Reject</button>
              </div>
            </div>
          ))}
          {pendingUsers.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">No registrations are waiting for approval.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold">Team accounts</h2><p className="text-xs text-[var(--muted)]">Manage access, role, exact sheet-name mapping, and workload.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">User</th><th className="p-3">Sheet name</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3 text-right">Assigned</th><th className="p-3 text-right">Live</th><th className="p-3 text-right">Pending</th><th className="p-3 text-right">Rejected</th><th className="p-3 text-right">Overdue</th><th className="p-3">Last login</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {data.users.map((user) => <tr key={user.id} className="border-t border-[var(--border)] align-top">
                <td className="p-3"><p className="font-semibold">{user.googleName || user.email}</p><p className="text-xs text-[var(--muted)]">{user.email}</p></td>
                <td className="p-3 font-medium">{user.sheetName || '—'}</td>
                <td className="p-3 capitalize">{user.role}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.status === 'active' ? 'bg-[#e6f4ea] text-[#188038]' : user.status === 'disabled' ? 'bg-[#fce8e6] text-[#c5221f]' : 'bg-[#fef7e0] text-[#b06000]'}`}>{user.status}</span></td>
                <td className="p-3 text-right font-semibold">{user.counts.assigned}</td><td className="p-3 text-right text-[#188038]">{user.counts.live}</td><td className="p-3 text-right text-[#b06000]">{user.counts.pending}</td><td className="p-3 text-right text-[#c5221f]">{user.counts.rejected}</td><td className="p-3 text-right text-[#c5221f]">{user.counts.overdue}</td>
                <td className="p-3 text-xs text-[var(--muted)]">{formatDate(user.lastLoginAt)}</td>
                <td className="p-3"><div className="flex max-w-72 flex-wrap gap-1.5">
                  <Link href={`/team/${user.id}`} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs">View as user</Link>
                  {user.status === 'pending' && <><button disabled={pending || !user.sheetName} onClick={() => run(() => approveTeamUser(user.id))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><UserRoundCheck size={13} className="inline" /> Approve</button><button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'disabled'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[#c5221f]"><UserRoundX size={13} className="inline" /> Reject</button></>}
                  {user.status === 'active' ? <button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'disabled'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><UserRoundX size={13} className="inline" /> Disable</button> : user.status === 'disabled' && <button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'active'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><UserRoundCheck size={13} className="inline" /> Enable</button>}
                  {user.role === 'admin' ? <button disabled={pending} onClick={() => run(() => setTeamUserRole(user.id, 'member'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><ShieldOff size={13} className="inline" /> Member</button> : <button disabled={pending} onClick={() => run(() => setTeamUserRole(user.id, 'admin'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><Shield size={13} className="inline" /> Admin</button>}
                  <button disabled={pending} onClick={() => run(() => resetTeamUserMapping(user.id))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><RotateCcw size={13} className="inline" /> Reset name</button>
                </div></td>
              </tr>)}
              {data.users.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-[var(--muted)]">No one has signed in yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold">Approved Guest Post Anchor names</h2><p className="text-xs text-[var(--muted)]">This roster is intentionally fixed to the seven people supplied by the team.</p></div>
          <div className="flex flex-wrap gap-2 p-4">
            {activeNames.map((name) => <div key={name.id} title={name.claimedBy ? `Claimed by ${name.claimedBy}` : 'Not claimed yet'} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={{ background: name.badge_bg, color: name.badge_text }}><UsersRound size={13} />{name.name}{name.claimedBy ? ' ✓' : ''}</div>)}
          </div>
        </section>

        <section className={`rounded-2xl border bg-[var(--card)] ${invalidAssignments.length ? 'border-[#f4b7b2]' : 'border-[var(--border)]'}`}>
          <div className={`border-b p-4 ${invalidAssignments.length ? 'border-[#f4b7b2]' : 'border-[var(--border)]'}`}><h2 className={`font-semibold ${invalidAssignments.length ? 'text-[#c5221f]' : ''}`}>Invalid assignments</h2><p className="text-xs text-[var(--muted)]">Labels such as Index / No Index are not people. Reassign their historical requests to one of the seven approved names.</p></div>
          <div className="divide-y divide-[var(--border)]">
            {invalidAssignments.map((row) => <div key={row.name} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2"><AlertTriangle size={16} className="text-[#c5221f]" /><div><p className="font-semibold">{row.name}</p><p className="text-xs text-[var(--muted)]">{row.rows} active request(s)</p></div></div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={reassignTo[row.name] ?? ''} onChange={(event) => setReassignTo((old) => ({ ...old, [row.name]: event.target.value }))} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs">
                  <option value="">Reassign to…</option>{activeNames.map((name) => <option key={name.id} value={name.name}>{name.name}</option>)}
                </select>
                <button disabled={pending || !reassignTo[row.name]} onClick={() => run(() => reassignHistoricalName(row.name, reassignTo[row.name]))} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Reassign</button>
              </div>
            </div>)}
            {invalidAssignments.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">No invalid person labels remain.</p>}
          </div>
        </section>
      </div>

      {validUnclaimed.length > 0 && <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]"><div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold">Approved names not yet claimed</h2><p className="text-xs text-[var(--muted)]">These rows already use a valid person name; they will link automatically when that person registers and is approved.</p></div><div className="flex flex-wrap gap-2 p-4">{validUnclaimed.map((row) => <span key={row.name} className="rounded-full bg-[var(--canvas)] px-3 py-1.5 text-xs"><strong>{row.name}</strong> · {row.rows} request(s)</span>)}</div></section>}
    </div>
  );
}
