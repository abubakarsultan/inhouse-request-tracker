'use client';

import { useState } from 'react';
import { createAuthBrowserClient } from '@/lib/supabase-browser';

export default function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const supabase = createAuthBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { hd: 'rankviz.com', prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (caught) {
      setPending(false);
      setError(caught instanceof Error ? caught.message : 'Could not start Google sign-in.');
    }
  }

  return (
    <div>
      <button type="button" onClick={signIn} disabled={pending} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold shadow-sm transition hover:bg-[var(--canvas)] disabled:opacity-50">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--card)] text-sm font-bold text-[#4285f4]">G</span>
        {pending ? 'Opening Google…' : 'Continue with Google'}
      </button>
      {error && <p className="mt-2 text-sm text-[#c5221f]">{error}</p>}
    </div>
  );
}
