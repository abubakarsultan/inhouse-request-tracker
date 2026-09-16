'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function Login() {
  async function login() {
    const supabase = getSupabaseBrowserClient();

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <button
        onClick={login}
        className="rounded-xl bg-black text-white px-6 py-3"
      >
        Continue with Google
      </button>
    </main>
  );
}
