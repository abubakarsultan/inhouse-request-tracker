'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Shield, ShieldOff, UserRoundCheck, UserRoundX, RotateCcw, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  addTeamName,
  approveTeamUser,
  resetTeamUserMapping,
  setTeamNameActive,
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
  const [newName, setNewName] = useState('');
  const pendingUsers = useMemo(() => data.users.filter((user) => user.status === 'pending'), [data.users]);
  const selectableNames = useMemo(() => new Set(data.names.map((name) => name.name.trim().toLowerCase())), [data.names]);

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try { await action(); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed.'); }
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</p>}

      {pendingUsers.length > 0 && (
        <section className="rounded-2xl border border-[#f0c36d] bg-[var(--card)]">
          <div className="border-b border-[#f0c36d] p-4"><h2 className="font-semibold text-[#b06000]">Pending registrations</h2><p className="text-xs text-[var(--muted)]">Confirm the selected Guest Post Anchor name before approving access.</p></div>
          <div className="divide-y divide-[var(--border)]">
            {pendingUsers.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{user.sheetName || user.googleName || user.email}</p><p className="text-xs text-[var(--muted)]">{user.email} · Sheet name: {user.sheetName || 'not selected'} · {user.counts.assigned} matching historical row(s)</p></div><div className="flex gap-2"><button disabled={pending || !user.sheetName} onClick={() => run(() => approveTeamUser(user.id))} className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check size={15} />Approve & link history</button><button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'disabled'))} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[#c5221f] disabled:opacity-50"><UserRoundX size={15} />Reject</button></div></div>)}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold">Team accounts</h2><p className="text-xs text-[var(--muted)]">Manage access, roles, mappings, and workload.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-[var(--canvas)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="p-3">User</th><th className="p-3">Sheet name</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3 text-right">Assigned</th><th className="p-3 text-right">Live</th><th className="p-3 text-right">Pending</th><th className="p-3 text-right">Overdue</th><th className="p-3">Last login</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {data.users.map((user) => <tr key={user.id} className="border-t border-[var(--border)] align-top">
                <td className="p-3"><p className="font-semibold">{user.googleName || user.email}</p><p className="text-xs text-[var(--muted)]">{user.email}</p></td>
                <td className="p-3 font-medium">{user.sheetName || '—'}</td>
                <td className="p-3 capitalize">{user.role}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.status === 'active' ? 'bg-[#e6f4ea] text-[#188038]' : user.status === 'disabled' ? 'bg-[#fce8e6] text-[#c5221f]' : 'bg-[#fef7e0] text-[#b06000]'}`}>{user.status}</span></td>
                <td className="p-3 text-right font-semibold">{user.counts.assigned}</td><td className="p-3 text-right text-[#188038]">{user.counts.live}</td><td className="p-3 text-right text-[#b06000]">{user.counts.pending}</td><td className="p-3 text-right text-[#c5221f]">{user.counts.overdue}</td>
                <td className="p-3 text-xs text-[var(--muted)]">{formatDate(user.lastLoginAt)}</td>
                <td className="p-3"><div className="flex max-w-72 flex-wrap gap-1.5">
                  <Link href={`/team/${user.id}`} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs">View as user</Link>
                  {user.status === 'pending' && <><button disabled={pending || !user.sheetName} onClick={() => run(() => approveTeamUser(user.id))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><UserRoundCheck size={13} className="inline" /> Approve</button><button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'disabled'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[#c5221f]"><UserRoundX size={13} className="inline" /> Reject</button></>}
                  {user.status === 'active' ? <button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'disabled'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><UserRoundX size={13} className="inline" /> Disable</button> : user.status === 'disabled' && <button disabled={pending} onClick={() => run(() => setTeamUserStatus(user.id, 'active'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><UserRoundCheck size={13} className="inline" /> Enable</button>}
                  {user.role === 'admin' ? <button disabled={pending} onClick={() => run(() => setTeamUserRole(user.id, 'member'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><ShieldOff size={13} className="inline" /> Member</button> : <button disabled={pending} onClick={() => run(() => setTeamUserRole(user.id, 'admin'))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><Shield size={13} className="inline" /> Admin</button>}
                  <button disabled={pending} onClick={() => run(() => resetTeamUserMapping(user.id))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"><RotateCcw size={13} className="inline" /> Reset name</button>
                </div></td>
              </tr>)}
              {data.users.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-[var(--muted)]">No one has signed in yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold">Guest Post Anchor names</h2><p className="text-xs text-[var(--muted)]">These are the choices members see on first login.</p></div>
          <div className="p-4">
            <div className="mb-4 flex gap-2"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add exact sheet name" className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none" /><button disabled={pending || !newName.trim()} onClick={() => run(async () => { await addTeamName(newName); setNewName(''); })} className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-white"><Plus size={15} />Add</button></div>
            <div className="flex flex-wrap gap-2">{data.names.map((name) => <button key={name.id} disabled={pending || Boolean(name.claimedBy)} onClick={() => run(() => setTeamNameActive(name.id, !name.active))} title={name.claimedBy ? `Claimed by ${name.claimedBy}` : name.active ? 'Click to disable' : 'Click to enable'} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${!name.active ? 'opacity-45' : ''}`} style={{ background: name.badge_bg, color: name.badge_text }}>{name.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}{name.name}{name.claimedBy ? ' ✓' : ''}</button>)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] p-4"><h2 className="font-semibold">Unmatched sheet names</h2><p className="text-xs text-[var(--muted)]">Historical rows found for names that no account has claimed yet.</p></div>
          <div className="divide-y divide-[var(--border)]">{data.unmatched.map((row) => <div key={row.name} className="flex flex-wrap items-center justify-between gap-2 p-4"><span className="font-medium">{row.name}</span><div className="flex items-center gap-2"><span className="rounded-full bg-[var(--canvas)] px-2 py-1 text-xs text-[var(--muted)]">{row.rows} row(s)</span>{!selectableNames.has(row.name.trim().toLowerCase()) && <button disabled={pending} onClick={() => run(() => addTeamName(row.name))} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium">Add as team name</button>}</div></div>)}{data.unmatched.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">No unmatched historical names.</p>}</div>
        </section>
      </div>
    </div>
  );
}
