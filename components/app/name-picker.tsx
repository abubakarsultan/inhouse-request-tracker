'use client';

import { useEffect, useId, useState } from 'react';
import { IDENTITY_EVENT, IDENTITY_STORAGE_KEY, setBrowserIdentityName } from '@/lib/identity';

export default function NamePicker({ suggestions, large = false }: { suggestions: string[]; large?: boolean }) {
  const listId = useId();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName((window.localStorage.getItem(IDENTITY_STORAGE_KEY) ?? '').trim());
    const handler = (event: Event) => setName(String((event as CustomEvent<string>).detail ?? ''));
    window.addEventListener(IDENTITY_EVENT, handler);
    return () => window.removeEventListener(IDENTITY_EVENT, handler);
  }, []);

  function save() {
    setBrowserIdentityName(name);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div className={large ? 'max-w-xl rounded-2xl border border-[var(--border)] bg-white p-5' : 'flex flex-wrap items-end gap-2'}>
      <div className={large ? '' : 'min-w-56'}>
        <label htmlFor={`identity-${listId}`} className="mb-1 block text-xs font-medium text-[var(--muted)]">Who are you?</label>
        <input
          id={`identity-${listId}`}
          list={`identity-list-${listId}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
          }}
          placeholder="Your name"
          className="h-9 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
        />
        <datalist id={`identity-list-${listId}`}>
          {suggestions.map((item) => <option key={item} value={item} />)}
        </datalist>
      </div>
      <button type="button" onClick={save} className="h-9 rounded-lg bg-[var(--brand)] px-3 text-sm font-medium text-white hover:bg-[var(--brand-dark)]">
        {saved ? 'Saved ✓' : 'Save name'}
      </button>
      {large && <p className="mt-2 text-xs text-[var(--muted)]">Stored only in this browser. It is used for status audit history and request attribution, not authentication.</p>}
    </div>
  );
}
