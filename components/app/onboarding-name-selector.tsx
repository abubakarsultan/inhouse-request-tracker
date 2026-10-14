'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { completeOnboarding, type TeamNameOption } from '@/services/team';

export default function OnboardingNameSelector({ names }: { names: TeamNameOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(() => names.filter((name) => name.name.toLowerCase().includes(query.toLowerCase())), [names, query]);

  function submit() {
    if (!selected) { setError('Select your exact Guest Post Anchor name.'); return; }
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeOnboarding(selected);
        router.replace(result.pending ? '/pending' : '/dashboard');
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not save your profile.');
      }
    });
  }

  return (
    <div>
      <div className="relative mb-4"><Search size={16} className="absolute left-3 top-3 text-[var(--muted)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your name…" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)]" /></div>
      <div className="flex max-h-72 flex-wrap content-start gap-2 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-3">
        {filtered.map((item) => {
          const unavailable = Boolean(item.claimedBy);
          const active = selected === item.id;
          return <button key={item.id} type="button" disabled={unavailable} onClick={() => setSelected(item.id)} title={unavailable ? 'Already linked to another account' : item.name} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--card)]' : ''} ${unavailable ? 'cursor-not-allowed opacity-35' : 'hover:-translate-y-0.5'}`} style={{ background: item.badge_bg, color: item.badge_text }}>{item.name}</button>;
        })}
        {filtered.length === 0 && <p className="p-3 text-sm text-[var(--muted)]">No matching approved name. Contact an admin if your team mapping is incorrect.</p>}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Choose the name exactly as it appears in Guest Post Anchor. A member account is sent to admin approval before any private work data is shown.</p>
      {error && <p className="mt-3 rounded-lg bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</p>}
      <button type="button" disabled={pending || !selected} onClick={submit} className="mt-5 h-11 w-full rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">{pending ? 'Saving…' : 'Continue'}</button>
    </div>
  );
}
