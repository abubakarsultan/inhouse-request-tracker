'use client';

import { useState } from 'react';
import { createAuthBrowserClient } from '@/lib/supabase-browser';

export default function GoogleSignInButton({ mode = 'google' }: { mode?: 'rankviz' | 'google' }) {
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
          redirectTo: `${window.location.origin}/auth/callback?mode=${mode}`, 
          queryParams: { ...(mode === 'rankviz' ? { hd: 'rankviz.com' } : {}), prompt: 'select_account' },
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
        {mode === 'rankviz' ? <img src="/rankviz-logo.jpg" alt="Rankviz" className="h-7 w-7 rounded object-contain" /> : <svg aria-label="Google" viewBox="0 0 48 48" className="h-6 w-6" role="img"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.97 46.98 31.8 46.98 24.55z"/><path fill="#FBBC05" d="M10.54 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>}
        {pending ? 'Connecting…' : mode === 'rankviz' ? 'Continue with Rankviz' : 'Continue with Google'}
      </button>
      {error && <p className="mt-2 text-sm text-[#c5221f]">{error}</p>}
    </div>
  );
}
