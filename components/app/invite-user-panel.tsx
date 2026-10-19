'use client';
import { useState } from 'react';
import { createUserInvitation } from '@/services/team';

export default function InviteUserPanel() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'member'|'admin'>('member');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await createUserInvitation(email, name, role); setMessage('Invitation saved. The person can now sign in with that Google email.'); setEmail(''); setName(''); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not create invitation.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
    <h2 className="text-lg font-bold">Invite external user</h2><p className="mt-1 text-sm text-[var(--muted)]">Send access by registering their exact Google email. Rankviz fixed team accounts do not need invitations.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="person@example.com" className="h-11 rounded-lg border border-[var(--border)] bg-transparent px-3 text-sm"/><input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name (optional)" className="h-11 rounded-lg border border-[var(--border)] bg-transparent px-3 text-sm"/><select value={role} onChange={e=>setRole(e.target.value as 'member'|'admin')} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="member">User</option><option value="admin">Admin</option></select></div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?'Saving…':'Create invitation'}</button>{message && <p className="text-sm">{message}</p>}</div>
  </form>;
}
