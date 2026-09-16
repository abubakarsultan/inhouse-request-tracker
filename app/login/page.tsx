'use client';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ERRORS: Record<string, string> = {
  domain: 'Only @rankviz.com Google accounts can sign in.',
  disabled: 'Your account has been deactivated. Contact an admin.',
  auth: 'Sign-in failed. Please try again.',
};

function LoginInner() {
  const params = useSearchParams();
  const error = params.get('error');

  async function login() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback`, queryParams: { hd: 'rankviz.com' } },
    });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-indigo-50 via-white to-slate-50">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-xl shadow-slate-200/50">
        <h1 className="text-2xl font-bold text-indigo-700">INHOUSE REQUEST</h1>
        <p className="mt-1 text-sm text-slate-400">Rankviz outreach operations</p>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-2 text-sm text-red-600">{ERRORS[error] ?? 'Something went wrong.'}</p>}
        <button
          onClick={login}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-6 py-3 font-medium text-white transition hover:bg-slate-800"
        >
          Continue with Google
        </button>
        <p className="mt-4 text-xs text-slate-400">Restricted to @rankviz.com accounts</p>
      </div>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
